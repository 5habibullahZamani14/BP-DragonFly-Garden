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

const processPayment = async (orderId, paymentData) => {
  const { payment_method_id, amount_paid, employee_id, employee_name } = paymentData;

  const order = await fetchOrderWithPayments(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  if (order.payment_status === 'paid') {
    throw new Error("Order is already fully paid");
  }

  const paymentMethod = await get(`SELECT id FROM payment_methods WHERE id = ?`, [payment_method_id]);
  if (!paymentMethod) {
    throw new Error("Payment method not found");
  }

  const amount = Number(amount_paid);
  if (amount <= 0 || amount > order.remaining) {
    throw new Error("Invalid payment amount");
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

    return fetchOrderWithPayments(orderId);
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

module.exports = {
  processPayment
};