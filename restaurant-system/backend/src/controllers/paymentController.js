/*
 * paymentController.js — Business logic for the payment counter.
 *
 * This controller handles everything the payment counter needs: listing
 * unpaid orders, processing payment transactions, adjusting VAT, adding
 * items post-order, and archiving completed orders at end of shift.
 *
 * The central helper in this file is fetchOrderWithPayments, which builds a
 * richer order object than the one returned by orderController — it includes
 * the VAT-inclusive total, a list of payment transactions, and the remaining
 * balance. Almost every function here calls this helper before and after
 * making changes so it can return a fully-computed snapshot to the frontend.
 *
 * All write operations (processPayment, editOrderVAT, addOrderItem, executeArchive)
 * use explicit BEGIN/COMMIT/ROLLBACK transactions because they touch multiple
 * tables atomically.
 */

const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");

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
 * fetchOrderWithPayments is the payment-aware equivalent of the orderController's
 * fetchOrderById. It includes VAT and service charge calculations, the full
 * payments list, the total amount paid so far, and the remaining balance.
 *
 * The total_with_vat calculation applies service charge first, then VAT —
 * this is the standard billing formula used in Malaysian F&B establishments.
 * Both rates are stored on the order row so historical records are accurate
 * even if the restaurant later changes its default rates in settings.
 */
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
        o.service_charge_rate,
        o.payment_status,
        o.created_at,
        o.customer_archived_at,
        o.kitchen_archived_at,
        (o.total_price * (1 + o.service_charge_rate) * (1 + o.vat_rate)) AS total_with_vat
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

/*
 * processPayment records a payment transaction against an order. It validates
 * that the order is not already fully paid, that the payment method exists,
 * and that the amount is positive and does not exceed the remaining balance.
 * After inserting the payment row it recalculates payment_status:
 *   remaining ≤ 0.01 → paid  (the ≤ 0.01 tolerance handles floating-point rounding)
 *   remaining > 0.01 → partially_paid
 */
