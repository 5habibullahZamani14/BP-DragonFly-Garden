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

const createOrder = async (orderData) => {
  const { table_id: tableId, items } = orderData;
  const table = await get(`SELECT id, table_number, qr_code FROM tables WHERE id = ?`, [tableId]);

  if (!table) {
    throw new Error("Table not found");
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
      throw new Error(`Menu item ${item.menu_item_id} not found`);
    }

    if (!menuItem.is_available) {
      throw new Error(`${menuItem.name} is currently unavailable`);
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
      [tableId, "queue", totalPrice]
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
        
        const invItem = await get("SELECT name FROM inventory_items WHERE id = ?", [ing.inventory_item_id]);
        
        if (invItem) {
          await run(
            `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name, details)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              'INVENTORY', 'DEDUCT', 'System (Customer Order)', 
              ing.inventory_item_id.toString(), invItem.name, 
              JSON.stringify({ 
                menu_item: menuItem.name, 
                amount_deducted: amountToDeduct,
                order_id: orderInsert.lastID
              })
            ]
          );
        }
      }
    }

    await run("COMMIT");

    return fetchOrderById(orderInsert.lastID);
  } catch (transactionError) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message || rollbackError);
    }

    throw transactionError;
  }
};

const getOrder = async (orderId) => {
  const order = await fetchOrderById(orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};

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
      mi.name AS item_name
    FROM orders o
    INNER JOIN tables t ON t.id = o.table_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.status IN ('queue', 'preparing', 'ready')
  `;
  const params = [];

  if (status) {
    query += ` AND o.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY o.created_at ASC, o.id ASC, oi.id ASC`;

  const rows = await all(query, params);

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

  return orders;
};

const updateOrderStatus = async (orderId, newStatus, role) => {
  const existingOrder = await get(`SELECT id, status FROM orders WHERE id = ?`, [orderId]);

  if (!existingOrder) {
    throw new Error("Order not found");
  }

  // Add your status transition logic here

  await run(`UPDATE orders SET status = ? WHERE id = ?`, [newStatus, orderId]);

  return fetchOrderById(orderId);
};

const getActiveTableOrders = async (tableId) => {
  const rows = await all(
    `SELECT id FROM orders
     WHERE table_id = ? AND status IN ('queue','preparing','ready')
     ORDER BY created_at ASC`,
    [tableId]
  );
  const orders = await Promise.all(rows.map(r => fetchOrderById(r.id)));
  return orders.filter(Boolean);
};

// Derive overall order status from its items
const deriveOrderStatus = (itemStatuses) => {
  if (itemStatuses.every(s => s === 'ready')) return 'ready';
  if (itemStatuses.every(s => s === 'queue')) return 'queue';
  return 'preparing';
};

const updateItemStatus = async (orderId, itemId, newStatus) => {
  const validStatuses = ['queue', 'preparing', 'ready'];
  if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

  // Update the specific item
  await run(`UPDATE order_items SET item_status = ? WHERE id = ? AND order_id = ?`,
    [newStatus, itemId, orderId]);

  // Derive new overall order status from all items
  const items = await all(`SELECT item_status FROM order_items WHERE order_id = ?`, [orderId]);
  const derived = deriveOrderStatus(items.map(i => i.item_status));

  // Update order status if changed
  const current = await get(`SELECT status FROM orders WHERE id = ?`, [orderId]);
  if (current && current.status !== derived) {
    await run(`UPDATE orders SET status = ? WHERE id = ?`, [derived, orderId]);
    await run(`INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)`,
      [orderId, derived, 'kitchen-item-advance']);
  }

  return fetchOrderById(orderId);
};

const customerArchiveOrder = async (orderId) => {
  await run(`UPDATE orders SET customer_archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
  return fetchOrderById(orderId);
};

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

module.exports = {
  createOrder,
  getOrder,
  getOrders,
  getKitchenOrders,
  updateOrderStatus,
  getActiveTableOrders,
  updateItemStatus,
  customerArchiveOrder,
  getCustomerArchivedOrdersForTable
};


