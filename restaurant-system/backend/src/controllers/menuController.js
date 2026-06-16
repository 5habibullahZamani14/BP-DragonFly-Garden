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

const fs = require("fs");
const path = require("path");

// Broadcast function for WebSocket events
let broadcastFn = null;
const setBroadcast = (fn) => { broadcastFn = fn; };
const getBroadcast = () => broadcastFn;

/** Remove a menu image file only when no other menu item still references it. */
const deleteMenuImageIfUnused = async (imageUrl, excludeItemId = null) => {
  if (!imageUrl || !imageUrl.startsWith("/menu-images/")) return;

  const params = [imageUrl];
  let sql = `SELECT id FROM menu_items WHERE image_url = ?`;
  if (excludeItemId != null) {
    sql += ` AND id != ?`;
    params.push(excludeItemId);
  }

  const stillUsed = await all(sql, params);
  if (stillUsed.length > 0) return;

  const filePath = path.join(__dirname, "../../../../frontend/public", imageUrl);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error("Error deleting menu image:", e);
    }
  }
};

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
      menu_items.pattern_id,
      patterns.image_url AS pattern_image_url,
      patterns.name AS pattern_name,
      menu_items.is_popular,
      menu_items.is_promo,
      menu_items.promo_label,
      menu_items.card_size,
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
    LEFT JOIN patterns ON menu_items.pattern_id = patterns.id
    INNER JOIN categories ON menu_items.category_id = categories.id
    WHERE menu_items.is_available = 1
    ORDER BY categories.display_order ASC, menu_items.name ASC
  `;

  try {
    const settingsRows = await all(`SELECT value FROM restaurant_settings WHERE key = ?`, ["default_pattern_id"]);
    let defaultPatternImage = null;
    if (settingsRows.length > 0) {
      const parsedId = parseInt(settingsRows[0].value, 10);
      if (!Number.isNaN(parsedId)) {
        const patternRows = await all(`SELECT image_url FROM patterns WHERE id = ?`, [parsedId]);
        if (patternRows.length > 0) defaultPatternImage = patternRows[0].image_url;
      }
    }

    const rows = await all(query);
    const normalized = rows.map((row) => ({
      ...row,
      is_available: !!row.is_available,
      is_popular: !!row.is_popular,
      is_promo: !!row.is_promo,
      is_sold_out: !!row.is_sold_out,
      card_size: row.card_size || 'normal',
      default_pattern_image_url: defaultPatternImage,
    }));

    // Attach global modifier groups (assigned to each item) + their options
    if (normalized.length > 0) {
      const itemIds = normalized.map(r => r.id);
      const ph = itemIds.map(() => '?').join(',');

      // Fetch all assignments for these items in one query
      const assignments = await all(
        `SELECT ima.menu_item_id, ima.modifier_group_id, ima.default_option_id,
                mg.name, mg.is_required, mg.is_multi_select
         FROM item_modifier_assignments ima
         JOIN modifier_groups mg ON mg.id = ima.modifier_group_id
         WHERE ima.menu_item_id IN (${ph})
         ORDER BY ima.menu_item_id, mg.name`,
        itemIds
      );

      let options = [];
      if (assignments.length > 0) {
        const groupIds = [...new Set(assignments.map(a => a.modifier_group_id))];
        const gph = groupIds.map(() => '?').join(',');
        options = await all(
          `SELECT * FROM modifier_options WHERE group_id IN (${gph}) ORDER BY group_id, sort_order`,
          groupIds
        );
      }

      return res.json(normalized.map(item => ({
        ...item,
        option_groups: assignments
          .filter(a => a.menu_item_id === item.id)
          .map(a => ({
            id: a.modifier_group_id,
            name: a.name,
            is_required: !!a.is_required,
            is_multi_select: !!a.is_multi_select,
            default_option_id: a.default_option_id,
            options: options.filter(o => o.group_id === a.modifier_group_id)
          }))
      })));
    }

    res.json(normalized.map(item => ({ ...item, option_groups: [] })));
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
  const { name, description, price, category_id, image_url, pattern_id, is_available, is_popular, is_promo, promo_label, card_size } = req.body;
  try {
    const result = await run(
      `INSERT INTO menu_items (name, description, price, category_id, image_url, pattern_id, is_available, is_popular, is_promo, promo_label, card_size) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', price, category_id, image_url || '', pattern_id || null, is_available ? 1 : 0, is_popular ? 1 : 0, is_promo ? 1 : 0, promo_label || '', card_size || 'normal']
    );
    
    // Emit WebSocket event for menu update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "MENU_UPDATE", payload: { id: result.lastID } });
    }
    
    res.json({ id: result.lastID, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMenuItem = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id, image_url, pattern_id, is_available, is_popular, is_promo, promo_label, card_size } = req.body;
  try {
    await run(
      `UPDATE menu_items 
       SET name = COALESCE(?, name), description = COALESCE(?, description), price = COALESCE(?, price), category_id = COALESCE(?, category_id), image_url = COALESCE(?, image_url), pattern_id = COALESCE(?, pattern_id), is_available = COALESCE(?, is_available), is_popular = COALESCE(?, is_popular), is_promo = COALESCE(?, is_promo), promo_label = COALESCE(?, promo_label), card_size = COALESCE(?, card_size)
       WHERE id = ?`,
      [name, description, price, category_id, image_url, pattern_id !== undefined ? pattern_id : null, is_available !== undefined ? (is_available ? 1 : 0) : null, is_popular !== undefined ? (is_popular ? 1 : 0) : null, is_promo !== undefined ? (is_promo ? 1 : 0) : null, promo_label, card_size, id]
    );
    
    // Emit WebSocket event for menu update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "MENU_UPDATE", payload: { id } });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteMenuItem = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await all(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    const oldImageUrl = existing.length > 0 ? existing[0].image_url : null;
    await run(`DELETE FROM menu_items WHERE id = ?`, [id]);
    if (oldImageUrl) {
      await deleteMenuImageIfUnused(oldImageUrl);
    }
    
    // Emit WebSocket event for menu update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "MENU_UPDATE", payload: { id } });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** applyDefaultCardSize — Bulk update all menu items to a given card size (management action) */
const applyDefaultCardSize = async (req, res) => {
  const { card_size } = req.body;
  const allowed = ["normal", "large", "extra_large"];
  if (!allowed.includes(card_size)) return res.status(400).json({ error: "Invalid card_size" });
  try {
    await run(`UPDATE menu_items SET card_size = ?`, [card_size]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: "MENU_UPDATE", payload: { action: "card_size_applied" } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const uploadMenuItemImage = async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No image file provided." });
  }

  try {
    const existing = await all(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    const oldImageUrl = existing.length > 0 ? existing[0].image_url : null;

    const newImageUrl = `/menu-images/${req.file.filename}`;
    await run(`UPDATE menu_items SET image_url = ? WHERE id = ?`, [newImageUrl, id]);

    if (oldImageUrl && oldImageUrl !== newImageUrl) {
      await deleteMenuImageIfUnused(oldImageUrl, id);
    }

    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "MENU_UPDATE", payload: { id } });
    }

    res.json({ success: true, image_url: newImageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createPattern = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No pattern image provided." });
  }

  try {
    const imageUrl = `/menu-images/${req.file.filename}`;
    const patternName = req.body.name ? String(req.body.name).trim() : `pattern-${Date.now()}`;
    const result = await run(
      `INSERT INTO patterns (name, image_url) VALUES (?, ?)`,
      [patternName || `pattern-${Date.now()}`, imageUrl]
    );

    const pattern = { id: result.lastID, name: patternName, image_url: imageUrl };
    res.json({ success: true, pattern });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPatterns = async (req, res) => {
  try {
    const rows = await all(`SELECT id, name, image_url FROM patterns ORDER BY created_at DESC`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deletePatternImageIfUnused = async (imageUrl, excludePatternId = null) => {
  if (!imageUrl || !imageUrl.startsWith("/menu-images/")) return;

  const params = [imageUrl];
  let sql = `SELECT id FROM patterns WHERE image_url = ?`;
  if (excludePatternId != null) {
    sql += ` AND id != ?`;
    params.push(excludePatternId);
  }

  const stillUsed = await all(sql, params);
  if (stillUsed.length > 0) return;

  const filePath = path.join(__dirname, "../../../../frontend/public", imageUrl);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error("Error deleting pattern image:", e);
    }
  }
};

const deletePattern = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await all(`SELECT image_url FROM patterns WHERE id = ?`, [id]);
    const oldImageUrl = existing.length > 0 ? existing[0].image_url : null;
    await run(`UPDATE menu_items SET pattern_id = NULL WHERE pattern_id = ?`, [id]);
    await run(`DELETE FROM patterns WHERE id = ?`, [id]);
    if (oldImageUrl) {
      await deletePatternImageIfUnused(oldImageUrl, id);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const uploadMenuItemPatternImage = async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No pattern image provided." });
  }

  try {
    const existing = await all(`SELECT pattern_id FROM menu_items WHERE id = ?`, [id]);
    const oldPatternId = existing.length > 0 ? existing[0].pattern_id : null;
    const imageUrl = `/menu-images/${req.file.filename}`;

    const patternResult = await run(
      `INSERT INTO patterns (name, image_url) VALUES (?, ?)`,
      [req.body.name || `pattern-${Date.now()}`, imageUrl]
    );

    await run(`UPDATE menu_items SET pattern_id = ? WHERE id = ?`, [patternResult.lastID, id]);

    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "MENU_UPDATE", payload: { id } });
    }

    res.json({ success: true, pattern_id: patternResult.lastID, image_url: imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMenuItemPattern = async (req, res) => {
  const { id } = req.params;
  const { pattern_id } = req.body;

  try {
    await run(`UPDATE menu_items SET pattern_id = ? WHERE id = ?`, [pattern_id || null, id]);

    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "MENU_UPDATE", payload: { id } });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/*
 * createCategory — Adds a new menu section. display_order is assigned as the
 * current maximum + 1 so new sections always appear at the bottom of the list.
 */
const createCategory = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Category name is required." });
  }
  try {
    const maxRow = await all(`SELECT MAX(display_order) as maxOrder FROM categories`);
    const nextOrder = (maxRow[0]?.maxOrder ?? 0) + 1;
    const result = await run(
      `INSERT INTO categories (name, display_order) VALUES (?, ?)`,
      [name.trim(), nextOrder]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: "MENU_UPDATE", payload: { action: "category_created" } });
    res.json({ id: result.lastID, name: name.trim(), display_order: nextOrder });
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "A section with that name already exists." });
    }
    res.status(500).json({ error: error.message });
  }
};

