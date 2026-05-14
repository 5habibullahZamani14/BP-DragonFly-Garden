/*
 * orderController.js — Business logic for all order operations.
 *
 * This controller handles the complete order lifecycle: creation, status
 * updates, archiving, and retrieval in various formats for the different
 * views (customer, kitchen, management). The most important function here
 * is createOrder, which uses a database transaction to ensure that the order
 * row and all its item rows are written atomically — if any insert fails,
 * the whole order is rolled back so the database never ends up in a partial state.
 *
 * A few design decisions worth noting:
 *   - Inventory is deducted at order creation time, not when the order is served.
 *     This was the simplest approach that gives the manager useful stock tracking.
 *   - Order status can be updated at two levels: the overall order status
 *     (queue/preparing/ready) and individual item statuses. The overall status
 *     is automatically derived from the item statuses by deriveOrderStatus.
 *   - "Archiving" is a soft operation: it just timestamps two nullable columns
 *     (customer_archived_at and kitchen_archived_at). The order data stays in
 *     the database so the payment counter can still access it.
 */

const db = require("../database/db");

/* Standard Promise wrappers for the three SQLite operations used in this file. */
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

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

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

/*
 * fetchOrderById is a shared helper used by almost every function in this file.
 * It fetches a single order with all its items in one consistent shape. Having
 * this helper means every function that returns order data returns the same
 * structure, so the frontend only needs to handle one format.
 */
const fetchOrderById = async (orderId) => {
  const order = await get(
    `
      SELECT
        o.id,
        o.table_id,
        t.table_number,
        t.qr_code,
        o.status,
        o.total_price,
        o.created_at
      FROM orders o
      INNER JOIN tables t ON t.id = o.table_id
      WHERE o.id = ?
    `,
    [orderId]
  );

  if (!order) {
    return null;
  }

  const items = await all(
    `
      SELECT
        oi.id,
        oi.menu_item_id,
        oi.quantity,
        oi.price_at_order_time,
        oi.notes,
        oi.item_status,
        mi.name AS item_name,
        mi.description AS item_description
      FROM order_items oi
      INNER JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
    `,
    [orderId]
  );

  return {
    ...order,
    items
  };
};

/*
 * createOrder handles the full order creation flow inside a SQLite transaction.
 * The steps are:
 *   1. Verify the table exists.
 *   2. Fetch all referenced menu items in one query and build a lookup map.
 *   3. Validate that every item is available.
 *   4. Calculate the total price.
 *   5. Insert the order row.
 *   6. Insert each order_item row.
 *   7. For each item, deduct its ingredients from inventory and log the deduction.
 *   8. Commit the transaction and return the full order object.
 * If any step throws, the transaction is rolled back.
 */
