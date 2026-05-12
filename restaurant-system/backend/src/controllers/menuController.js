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
      is_promo: !!row.is_promo
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

module.exports = { getMenu, getCategories, recomputePopular };