/*
 * updateCategory — Renames a category and/or changes its display_order.
 * At least one of name or display_order must be provided.
 */
const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, display_order } = req.body;
  try {
    if (name !== undefined) {
      await run(`UPDATE categories SET name = ? WHERE id = ?`, [name.trim(), id]);
    }
    if (display_order !== undefined) {
      await run(`UPDATE categories SET display_order = ? WHERE id = ?`, [display_order, id]);
    }
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: "MENU_UPDATE", payload: { action: "category_updated", id } });
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "A section with that name already exists." });
    }
    res.status(500).json({ error: error.message });
  }
};

/*
 * deleteCategory — Deletes a category. Items that belonged to it are silently
 * moved to the first remaining category (lowest display_order) so they stay
 * visible in the menu without any "Uncategorised" concept being introduced.
 * If this is the last category, deletion is blocked — the schema requires
 * every menu item to have a category_id.
 */
const deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    // Find the first remaining category that is NOT the one being deleted
    const remaining = await all(
      `SELECT id, name FROM categories WHERE id != ? ORDER BY display_order ASC LIMIT 1`,
      [id]
    );

    if (remaining.length === 0) {
      return res.status(400).json({
        error: "Cannot delete the only remaining section. Create another section first."
      });
    }

    const fallbackId = remaining[0].id;

    // Silently reassign items from the deleted category to the fallback
    await run(`UPDATE menu_items SET category_id = ? WHERE category_id = ?`, [fallbackId, id]);

    // Delete the category
    await run(`DELETE FROM categories WHERE id = ?`, [id]);

    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: "MENU_UPDATE", payload: { action: "category_deleted", id } });
    res.json({ success: true, fallback_category_id: fallbackId, fallback_name: remaining[0].name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


/*
 * reorderCategories — Accepts an array of { id, display_order } objects and
 * updates each category's display_order in a single transaction. This is called
 * when the manager drags or uses arrow buttons to change section ordering.
 */
const reorderCategories = async (req, res) => {
  const { order } = req.body; // [{ id, display_order }, ...]
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: "order array is required." });
  }
  try {
    for (const item of order) {
      await run(`UPDATE categories SET display_order = ? WHERE id = ?`, [item.display_order, item.id]);
    }
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: "MENU_UPDATE", payload: { action: "categories_reordered" } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Global Modifier Library ───────────────────────────────────────────────────

/**
 * getAllModifierGroups — Returns all global modifier groups with their options,
 * plus a list of menu_item_ids each group is currently assigned to.
 * Used by the management Variations editor to show the full tag library.
 */
const getAllModifierGroups = async (req, res) => {
  try {
    const groups = await all(
      `SELECT * FROM modifier_groups ORDER BY name ASC`
    );
    if (groups.length === 0) return res.json([]);

    const gph = groups.map(() => '?').join(',');
    const groupIds = groups.map(g => g.id);

    const [options, assignments] = await Promise.all([
      all(`SELECT * FROM modifier_options WHERE group_id IN (${gph}) ORDER BY group_id, sort_order`, groupIds),
      all(`SELECT modifier_group_id, menu_item_id, default_option_id FROM item_modifier_assignments WHERE modifier_group_id IN (${gph})`, groupIds),
    ]);

    res.json(groups.map(g => ({
      ...g,
      is_required: !!g.is_required,
      is_multi_select: !!g.is_multi_select,
      options: options.filter(o => o.group_id === g.id),
      assignments: assignments.filter(a => a.modifier_group_id === g.id)
    })));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** getItemModifiers — Get the assigned modifiers (with defaults) for one item. */
const getItemModifiers = async (req, res) => {
  const { id } = req.params;
  try {
    const assignments = await all(
      `SELECT ima.modifier_group_id, ima.default_option_id,
              mg.name, mg.is_required, mg.is_multi_select
       FROM item_modifier_assignments ima
       JOIN modifier_groups mg ON mg.id = ima.modifier_group_id
       WHERE ima.menu_item_id = ?
       ORDER BY mg.name`,
      [id]
    );
    if (assignments.length === 0) return res.json([]);

    const groupIds = assignments.map(a => a.modifier_group_id);
    const gph = groupIds.map(() => '?').join(',');
    const options = await all(
      `SELECT * FROM modifier_options WHERE group_id IN (${gph}) ORDER BY group_id, sort_order`,
      groupIds
    );
    res.json(assignments.map(a => ({
      id: a.modifier_group_id,
      name: a.name,
      is_required: !!a.is_required,
      is_multi_select: !!a.is_multi_select,
      default_option_id: a.default_option_id,
      options: options.filter(o => o.group_id === a.modifier_group_id)
    })));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** createModifierGroup — Creates a new global modifier group (not item-specific). */
const createModifierGroup = async (req, res) => {
  const { name, is_required = 1, is_multi_select = 0 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  try {
    const result = await run(
      `INSERT INTO modifier_groups (name, is_required, is_multi_select) VALUES (?, ?, ?)`,
      [name.trim(), is_required ? 1 : 0, is_multi_select ? 1 : 0]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_group_created' } });
    res.json({ id: result.lastID, name: name.trim(), is_required: !!is_required, is_multi_select: !!is_multi_select, options: [], assignments: [] });
  } catch (error) {
    if (error.message?.includes('UNIQUE')) return res.status(409).json({ error: 'A modifier group with that name already exists.' });
    res.status(500).json({ error: error.message });
  }
};

/** updateModifierGroup — Renames / toggles required or multi-select on a global group. */
const updateModifierGroup = async (req, res) => {
  const { groupId } = req.params;
  const { name, is_required, is_multi_select } = req.body;
  try {
    if (name !== undefined) await run(`UPDATE modifier_groups SET name = ? WHERE id = ?`, [name.trim(), groupId]);
    if (is_required !== undefined) await run(`UPDATE modifier_groups SET is_required = ? WHERE id = ?`, [is_required ? 1 : 0, groupId]);
    if (is_multi_select !== undefined) await run(`UPDATE modifier_groups SET is_multi_select = ? WHERE id = ?`, [is_multi_select ? 1 : 0, groupId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_group_updated' } });
    res.json({ success: true });
  } catch (error) {
    if (error.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Name already in use.' });
    res.status(500).json({ error: error.message });
  }
};

/** deleteModifierGroup — Deletes a global group and all its options + assignments (CASCADE). */
const deleteModifierGroup = async (req, res) => {
  const { groupId } = req.params;
  try {
    // Enable FK cascades
    await run(`PRAGMA foreign_keys = ON`);
    await run(`DELETE FROM modifier_groups WHERE id = ?`, [groupId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_group_deleted' } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** createModifierOption — Adds an option to a global modifier group. */
const createModifierOption = async (req, res) => {
  const { groupId } = req.params;
  const { label, price_delta = 0 } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required.' });
  try {
    const maxRow = await all(`SELECT MAX(sort_order) as m FROM modifier_options WHERE group_id = ?`, [groupId]);
    const order = (maxRow[0]?.m ?? 0) + 1;
    const result = await run(
      `INSERT INTO modifier_options (group_id, label, price_delta, sort_order) VALUES (?, ?, ?, ?)`,
      [groupId, label.trim(), parseFloat(price_delta) || 0, order]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_option_created' } });
    res.json({ id: result.lastID, group_id: parseInt(groupId), label: label.trim(), price_delta: parseFloat(price_delta) || 0, sort_order: order });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** updateModifierOption — Edits label/price_delta on a global modifier option. */
const updateModifierOption = async (req, res) => {
  const { optionId } = req.params;
  const { label, price_delta } = req.body;
  try {
    if (label !== undefined) await run(`UPDATE modifier_options SET label = ? WHERE id = ?`, [label.trim(), optionId]);
    if (price_delta !== undefined) await run(`UPDATE modifier_options SET price_delta = ? WHERE id = ?`, [parseFloat(price_delta) || 0, optionId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_option_updated' } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** deleteModifierOption — Removes a global option. Also NULLs any default_option_id references. */
const deleteModifierOption = async (req, res) => {
  const { optionId } = req.params;
  try {
    await run(`UPDATE item_modifier_assignments SET default_option_id = NULL WHERE default_option_id = ?`, [optionId]);
    await run(`DELETE FROM modifier_options WHERE id = ?`, [optionId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_option_deleted' } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** assignModifierGroup — Tags a global modifier group onto a specific menu item. */
const assignModifierGroup = async (req, res) => {
  const { itemId } = req.params;
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId is required.' });
  try {
    await run(
      `INSERT OR IGNORE INTO item_modifier_assignments (menu_item_id, modifier_group_id) VALUES (?, ?)`,
      [itemId, groupId]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_assigned' } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** unassignModifierGroup — Removes the tag (assignment) from this item only; global group is kept. */
const unassignModifierGroup = async (req, res) => {
  const { itemId, groupId } = req.params;
  try {
    await run(
      `DELETE FROM item_modifier_assignments WHERE menu_item_id = ? AND modifier_group_id = ?`,
      [itemId, groupId]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_unassigned' } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/** setDefaultOption — Sets (or clears) the pre-selected default option for a modifier on a specific item. */
const setDefaultOption = async (req, res) => {
  const { itemId, groupId } = req.params;
  const { optionId } = req.body; // null to clear
  try {
    await run(
      `UPDATE item_modifier_assignments SET default_option_id = ? WHERE menu_item_id = ? AND modifier_group_id = ?`,
      [optionId ?? null, itemId, groupId]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'modifier_default_set' } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// Legacy item option groups support (old per-item option system)
const createOptionGroup = async (req, res) => {
  const { id } = req.params;
  const { name, is_required = 1, is_multi_select = 0 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  try {
    const maxRow = await all(`SELECT MAX(display_order) as m FROM item_option_groups WHERE menu_item_id = ?`, [id]);
    const order = (maxRow[0]?.m ?? 0) + 1;
    const result = await run(
      `INSERT INTO item_option_groups (menu_item_id, name, is_required, is_multi_select, display_order) VALUES (?, ?, ?, ?, ?)`,
      [id, name.trim(), is_required ? 1 : 0, is_multi_select ? 1 : 0, order]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'option_group_created', menu_item_id: Number(id) } });
    res.json({ id: result.lastID, menu_item_id: Number(id), name: name.trim(), is_required: !!is_required, is_multi_select: !!is_multi_select, display_order: order, options: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateOptionGroup = async (req, res) => {
  const { groupId } = req.params;
  const { name, is_required, is_multi_select } = req.body;
  try {
    if (name !== undefined) await run(`UPDATE item_option_groups SET name = ? WHERE id = ?`, [name.trim(), groupId]);
    if (is_required !== undefined) await run(`UPDATE item_option_groups SET is_required = ? WHERE id = ?`, [is_required ? 1 : 0, groupId]);
    if (is_multi_select !== undefined) await run(`UPDATE item_option_groups SET is_multi_select = ? WHERE id = ?`, [is_multi_select ? 1 : 0, groupId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'option_group_updated', group_id: Number(groupId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteOptionGroup = async (req, res) => {
  const { groupId } = req.params;
  try {
    await run(`DELETE FROM item_option_groups WHERE id = ?`, [groupId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'option_group_deleted', group_id: Number(groupId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createOption = async (req, res) => {
  const { groupId } = req.params;
  const { label, price_delta = 0 } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required.' });
  try {
    const maxRow = await all(`SELECT MAX(display_order) as m FROM item_options WHERE group_id = ?`, [groupId]);
    const order = (maxRow[0]?.m ?? 0) + 1;
    const result = await run(
      `INSERT INTO item_options (group_id, label, price_delta, display_order) VALUES (?, ?, ?, ?)`,
      [groupId, label.trim(), parseFloat(price_delta) || 0, order]
    );
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'option_created', group_id: Number(groupId) } });
    res.json({ id: result.lastID, group_id: Number(groupId), label: label.trim(), price_delta: parseFloat(price_delta) || 0, display_order: order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateOption = async (req, res) => {
  const { optionId } = req.params;
  const { label, price_delta } = req.body;
  try {
    if (label !== undefined) await run(`UPDATE item_options SET label = ? WHERE id = ?`, [label.trim(), optionId]);
    if (price_delta !== undefined) await run(`UPDATE item_options SET price_delta = ? WHERE id = ?`, [parseFloat(price_delta) || 0, optionId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'option_updated', option_id: Number(optionId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteOption = async (req, res) => {
  const { optionId } = req.params;
  try {
    await run(`DELETE FROM item_options WHERE id = ?`, [optionId]);
    const broadcast = getBroadcast();
    if (broadcast) broadcast({ type: 'MENU_UPDATE', payload: { action: 'option_deleted', option_id: Number(optionId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getItemOptions = async (req, res) => {
  const { id } = req.params;
  try {
    const groups = await all(
      `SELECT * FROM item_option_groups WHERE menu_item_id = ? ORDER BY display_order ASC`,
      [id]
    );

    if (groups.length > 0) {
      const gph = groups.map(() => '?').join(',');
      const options = await all(
        `SELECT * FROM item_options WHERE group_id IN (${gph}) ORDER BY group_id, display_order`,
        groups.map(g => g.id)
      );

      return res.json(groups.map(group => ({
        ...group,
        is_required: !!group.is_required,
        is_multi_select: !!group.is_multi_select,
        options: options.filter(option => option.group_id === group.id)
      })));
    }

    return getItemModifiers(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMenu, getCategories, recomputePopular, getRecommendations,
  createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage,
  createPattern, getPatterns, deletePattern,
  uploadMenuItemPatternImage, updateMenuItemPattern,
  setBroadcast,
  createCategory, updateCategory, deleteCategory, reorderCategories,
  // Global modifier library
  getAllModifierGroups, getItemModifiers, getItemOptions,
  createModifierGroup, updateModifierGroup, deleteModifierGroup,
  createModifierOption, updateModifierOption, deleteModifierOption,
  assignModifierGroup, unassignModifierGroup, setDefaultOption,
  // Legacy item option groups
  createOptionGroup, updateOptionGroup, deleteOptionGroup,
  createOption, updateOption, deleteOption,
  applyDefaultCardSize,
};



