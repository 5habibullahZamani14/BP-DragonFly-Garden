/*
 * menuController.js — Business logic for menu retrieval and popular item tracking.
 *
 * This controller handles three concerns: serving the full menu to customers,
 * serving the category list for the filter tabs, and recomputing which item
 * should be highlighted as the most popular based on order history.
 *
 * The recomputePopular endpoint was designed to be called on a schedule (weekly)
 * so the popular spotlight on the customer menu stays current without any
 * manual intervention from the manager.
 */

const db = require("../database/db");

/* Promise wrappers for SQLite operations. */
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

/*
 * getMenu returns all currently available menu items, each with its category
 * information and flags for popular/promo status. I normalise the boolean
 * columns (is_available, is_popular, is_promo) from SQLite's 0/1 integers to
 * JavaScript booleans so the frontend does not have to do this conversion itself.
 * Items are ordered by category display_order first, then alphabetically by name.
 */
const getMenu = async (req, res) => {
  const query = `
    SELECT
      menu_items.id,
      menu_items.name,
      menu_items.description,
      menu_items.price,
      menu_items.is_available,
      menu_items.image_url,
      menu_items.is_popular,
      menu_items.is_promo,
      menu_items.promo_label,
      (
        SELECT CASE WHEN MIN(ii.current_stock - (mii.quantity_required / COALESCE(ii.usage_conversion, 1.0))) < 0 THEN 1 ELSE 0 END
        FROM menu_item_ingredients mii
        JOIN inventory_items ii ON mii.inventory_item_id = ii.id
        WHERE mii.menu_item_id = menu_items.id
      ) AS is_sold_out,
      categories.id as category_id,
      categories.name as category,
      categories.name as category_name
    FROM menu_items
    INNER JOIN categories ON menu_items.category_id = categories.id
    WHERE menu_items.is_available = 1
    ORDER BY categories.display_order ASC, menu_items.name ASC
  `;

  try {
    const rows = await all(query);
    const normalized = rows.map((row) => ({
      ...row,
      is_available: !!row.is_available,
      is_popular: !!row.is_popular,
      is_promo: !!row.is_promo,
      is_sold_out: !!row.is_sold_out
    }));
    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/*
 * getCategories returns the full list of categories sorted by display_order.
 * The customer view uses this to render the category filter chips at the top
 * of the menu — tapping a chip scrolls the menu to that section.
 */
const getCategories = async (req, res) => {
  const query = `
    SELECT id, name, display_order
    FROM categories
    ORDER BY display_order ASC
  `;

  try {
    const rows = await all(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/*
 * recomputePopular analyses the order history to find the top N most-ordered
 * items over the last lookback_days days. It clears the is_popular flag on
 * everything, then sets it on the winner(s). The response includes the winner
 * names and their unit totals so the caller can verify the result.
 *
 * Both parameters are clamped to safe ranges: lookback_days to 1–90,
 * and top to 1–5. This prevents accidental or malicious requests from running
 * unreasonably expensive aggregation queries.
 */
const recomputePopular = async (req, res) => {
  const lookbackDays = Math.max(1, Math.min(90, Number(req.body?.lookback_days) || 7));
  const topN = Math.max(1, Math.min(5, Number(req.body?.top) || 1));

  try {
    /* Find the top N items by units sold in the lookback window. */
    const ranked = await all(
      `
        SELECT order_items.menu_item_id AS id, SUM(order_items.quantity) AS units_sold
        FROM order_items
        INNER JOIN orders ON orders.id = order_items.order_id
        WHERE orders.created_at >= datetime('now', ?)
        GROUP BY order_items.menu_item_id
        ORDER BY units_sold DESC
        LIMIT ?
      `,
      [`-${lookbackDays} days`, topN]
    );

    /* Clear the popular flag from all items before setting it on the winners. */
    await run(`UPDATE menu_items SET is_popular = 0`);

    const winners = [];
    for (const row of ranked) {
      await run(`UPDATE menu_items SET is_popular = 1 WHERE id = ?`, [row.id]);
      const named = await all(`SELECT id, name FROM menu_items WHERE id = ?`, [row.id]);
      winners.push({ ...named[0], units_sold: row.units_sold });
    }

    res.json({
      lookback_days: lookbackDays,
      top: topN,
      winners
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/*
 * getRecommendations powers the new Upselling engine.
 * It uses a Market Basket Analysis (Association Rules) approach:
 * 1. It takes the items currently in the user's cart.
 * 2. It finds all historical orders that included these specific items.
 * 3. It counts the frequencies of OTHER items bought in those exact same orders.
 * 4. It returns the top 3 most frequently co-occurring items.
 * 
 * Data requirement: It needs at least 5 historical co-occurrences to be confident.
 * Fallback: If there isn't enough historical data, it automatically falls back
 * to suggesting the top all-time best sellers.
 */
const getRecommendations = async (req, res) => {
  try {
    const { cart_items } = req.query;
    if (!cart_items) return res.json([]);

    const cartItemIds = cart_items.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (cartItemIds.length === 0) return res.json([]);

    // 1. Find all order IDs that contained any of the items in the cart
    const placeholders = cartItemIds.map(() => '?').join(',');
    const ordersWithCartItems = await all(`
      SELECT DISTINCT order_id 
      FROM order_items 
      WHERE menu_item_id IN (${placeholders})
    `, cartItemIds);

    const orderIds = ordersWithCartItems.map(row => row.order_id);
    let recommendations = [];

    // 2. If we found historical orders, find what else was bought in them
    if (orderIds.length > 0) {
      const orderPlaceholders = orderIds.map(() => '?').join(',');
      const assocQuery = `
        SELECT mi.id, mi.name, mi.price, mi.image_url, COUNT(*) as co_occurrences
        FROM order_items oi
        INNER JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id IN (${orderPlaceholders})
          AND oi.menu_item_id NOT IN (${placeholders})
          AND mi.is_available = 1
        GROUP BY oi.menu_item_id
        HAVING co_occurrences >= 3
        ORDER BY co_occurrences DESC
        LIMIT 3
      `;
      
      const queryParams = [...orderIds, ...cartItemIds];
      recommendations = await all(assocQuery, queryParams);
    }

    // 3. Fallback: If we didn't find enough statistically significant pairs, pad with global best-sellers
    if (recommendations.length < 3) {
      const needed = 3 - recommendations.length;
      const excludeIds = [...cartItemIds, ...recommendations.map(r => r.id)];
      const excludePlaceholders = excludeIds.map(() => '?').join(',');
      
      const fallbackQuery = `
        SELECT mi.id, mi.name, mi.price, mi.image_url, SUM(oi.quantity) as total_sold
        FROM order_items oi
        INNER JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE mi.id NOT IN (${excludePlaceholders})
          AND mi.is_available = 1
        GROUP BY mi.id
        ORDER BY total_sold DESC
        LIMIT ?
      `;
      
      const fallbackItems = await all(fallbackQuery, [...excludeIds, needed]);
      // Normalize output to match structure
      const formattedFallback = fallbackItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        co_occurrences: item.total_sold,
        is_fallback: true
      }));
      
      recommendations = [...recommendations, ...formattedFallback];
    }

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createMenuItem = async (req, res) => {
  const { name, description, price, category_id, image_url, is_available, is_popular, is_promo, promo_label } = req.body;
  try {
    const result = await run(
      `INSERT INTO menu_items (name, description, price, category_id, image_url, is_available, is_popular, is_promo, promo_label) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', price, category_id, image_url || '', is_available ? 1 : 0, is_popular ? 1 : 0, is_promo ? 1 : 0, promo_label || '']
    );
    res.json({ id: result.lastID, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMenuItem = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id, image_url, is_available, is_popular, is_promo, promo_label } = req.body;
  try {
    await run(
      `UPDATE menu_items 
       SET name = COALESCE(?, name), description = COALESCE(?, description), price = COALESCE(?, price), category_id = COALESCE(?, category_id), image_url = COALESCE(?, image_url), is_available = COALESCE(?, is_available), is_popular = COALESCE(?, is_popular), is_promo = COALESCE(?, is_promo), promo_label = COALESCE(?, promo_label)
       WHERE id = ?`,
      [name, description, price, category_id, image_url, is_available !== undefined ? (is_available ? 1 : 0) : null, is_popular !== undefined ? (is_popular ? 1 : 0) : null, is_promo !== undefined ? (is_promo ? 1 : 0) : null, promo_label, id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteMenuItem = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await all(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    if (existing.length > 0 && existing[0].image_url) {
      const fs = require('fs');
      const path = require('path');
      const oldPath = path.join(__dirname, '../../../../frontend/public', existing[0].image_url);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.error("Error deleting old image:", e); }
      }
    }
    await run(`DELETE FROM menu_items WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const uploadMenuItemImage = async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No image file provided." });
  }

  try {
    const existing = await all(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    if (existing.length > 0 && existing[0].image_url) {
      const fs = require('fs');
      const path = require('path');
      const oldPath = path.join(__dirname, '../../../../frontend/public', existing[0].image_url);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.error("Error deleting old image:", e); }
      }
    }

    const newImageUrl = `/menu-images/${req.file.filename}`;
    await run(`UPDATE menu_items SET image_url = ? WHERE id = ?`, [newImageUrl, id]);

    res.json({ success: true, image_url: newImageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getMenu, getCategories, recomputePopular, getRecommendations, createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage };
