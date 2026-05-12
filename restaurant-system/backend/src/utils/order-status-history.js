/*
 * order-status-history.js — Utilities for recording and querying order status changes.
 *
 * I wrote this module to keep all the status-history SQL in one place. Every
 * time an order's status changes, the controller calls recordStatusChange to
 * insert a timestamped row into the order_status_history table. This gives
 * both the kitchen crew and the manager a complete audit trail of how each
 * order moved through the system.
 *
 * The query helpers (run, all) are defined locally here because this module
 * does not need the full set of helpers used in the controllers. Keeping them
 * self-contained avoids a shared utility import that would add coupling.
 */

const db = require("../database/db");

/* Promise wrapper for db.run — used for INSERT statements. */
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

/* Promise wrapper for db.all — used for SELECT statements that return multiple rows. */
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

/*
 * recordStatusChange inserts a new row into order_status_history whenever
 * an order's status changes. The changedBy parameter identifies who or what
 * triggered the change — for example "kitchen" when a crew member updates
 * status, or "system" for automated archiving.
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

/*
 * getStatusHistory returns the full list of status changes for a given order,
 * ordered chronologically. This is used when displaying the order timeline
 * to the customer or in the management audit logs.
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

/*
 * getLatestStatusChange returns only the most recent status change for an
 * order. This is more efficient than fetching the full history when you only
 * need to know the current state.
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

/*
 * getOrdersChangedSince returns the IDs of all orders that had a status
 * change after the given datetime. The polling-based update flow used
 * before WebSockets were introduced relied on this function — it is kept
 * here in case it proves useful for diagnostics or future features.
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

/*
 * getOrdersByStatus returns all active orders grouped by their current status.
 * The optional changedAfter parameter can limit results to orders that have
 * changed since a given time, which was useful during the polling phase of
 * development before WebSocket push was in place.
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