const createOrder = async (orderData) => {
  const { table_id: tableId, items } = orderData;
  const table = await get(`SELECT id, table_number, qr_code FROM tables WHERE id = ?`, [tableId]);

  if (!table) {
    throw new Error("Table not found");
  }

  /* Fetch all referenced menu items in a single query using an IN clause. */
  const uniqueMenuItemIds = [...new Set(items.map((item) => item.menu_item_id))];
  const placeholders = uniqueMenuItemIds.map(() => "?").join(", ");
  const menuItems = await all(
    `
      SELECT id, name, price, is_available
      FROM menu_items
      WHERE id IN (${placeholders})
    `,
    uniqueMenuItemIds
  );

  /* Build a Map for O(1) lookup of each menu item during the order insertion loop. */
  const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));

  /* Validate availability before opening the transaction. */
  for (const item of items) {
    const menuItem = menuItemMap.get(item.menu_item_id);

    if (!menuItem) {
      throw new Error(`Menu item ${item.menu_item_id} not found`);
    }

    if (!menuItem.is_available) {
      throw new Error(`${menuItem.name} is currently unavailable`);
    }
  }

  await run("BEGIN TRANSACTION");

  try {
    /* Calculate the additional price by summing quantity × price for each line item. */
    const additionalPrice = Number(
      items
        .reduce((total, item) => {
          const menuItem = menuItemMap.get(item.menu_item_id);
          return total + menuItem.price * item.quantity;
        }, 0)
        .toFixed(2)
    );

    let orderId;
    let isAddOn = false;

    const activeOrder = await get(`SELECT id, total_price FROM orders WHERE table_id = ? AND payment_status = 'unpaid'`, [tableId]);

    if (activeOrder) {
      isAddOn = true;
      orderId = activeOrder.id;
      const newTotal = Number((activeOrder.total_price + additionalPrice).toFixed(2));
      await run(`UPDATE orders SET total_price = ?, status = 'queue' WHERE id = ?`, [newTotal, orderId]);
    } else {
      /* Insert the parent order row with status "queue". */
      const orderInsert = await run(
        `
          INSERT INTO orders (table_id, status, total_price, payment_status)
          VALUES (?, ?, ?, 'unpaid')
        `,
        [tableId, "queue", additionalPrice]
      );
      orderId = orderInsert.lastID;
    }

    const insertedOrderItems = [];

    /* Insert each item and deduct its ingredients from inventory. */
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);

      const itemInsert = await run(
        `
          INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes)
          VALUES (?, ?, ?, ?, ?)
        `,
        [orderId, item.menu_item_id, item.quantity, menuItem.price, item.notes]
      );
      
      insertedOrderItems.push({
        id: itemInsert.lastID,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        price_at_order_time: menuItem.price,
        notes: item.notes,
        item_name: menuItem.name,
      });

      /*
       * Deduct ingredients from inventory. If no recipe is defined for a menu
       * item, this loop simply has no rows to iterate and nothing is deducted.
       */
      const ingredients = await all(
        "SELECT inventory_item_id, quantity_required FROM menu_item_ingredients WHERE menu_item_id = ?",
        [item.menu_item_id]
      );

      for (const ing of ingredients) {
        const amountToDeduct = ing.quantity_required * item.quantity;
        await run(
          "UPDATE inventory_items SET current_stock = current_stock - ? WHERE id = ?",
          [amountToDeduct, ing.inventory_item_id]
        );

        /* Log the deduction in the central audit log so the manager can see it. */
        const invItem = await get("SELECT name FROM inventory_items WHERE id = ?", [ing.inventory_item_id]);

        if (invItem) {
          await run(
            `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name, details)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              "INVENTORY", "DEDUCT", "System (Customer Order)",
              ing.inventory_item_id.toString(), invItem.name,
              JSON.stringify({
                menu_item: menuItem.name,
                amount_deducted: amountToDeduct,
                order_id: orderId
              })
            ]
          );
        }
      }
    }

    await run("COMMIT");

    const fullOrder = await fetchOrderById(orderId);
    return { order: fullOrder, isAddOn, newItems: insertedOrderItems };
  } catch (transactionError) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message || rollbackError);
    }

    throw transactionError;
  }
};

/* getOrder returns a single order by ID, throwing if it does not exist. */
const getOrder = async (orderId) => {
  const order = await fetchOrderById(orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};

/*
 * getOrders returns a filtered list of orders. It is used by the management
 * dashboard. The WHERE 1=1 trick allows optional AND clauses to be appended
 * cleanly without checking whether a WHERE keyword has already been used.
 */
const getOrders = async (filters) => {
  const { table_id: tableId, status } = filters;

  let query = `
    SELECT
      o.id,
      o.table_id,
      t.table_number,
      o.status,
      o.total_price,
      o.created_at,
      COUNT(oi.id) AS item_count
    FROM orders o
    INNER JOIN tables t ON t.id = o.table_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE 1 = 1
  `;
  const params = [];

  if (tableId) {
    query += ` AND o.table_id = ?`;
    params.push(tableId);
  }

  if (status) {
    query += ` AND o.status = ?`;
    params.push(status);
  }

  query += `
    GROUP BY o.id, o.table_id, t.table_number, o.status, o.total_price, o.created_at
    ORDER BY o.created_at DESC, o.id DESC
  `;

  return all(query, params);
};

/*
 * getKitchenOrders returns all active, non-archived orders for the kitchen board.
 * The result is assembled row-by-row from a join — SQLite does not support
 * JSON aggregation, so I collect flat rows and group them in JavaScript instead.
 * Orders are sorted oldest-first (FIFO) so the kitchen crew works through them
 * in the order they were received.
 */
const getKitchenOrders = async (filters) => {
  const { status } = filters;

  let query = `
    SELECT
      o.id,
      o.table_id,
      t.table_number,
      o.status,
      o.total_price,
      o.created_at,
      oi.id AS order_item_id,
      oi.menu_item_id,
      oi.quantity,
      oi.price_at_order_time,
      oi.notes,
      oi.item_status,
      mi.name AS item_name
    FROM orders o
    INNER JOIN tables t ON t.id = o.table_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.status IN ('queue', 'preparing', 'ready') AND o.kitchen_archived_at IS NULL
  `;
  const params = [];

  if (status) {
    query += ` AND o.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY o.created_at ASC, o.id ASC, oi.id ASC`;

  const rows = await all(query, params);

  /* Group flat rows into nested order objects with an items array. */
  const orders = [];
  const orderMap = new Map();

  for (const row of rows) {
    if (!orderMap.has(row.id)) {
      const order = {
        id: row.id,
        table_id: row.table_id,
        table_number: row.table_number,
        status: row.status,
        total_price: row.total_price,
        created_at: row.created_at,
        items: []
      };

      orderMap.set(row.id, order);
      orders.push(order);
    }

    if (row.order_item_id) {
      orderMap.get(row.id).items.push({
        id: row.order_item_id,
        menu_item_id: row.menu_item_id,
        item_name: row.item_name,
        item_status: row.item_status,
        quantity: row.quantity,
        price_at_order_time: row.price_at_order_time,
        notes: row.notes
      });
    }
  }

  return orders;
};

/*
 * updateOrderStatus updates an order's overall status. The transition is not
 * currently enforced against STATUS_TRANSITIONS (that validation happens in the
 * route middleware) so this function simply writes the new status and returns
 * the refreshed order.
 */
const updateOrderStatus = async (orderId, newStatus, role) => {
  const existingOrder = await get(`SELECT id, status FROM orders WHERE id = ?`, [orderId]);

  if (!existingOrder) {
    throw new Error("Order not found");
  }

  await run(`UPDATE orders SET status = ? WHERE id = ?`, [newStatus, orderId]);

  return fetchOrderById(orderId);
};

/*
 * getActiveTableOrders fetches all orders for a table that are still active
 * (not customer-archived). The customer view calls this on load to restore
 * any in-progress orders the customer placed earlier in their visit.
 */
const getActiveTableOrders = async (tableId) => {
  const rows = await all(
    `SELECT id FROM orders
     WHERE table_id = ? AND status IN ('queue','preparing','ready') AND customer_archived_at IS NULL
     ORDER BY created_at ASC`,
    [tableId]
  );
  const orders = await Promise.all(rows.map(r => fetchOrderById(r.id)));
  return orders.filter(Boolean);
};

/*
 * deriveOrderStatus calculates the overall order status from the statuses of
 * its individual items. The rules are:
 *   - All items ready → ready
 *   - All items in queue → queue
 *   - Any other combination → preparing
 * A null item_status is treated as "queue" for backwards compatibility.
 */
const deriveOrderStatus = (itemStatuses) => {
  const normalized = itemStatuses.map(s => s || "queue");
  if (normalized.every(s => s === "ready")) return "ready";
  if (normalized.every(s => s === "queue")) return "queue";
  return "preparing";
};

/*
 * updateItemStatus updates one item's status within an order and then
 * automatically recomputes and updates the order's overall status from
 * the new set of item statuses. A history record is inserted if the overall
 * status changes as a result.
 */
const updateItemStatus = async (orderId, itemId, newStatus) => {
  const validStatuses = ["queue", "preparing", "ready"];
  if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

  await run(`UPDATE order_items SET item_status = ? WHERE id = ? AND order_id = ?`,
    [newStatus, itemId, orderId]);

  /* Recalculate overall order status from all items. */
  const items = await all(`SELECT item_status FROM order_items WHERE order_id = ?`, [orderId]);
  const derived = deriveOrderStatus(items.map(i => i.item_status));

  const current = await get(`SELECT status FROM orders WHERE id = ?`, [orderId]);
  if (current && current.status !== derived) {
    await run(`UPDATE orders SET status = ? WHERE id = ?`, [derived, orderId]);
    await run(`INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)`,
      [orderId, derived, "kitchen-item-advance"]);
  }

  return fetchOrderById(orderId);
};

/* customerArchiveOrder timestamps the customer_archived_at column to dismiss an order. */
const customerArchiveOrder = async (orderId) => {
  await run(`UPDATE orders SET customer_archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
  return fetchOrderById(orderId);
};

/* getCustomerArchivedOrdersForTable returns the last 30 dismissed orders for a table. */
const getCustomerArchivedOrdersForTable = async (tableId) => {
  const rows = await all(
    `SELECT id FROM orders
     WHERE table_id = ? AND customer_archived_at IS NOT NULL
     ORDER BY customer_archived_at DESC
     LIMIT 30`,
    [tableId]
  );
  const orders = await Promise.all(rows.map(r => fetchOrderById(r.id)));
  return orders.filter(Boolean);
};

/* kitchenArchiveOrder timestamps the kitchen_archived_at column to clear an order from the board. */
const kitchenArchiveOrder = async (orderId) => {
  await run(`UPDATE orders SET kitchen_archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
  return fetchOrderById(orderId);
};

/*
 * getKitchenArchivedOrders returns orders the kitchen has cleared today.
 * The limit of 50 and the date filter keep the history panel manageable.
 */
const getKitchenArchivedOrders = async () => {
  const rows = await all(
    `SELECT id FROM orders
     WHERE kitchen_archived_at IS NOT NULL
       AND date(kitchen_archived_at) = date('now', 'localtime')
     ORDER BY kitchen_archived_at DESC
     LIMIT 50`
  );
  const orders = await Promise.all(rows.map(r => fetchOrderById(r.id)));
  return orders.filter(Boolean);
};

/*
 * archiveYesterdaysOrders runs on server startup and at 01:30 each night.
 * It automatically archives any "ready" orders that were created before today
 * and were never manually archived. This prevents stale orders from previous
 * days from appearing on the kitchen board when staff arrive in the morning.
 */
const archiveYesterdaysOrders = async () => {
  try {
    await run(
      `UPDATE orders
       SET kitchen_archived_at = CURRENT_TIMESTAMP,
           customer_archived_at = CURRENT_TIMESTAMP
       WHERE status = 'ready'
         AND customer_archived_at IS NULL
         AND date(created_at, 'localtime') < date('now', 'localtime')`
    );
    console.log("[archive] End-of-day archival complete for previous days.");
  } catch (e) {
    console.error("[archive] archiveYesterdaysOrders failed:", e.message);
  }
};

/* markOrderPaid sets the payment_status to paid and archives the order. */
const markOrderPaid = async (orderId) => {
  await run("BEGIN TRANSACTION");
  try {
    await run("UPDATE orders SET payment_status = 'paid', customer_archived_at = CURRENT_TIMESTAMP, kitchen_archived_at = CURRENT_TIMESTAMP WHERE id = ?", [orderId]);
    await run(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, 'paid', 'Cashier')`,
      [orderId]
    );
    await run("COMMIT");
  } catch (err) {
    await run("ROLLBACK");
    throw err;
  }
};

module.exports = {
  createOrder,
  getOrder,
  getOrders,
  getKitchenOrders,
  updateOrderStatus,
  getActiveTableOrders,
  updateItemStatus,
  customerArchiveOrder,
  getCustomerArchivedOrdersForTable,
  kitchenArchiveOrder,
  getKitchenArchivedOrders,
  archiveYesterdaysOrders,
  markOrderPaid
};
