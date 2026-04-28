const db = require("../database/db");

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

const recomputePopular = async (req, res) => {
  const lookbackDays = Math.max(1, Math.min(90, Number(req.body?.lookback_days) || 7));
  const topN = Math.max(1, Math.min(5, Number(req.body?.top) || 1));

  try {
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
