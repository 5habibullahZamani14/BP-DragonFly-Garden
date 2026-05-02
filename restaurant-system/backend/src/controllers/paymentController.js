const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");

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

const fetchOrderWithPayments = async (orderId) => {
  const order = await get(
    `
      SELECT
        o.id,
        o.table_id,
        t.table_number,
        o.status,
        o.total_price,
        o.vat_rate,
        o.payment_status,
        o.created_at,
        (o.total_price * (1 + o.vat_rate)) AS total_with_vat
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

  const payments = await all(
    `
      SELECT
        p.id,
        p.amount_paid,
        p.payment_date,
        p.employee_id,
        p.employee_name,
        pm.name AS payment_method
      FROM payments p
      INNER JOIN payment_methods pm ON pm.id = p.payment_method_id
      WHERE p.order_id = ?
      ORDER BY p.payment_date DESC
    `,
    [orderId]
  );

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount_paid, 0);
  const remaining = Math.max(0, order.total_with_vat - totalPaid);

  return {
    ...order,
    items,
    payments,
    total_paid: totalPaid,
    remaining: Number(remaining.toFixed(2))
  };
};

const getPaymentMethods = async (req, res) => {
  const methods = await all(`SELECT id, name FROM payment_methods ORDER BY name ASC`);
  return res.json(methods);
};

const getUnpaidOrders = async (req, res) => {
  const orders = await all(
    `
      SELECT
        o.id,
        o.table_id,
        t.table_number,
        o.total_price,
        o.vat_rate,
        o.created_at,
        (o.total_price * (1 + o.vat_rate)) AS total_with_vat
      FROM orders o
      INNER JOIN tables t ON t.id = o.table_id
      WHERE o.payment_status IN ('unpaid', 'partially_paid')
      ORDER BY o.created_at ASC
    `
  );

  const ordersWithDetails = await Promise.all(
    orders.map(async (order) => {
      const items = await all(
        `
          SELECT
            oi.quantity,
            oi.price_at_order_time,
            mi.name AS item_name
          FROM order_items oi
          INNER JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id = ?
        `,
        [order.id]
      );

      const payments = await all(
        `
          SELECT SUM(amount_paid) as total_paid
          FROM payments
          WHERE order_id = ?
        `,
        [order.id]
      );

      const totalPaid = payments[0]?.total_paid || 0;
      const remaining = Math.max(0, order.total_with_vat - totalPaid);

      return {
        ...order,
        items,
        total_paid: totalPaid,
        remaining: Number(remaining.toFixed(2))
      };
    })
  );

  return res.json(ordersWithDetails);
};

const getPaidOrders = async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const orders = await all(
    `
      SELECT
        o.id,
        o.table_id,
        t.table_number,
        o.total_price,
        o.vat_rate,
        o.created_at,
        (o.total_price * (1 + o.vat_rate)) AS total_with_vat
      FROM orders o
      INNER JOIN tables t ON t.id = o.table_id
      WHERE o.payment_status = 'paid'
        AND DATE(o.created_at) = ?
      ORDER BY o.created_at DESC
    `,
    [today]
  );

  const ordersWithDetails = await Promise.all(
    orders.map(async (order) => {
      const items = await all(
        `
          SELECT
            oi.quantity,
            oi.price_at_order_time,
            mi.name AS item_name
          FROM order_items oi
          INNER JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id = ?
        `,
        [order.id]
      );

      return {
        ...order,
        items,
        total_paid: order.total_with_vat
      };
    })
  );

  return res.json(ordersWithDetails);
};

const processPayment = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { payment_method_id, amount_paid, employee_id, employee_name } = req.body;

  const order = await fetchOrderWithPayments(orderId);
  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  if (order.payment_status === 'paid') {
    throw createHttpError(400, "Order is already fully paid");
  }

  const paymentMethod = await get(`SELECT id FROM payment_methods WHERE id = ?`, [payment_method_id]);
  if (!paymentMethod) {
    throw createHttpError(404, "Payment method not found");
  }

  const amount = Number(amount_paid);
  if (amount <= 0 || amount > order.remaining) {
    throw createHttpError(400, "Invalid payment amount");
  }

  await run("BEGIN TRANSACTION");

  try {
    await run(
      `
        INSERT INTO payments (order_id, payment_method_id, amount_paid, employee_id, employee_name)
        VALUES (?, ?, ?, ?, ?)
      `,
      [orderId, payment_method_id, amount, employee_id, employee_name]
    );

    const newTotalPaid = order.total_paid + amount;
    const newRemaining = order.total_with_vat - newTotalPaid;
    const newStatus = newRemaining <= 0.01 ? 'paid' : 'partially_paid';

    await run(
      `UPDATE orders SET payment_status = ? WHERE id = ?`,
      [newStatus, orderId]
    );

    await run("COMMIT");

    const updatedOrder = await fetchOrderWithPayments(orderId);
    return res.json({
      message: "Payment processed successfully",
      order: updatedOrder
    });
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

const getOrderPayments = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const payments = await all(
    `
      SELECT
        p.id,
        p.amount_paid,
        p.payment_date,
        p.employee_id,
        p.employee_name,
        pm.name AS payment_method
      FROM payments p
      INNER JOIN payment_methods pm ON pm.id = p.payment_method_id
      WHERE p.order_id = ?
      ORDER BY p.payment_date DESC
    `,
    [orderId]
  );

  return res.json(payments);
};

const editOrderVAT = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { vat_rate, employee_id, employee_name } = req.body;

  const order = await get(`SELECT vat_rate FROM orders WHERE id = ?`, [orderId]);
  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  const newVatRate = Number(vat_rate);
  if (newVatRate < 0 || newVatRate > 1) {
    throw createHttpError(400, "Invalid VAT rate");
  }

  await run("BEGIN TRANSACTION");

  try {
    await run(
      `
        INSERT INTO payment_logs (order_id, action, old_value, new_value, employee_id, employee_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [orderId, 'edit_vat', order.vat_rate.toString(), newVatRate.toString(), employee_id, employee_name]
    );

    await run(`UPDATE orders SET vat_rate = ? WHERE id = ?`, [newVatRate, orderId]);

    await run("COMMIT");

    const updatedOrder = await fetchOrderWithPayments(orderId);
    return res.json({
      message: "VAT rate updated successfully",
      order: updatedOrder
    });
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

const addOrderItem = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { menu_item_id, quantity, notes, employee_id, employee_name } = req.body;

  const order = await get(`SELECT id FROM orders WHERE id = ?`, [orderId]);
  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  const menuItem = await get(`SELECT id, name, price, is_available FROM menu_items WHERE id = ?`, [menu_item_id]);
  if (!menuItem) {
    throw createHttpError(404, "Menu item not found");
  }

  if (!menuItem.is_available) {
    throw createHttpError(409, `${menuItem.name} is currently unavailable`);
  }

  await run("BEGIN TRANSACTION");

  try {
    await run(
      `
        INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes)
        VALUES (?, ?, ?, ?, ?)
      `,
      [orderId, menu_item_id, quantity, menuItem.price, notes]
    );

    // Recalculate total price
    const items = await all(
      `SELECT quantity, price_at_order_time FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    const newTotal = items.reduce((sum, item) => sum + (item.quantity * item.price_at_order_time), 0);

    await run(`UPDATE orders SET total_price = ? WHERE id = ?`, [newTotal, orderId]);

    await run(
      `
        INSERT INTO payment_logs (order_id, action, old_value, new_value, employee_id, employee_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [orderId, 'add_item', '', `${menuItem.name} x${quantity}`, employee_id, employee_name]
    );

    await run("COMMIT");

    const updatedOrder = await fetchOrderWithPayments(orderId);
    return res.json({
      message: "Item added successfully",
      order: updatedOrder
    });
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

const archivePaidOrders = async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const paidOrders = await all(
    `
      SELECT
        o.id,
        o.table_id,
        o.status,
        o.total_price,
        o.vat_rate,
        o.created_at,
        t.table_number
      FROM orders o
      INNER JOIN tables t ON t.id = o.table_id
      WHERE o.payment_status = 'paid'
        AND DATE(o.created_at) = ?
    `,
    [today]
  );

  if (paidOrders.length === 0) {
    return res.json({ message: "No paid orders to archive" });
  }

  await run("BEGIN TRANSACTION");

  try {
    for (const order of paidOrders) {
      // Get order items
      const items = await all(
        `
          SELECT
            oi.menu_item_id,
            oi.quantity,
            oi.price_at_order_time,
            oi.notes,
            mi.name AS item_name
          FROM order_items oi
          INNER JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id = ?
        `,
        [order.id]
      );

      const orderData = JSON.stringify({
        table_number: order.table_number,
        items,
        total_price: order.total_price,
        vat_rate: order.vat_rate,
        total_with_vat: order.total_price * (1 + order.vat_rate)
      });

      await run(
        `
          INSERT INTO archived_orders (original_order_id, table_id, status, total_price, vat_rate, payment_status, created_at, order_data)
          VALUES (?, ?, ?, ?, ?, 'paid', ?, ?)
        `,
        [order.id, order.table_id, order.status, order.total_price, order.vat_rate, order.created_at, orderData]
      );

      // Delete from active tables
      await run(`DELETE FROM payments WHERE order_id = ?`, [order.id]);
      await run(`DELETE FROM payment_logs WHERE order_id = ?`, [order.id]);
      await run(`DELETE FROM order_status_history WHERE order_id = ?`, [order.id]);
      await run(`DELETE FROM order_items WHERE order_id = ?`, [order.id]);
      await run(`DELETE FROM orders WHERE id = ?`, [order.id]);
    }

    await run("COMMIT");

    return res.json({
      message: `${paidOrders.length} orders archived successfully`
    });
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

const getArchivedOrders = async (req, res) => {
  const { date, table, search } = req.query;

  let query = `
    SELECT
      id,
      original_order_id,
      table_id,
      status,
      total_price,
      vat_rate,
      archived_at,
      order_data
    FROM archived_orders
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ` AND DATE(archived_at) = ?`;
    params.push(date);
  }

  if (table) {
    query += ` AND table_id = ?`;
    params.push(table);
  }

  query += ` ORDER BY archived_at DESC`;

  const archivedOrders = await all(query, params);

  const ordersWithParsedData = archivedOrders.map(order => ({
    ...order,
    order_data: JSON.parse(order.order_data)
  }));

  // Filter by search if provided
  let filteredOrders = ordersWithParsedData;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredOrders = ordersWithParsedData.filter(order =>
      order.order_data.items.some(item =>
        item.item_name.toLowerCase().includes(searchLower)
      ) ||
      order.order_data.table_number.toLowerCase().includes(searchLower)
    );
  }

  return res.json(filteredOrders);
};

module.exports = {
  getPaymentMethods,
  getUnpaidOrders,
  getPaidOrders,
  processPayment,
  editOrderVAT,
  addOrderItem,
  getOrderPayments,
  archivePaidOrders,
  getArchivedOrders
};