const processPayment = async (orderId, paymentData) => {
  const { payment_method_id, amount_paid, employee_id, employee_name } = paymentData;

  const order = await fetchOrderWithPayments(orderId);
  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  if (order.payment_status === "paid") {
    throw createHttpError(400, "Order is already fully paid");
  }

  const paymentMethod = await get(`SELECT id FROM payment_methods WHERE id = ?`, [payment_method_id]);
  if (!paymentMethod) {
    throw createHttpError(400, "Payment method not found");
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
    const newStatus = newRemaining <= 0.01 ? "paid" : "partially_paid";

    if (newStatus === "paid") {
      await run(
        `UPDATE orders SET payment_status = ?, customer_archived_at = CURRENT_TIMESTAMP, kitchen_archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, orderId]
      );
    } else {
      await run(
        `UPDATE orders SET payment_status = ? WHERE id = ?`,
        [newStatus, orderId]
      );
    }

    await run("COMMIT");

    return fetchOrderWithPayments(orderId);
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

/* getPaymentMethods returns the list of accepted payment methods. */
const getPaymentMethods = async (req, res) => {
  const methods = await all(`SELECT id, name FROM payment_methods ORDER BY id ASC`);
  res.json(methods);
};

/*
 * listOrdersByPaymentStatus is a shared helper used by getUnpaidOrders and
 * getPaidOrders. It fetches all orders matching any of the given payment
 * statuses and returns them with their payment details attached.
 */
const listOrdersByPaymentStatus = async (statuses) => {
  const placeholders = statuses.map(() => "?").join(", ");
  const rows = await all(
    `
      SELECT id
      FROM orders
      WHERE payment_status IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `,
    statuses
  );

  return Promise.all(rows.map((row) => fetchOrderWithPayments(row.id)));
};

/* getUnpaidOrders returns all orders that still have an outstanding balance. */
const getUnpaidOrders = async (req, res) => {
  const orders = await listOrdersByPaymentStatus(["unpaid", "partially_paid"]);
  res.json(orders.filter(Boolean));
};

/* getPaidOrders returns all orders that have been fully settled. */
const getPaidOrders = async (req, res) => {
  const orders = await listOrdersByPaymentStatus(["paid"]);
  res.json(orders.filter(Boolean));
};

/* getOrderPayments returns just the payments array for a specific order. */
const getOrderPayments = async (req, res) => {
  const order = await fetchOrderWithPayments(req.params.orderId);

  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  res.json(order.payments);
};

/*
 * editOrderVAT allows the payment counter to adjust the VAT rate on an order.
 * The old and new values are recorded in payment_logs so the manager can see
 * exactly what was changed and who changed it.
 */
const editOrderVAT = async (req, res) => {
  const { vat_rate, employee_id, employee_name } = req.body;
  const orderId = req.params.orderId;
  const existingOrder = await fetchOrderWithPayments(orderId);

  if (!existingOrder) {
    throw createHttpError(404, "Order not found");
  }

  await run("BEGIN TRANSACTION");

  try {
    await run(`UPDATE orders SET vat_rate = ? WHERE id = ?`, [vat_rate, orderId]);
    await run(
      `
        INSERT INTO payment_logs (order_id, action, old_value, new_value, employee_id, employee_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [orderId, "vat_updated", String(existingOrder.vat_rate), String(vat_rate), employee_id, employee_name]
    );
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }

  res.json(await fetchOrderWithPayments(orderId));
};

/*
 * addOrderItem adds an extra item to an existing order from the payment counter.
 * The order total is recalculated after insertion. If the order was previously
 * marked "paid", adding a new item resets the payment_status to "partially_paid"
 * because the customer now owes more money.
 */
const addOrderItem = async (req, res) => {
  const { menu_item_id, quantity, notes, employee_id, employee_name } = req.body;
  const orderId = req.params.orderId;
  const order = await fetchOrderWithPayments(orderId);

  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  const menuItem = await get(
    `SELECT id, name, price, is_available FROM menu_items WHERE id = ?`,
    [menu_item_id]
  );

  if (!menuItem) {
    throw createHttpError(404, "Menu item not found");
  }

  if (!menuItem.is_available) {
    throw createHttpError(400, `${menuItem.name} is currently unavailable`);
  }

  const lineTotal = Number((menuItem.price * quantity).toFixed(2));
  const nextTotal = Number((order.total_price + lineTotal).toFixed(2));

  await run("BEGIN TRANSACTION");

  try {
    await run(
      `
        INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes)
        VALUES (?, ?, ?, ?, ?)
      `,
      [orderId, menu_item_id, quantity, menuItem.price, notes]
    );
    /*
     * Reset payment_status to "partially_paid" if it was already "paid",
     * because the order total has now increased.
     */
    await run(
      `UPDATE orders SET total_price = ?, payment_status = CASE WHEN payment_status = 'paid' THEN 'partially_paid' ELSE payment_status END WHERE id = ?`,
      [nextTotal, orderId]
    );
    await run(
      `
        INSERT INTO payment_logs (order_id, action, old_value, new_value, employee_id, employee_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [orderId, "item_added", null, JSON.stringify({ menu_item_id, quantity, notes }), employee_id, employee_name]
    );
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }

  res.status(201).json(await fetchOrderWithPayments(orderId));
};

/*
 * executeArchive moves all "paid" orders into the archived_orders table and
 * deletes them from the live orders table. The order data is serialised to JSON
 * before deletion so the full record is preserved even after the orders are gone.
 * This function is called both from archivePaidOrders (manual trigger) and from
 * the nightly scheduler in server.js.
 */
const executeArchive = async () => {
  const paidOrders = await listOrdersByPaymentStatus(["paid"]);
  const ordersToArchive = paidOrders.filter(Boolean);

  await run("BEGIN TRANSACTION");

  try {
    for (const order of ordersToArchive) {
      await run(
        `
          INSERT INTO archived_orders (original_order_id, table_id, status, total_price, vat_rate, service_charge_rate, payment_status, created_at, order_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          order.id,
          order.table_id,
          order.status,
          order.total_price,
          order.vat_rate,
          order.service_charge_rate,
          order.payment_status,
          order.created_at,
          JSON.stringify(order)
        ]
      );
      await run(`DELETE FROM orders WHERE id = ?`, [order.id]);
    }

    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }

  return ordersToArchive.length;
};

/* archivePaidOrders is the HTTP handler that calls executeArchive and returns the count. */
const archivePaidOrders = async (req, res) => {
  const archived_count = await executeArchive();
  res.json({ archived_count });
};

/* getArchivedOrders returns the full archive list, most recent first. */
const getArchivedOrders = async (req, res) => {
  const orders = await all(
    `
      SELECT id, original_order_id, table_id, status, total_price, vat_rate, service_charge_rate, payment_status, created_at, archived_at, order_data
      FROM archived_orders
      ORDER BY archived_at DESC, id DESC
    `
  );
  res.json(orders);
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
  getArchivedOrders,
  executeArchive,
  fetchOrderWithPayments
};
