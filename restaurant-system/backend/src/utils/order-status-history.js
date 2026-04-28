/**
 * Order Status History Utilities
 * Handles recording and retrieving order status changes
 */

const db = require("../database/db");

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

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

/**
 * Record an order status change in history
 * @param {number} orderId - The ID of the order
 * @param {string} newStatus - The new status
 * @param {string} changedBy - Optional identifier of who made the change (e.g., "kitchen", "system")
 */
const recordStatusChange = async (orderId, newStatus, changedBy = "system") => {
  await run(
    `
      INSERT INTO order_status_history (order_id, status, changed_by)
      VALUES (?, ?, ?)
    `,
    [orderId, newStatus, changedBy]
  );
};

/**
 * Get the status history for an order
 * @param {number} orderId - The ID of the order
 * @returns {Promise<Array>} Array of status changes in chronological order
 */
const getStatusHistory = async (orderId) => {
  const history = await all(
    `
      SELECT
        id,
        order_id,
        status,
        changed_at,
        changed_by
      FROM order_status_history
      WHERE order_id = ?
      ORDER BY changed_at ASC
    `,
    [orderId]
  );

  return history || [];
};

/**
 * Get the latest status change for an order
 * @param {number} orderId - The ID of the order
 * @returns {Promise<Object|null>} The latest status change record or null
 */
const getLatestStatusChange = async (orderId) => {
  const latestChange = await all(
    `
      SELECT
        id,
        order_id,
        status,
        changed_at,
        changed_by
      FROM order_status_history
      WHERE order_id = ?
      ORDER BY changed_at DESC
      LIMIT 1
    `,
    [orderId]
  );

  return latestChange && latestChange.length > 0 ? latestChange[0] : null;
};

/**
 * Get all orders that have changed status since a given time
 * Useful for real-time updates on the customer/kitchen side
 * @param {string} sinceTime - ISO datetime string or DATETIME format
 * @returns {Promise<Array>} Array of distinct order IDs that changed since the time
 */
const getOrdersChangedSince = async (sinceTime) => {
  const orders = await all(
    `
      SELECT DISTINCT order_id
      FROM order_status_history
      WHERE changed_at > ?
      ORDER BY changed_at DESC
    `,
    [sinceTime]
  );

  return orders ? orders.map((o) => o.order_id) : [];
};

/**
 * Get orders grouped by current status (useful for kitchen dashboard)
 * @param {string} changedAfter - Optional: only show changes after this datetime
 * @returns {Promise<Object>} Object with status as key and array of orders as value
 */
const getOrdersByStatus = async (changedAfter = null) => {
  let query = `
    SELECT DISTINCT
      o.id,
      o.table_id,
      t.table_number,
      o.status,
      o.created_at,
      o.total_price,
      (SELECT changed_at FROM order_status_history WHERE order_id = o.id ORDER BY changed_at DESC LIMIT 1) as last_status_change
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
  `;

  const params = [];

  if (changedAfter) {
    query += `
      WHERE o.id IN (
        SELECT DISTINCT order_id FROM order_status_history WHERE changed_at > ?
      )
    `;
    params.push(changedAfter);
  }

  query += ` ORDER BY last_status_change DESC`;

  const orders = await all(query, params);
  return orders || [];
};

module.exports = {
  recordStatusChange,
  getStatusHistory,
  getLatestStatusChange,
  getOrdersChangedSince,
  getOrdersByStatus
};
