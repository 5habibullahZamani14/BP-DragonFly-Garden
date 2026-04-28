const db = require("../database/db");
const printerService = require("../services/printerService");
const { createHttpError } = require("../middleware/validation");
const { ORDER_STATUS, STATUS_TRANSITIONS, KITCHEN_VISIBLE_STATUSES } = require("../constants/order-status");
const { recordStatusChange, getStatusHistory } = require("../utils/order-status-history");

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

const createOrder = async (req, res) => {
  const { table_id: tableId, items } = req.body;
  const table = await get(`SELECT id, table_number, qr_code FROM tables WHERE id = ?`, [tableId]);

  if (!table) {
    throw createHttpError(404, "Table not found");
  }

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

  const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menu_item_id);

    if (!menuItem) {
      throw createHttpError(404, `Menu item ${item.menu_item_id} not found`);
    }

    if (!menuItem.is_available) {
      throw createHttpError(409, `${menuItem.name} is currently unavailable`);
    }
  }

  await run("BEGIN TRANSACTION");

  try {
    const totalPrice = Number(
      items
        .reduce((total, item) => {
          const menuItem = menuItemMap.get(item.menu_item_id);
          return total + menuItem.price * item.quantity;
        }, 0)
        .toFixed(2)
    );

    const orderInsert = await run(
      `
        INSERT INTO orders (table_id, status, total_price)
        VALUES (?, ?, ?)
      `,
      [tableId, ORDER_STATUS.QUEUE, totalPrice]
    );

    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);

      await run(
        `
          INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes)
          VALUES (?, ?, ?, ?, ?)
        `,
        [orderInsert.lastID, item.menu_item_id, item.quantity, menuItem.price, item.notes]
      );
    }

    // Record initial status in history
    await recordStatusChange(orderInsert.lastID, ORDER_STATUS.QUEUE, "system");

    await run("COMMIT");

    const createdOrder = await fetchOrderById(orderInsert.lastID);

    printerService.printTicket(createdOrder).catch((printError) => {
      console.error("Printer service error:", printError.message || printError);
    });

    return res.status(201).json({
      message: "Order created successfully",
      order: createdOrder
    });
  } catch (transactionError) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message || rollbackError);
    }

    throw transactionError;
  }
};

const getOrder = async (req, res) => {
  const orderId = Number(req.params.id);
  const order = await fetchOrderById(orderId);

  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  return res.json(order);
};

const getOrders = async (req, res) => {
  const tableId = req.query.table_id ? Number(req.query.table_id) : null;
  const status = req.query.status || null;

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

  const orders = await all(query, params);
  return res.json(orders);
};

const getKitchenOrders = async (req, res) => {
  const requestedStatus = req.query.status || null;
  const placeholders = KITCHEN_VISIBLE_STATUSES.map(() => "?").join(", ");
  const params = requestedStatus ? [requestedStatus] : [...KITCHEN_VISIBLE_STATUSES];
  const whereClause = requestedStatus ? "o.status = ?" : `o.status IN (${placeholders})`;

  const rows = await all(
    `
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
        mi.name AS item_name
      FROM orders o
      INNER JOIN tables t ON t.id = o.table_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE ${whereClause}
      ORDER BY o.created_at ASC, o.id ASC, oi.id ASC
    `,
    params
  );

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
        quantity: row.quantity,
        price_at_order_time: row.price_at_order_time,
        notes: row.notes
      });
    }
  }

  return res.json(orders);
};

const updateOrderStatus = async (req, res) => {
  const orderId = Number(req.params.id);
  const { status: nextStatus } = req.body;
  const existingOrder = await get(`SELECT id, status FROM orders WHERE id = ?`, [orderId]);

  if (!existingOrder) {
    throw createHttpError(404, "Order not found");
  }

  const currentStatus = existingOrder.status;

  if (currentStatus === nextStatus) {
    const order = await fetchOrderById(orderId);
    return res.json({
      message: "Order status unchanged",
      order
    });
  }

  const allowedNextStatuses = STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowedNextStatuses.includes(nextStatus)) {
    throw createHttpError(409, `Cannot move order from ${currentStatus} to ${nextStatus}`, {
      allowed_statuses: allowedNextStatuses
    });
  }

  await run(`UPDATE orders SET status = ? WHERE id = ?`, [nextStatus, orderId]);
  
  // Record status change in history
  await recordStatusChange(orderId, nextStatus, "kitchen_crew");
  
  const updatedOrder = await fetchOrderById(orderId);
  
  // Include status history in response for kitchen crew
  const statusHistory = await getStatusHistory(orderId);

  return res.json({
    message: "Order status updated successfully",
    order: updatedOrder,
    status_history: statusHistory
  });
};

module.exports = {
  createOrder,
  getOrder,
  getOrders,
  getKitchenOrders,
  updateOrderStatus
};
