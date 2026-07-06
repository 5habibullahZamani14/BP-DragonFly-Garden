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
        o.order_type,
        o.customer_name,
        o.customer_phone,
        o.collection_time,
        o.delivery_address,
        o.daily_ticket_number,
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
        oi.options_json,
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

  const toCents = (val) => Math.round(Number(val) * 100);

  const totalPaidCents = payments.reduce((sum, payment) => sum + toCents(payment.amount_paid), 0);
  const totalWithVatCents = toCents(order.total_with_vat);
  
  const remainingCents = Math.max(0, totalWithVatCents - totalPaidCents);

  return {
    ...order,
    items,
    payments,
    total_paid: totalPaidCents / 100,
    remaining: remainingCents / 100
  };
};

/* Broadcast helper: optional setter so routes can inject the server's broadcast fn */
let broadcastFn = null;
const setBroadcast = (fn) => { broadcastFn = fn; };
const getBroadcast = () => broadcastFn;

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

    const toCents = (val) => Math.round(Number(val) * 100);
    const newTotalPaidCents = toCents(order.total_paid) + toCents(amount);
    const newRemainingCents = toCents(order.total_with_vat) - newTotalPaidCents;

    // Pro Way: Integer math means exact 0 balance, no more <= 0.01 floating point epsilon hacks!
    const newStatus = newRemainingCents <= 0 ? "paid" : "partially_paid";

    if (newStatus === "paid") {
      await run(
        `UPDATE orders SET payment_status = ?, customer_archived_at = CURRENT_TIMESTAMP, kitchen_archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, orderId]
      );
      await run(
        `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["ORDER", "COMPLETED", employee_name || "Employee", orderId.toString(), `Order #${orderId}`, JSON.stringify({ Total_Bill: `RM ${(newTotalPaidCents / 100).toFixed(2)}`, Status: "Successfully paid in full" })]
      );
    } else {
      await run(
        `UPDATE orders SET payment_status = ? WHERE id = ?`,
        [newStatus, orderId]
      );
    }

    /* Log the payment event to the Grand Archive */
    const methodRow = await get(`SELECT name FROM payment_methods WHERE id = ?`, [payment_method_id]);
    const methodName = methodRow ? methodRow.name : `Method #${payment_method_id}`;
    
    await run(
      `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["ORDER", "PAYMENT", employee_name || "Employee", orderId.toString(), `Order #${orderId}`, JSON.stringify({ Payment_Amount: `RM ${amount.toFixed(2)}`, Method: methodName, New_Status: newStatus.replace('_', ' ') })]
    );

    await run("COMMIT");

    return fetchOrderWithPayments(orderId);
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

/*
 * splitPayment handles split payment: creates a new child order with selected items,
 * records a payment against the original order, removes split items from the original,
 * and returns both the split receipt and the updated parent order.
 */
const splitPayment = async (orderId, paymentData) => {
  const { payment_method_id, split_items, employee_id, employee_name } = paymentData;

  const order = await fetchOrderWithPayments(orderId);
  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  if (!split_items || typeof split_items !== "object" || Object.keys(split_items).length === 0) {
    throw createHttpError(400, "At least one item must be selected for split payment");
  }

  const paymentMethod = await get(`SELECT id FROM payment_methods WHERE id = ?`, [payment_method_id]);
  if (!paymentMethod) {
    throw createHttpError(400, "Payment method not found");
  }

  // Build a map of item id -> quantity to split
  const itemsToSplit = {};
  let splitSubtotalCents = 0;

  for (const item of order.items) {
    const qtyToSplit = split_items[item.id];
    if (qtyToSplit !== undefined && qtyToSplit > 0) {
      if (qtyToSplit > item.quantity) {
        throw createHttpError(400, `Cannot split ${qtyToSplit} of item ${item.id} (only ${item.quantity} available)`);
      }
      itemsToSplit[item.id] = qtyToSplit;
      splitSubtotalCents += Math.round(item.price_at_order_time * qtyToSplit * 100);
    }
  }

  if (Object.keys(itemsToSplit).length === 0) {
    throw createHttpError(400, "No valid items selected for split payment");
  }

  // Calculate split total with service and VAT
  const toCents = (val) => Math.round(Number(val) * 100);
  const splitService = (splitSubtotalCents * toCents(order.service_charge_rate || 0.1)) / 10000;
  const splitTax = ((splitSubtotalCents + splitService) * toCents(order.vat_rate || 0.06)) / 10000;
  const splitTotalWithVat = (splitSubtotalCents + splitService + splitTax) / 100;

  await run("BEGIN TRANSACTION");

  try {
    // Generate split receipt ticket number
    const todayMaxRow = await get(`SELECT MAX(daily_ticket_number) as maxTicket FROM orders WHERE date(created_at, 'localtime') = date('now', 'localtime')`);
    const nextTicketNumber = (todayMaxRow && todayMaxRow.maxTicket) ? todayMaxRow.maxTicket + 1 : 1;

    // Create child order for split receipt
    const splitOrderInsert = await run(
      `
        INSERT INTO orders (table_id, status, total_price, payment_status, order_type, parent_order_id, daily_ticket_number, vat_rate, service_charge_rate)
        VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?)
      `,
      [order.table_id, "ready", splitSubtotalCents / 100, order.order_type || "DINE_IN", orderId, nextTicketNumber, order.vat_rate, order.service_charge_rate]
    );

    const splitOrderId = splitOrderInsert.lastID;

    // Copy split items to new order (with split quantities)
    for (const [itemId, qtyToSplit] of Object.entries(itemsToSplit)) {
      const item = order.items.find(i => i.id === parseInt(itemId, 10));
      if (!item) continue;

      await run(
        `
          INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_time, notes, options_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [splitOrderId, item.menu_item_id, qtyToSplit, item.price_at_order_time, item.notes, item.options_json]
      );
    }

    // Record payment against original order
    await run(
      `
        INSERT INTO payments (order_id, payment_method_id, amount_paid, employee_id, employee_name)
        VALUES (?, ?, ?, ?, ?)
      `,
      [orderId, payment_method_id, splitTotalWithVat, employee_id, employee_name]
    );

    // Update original order: reduce quantities of split items, delete if quantity becomes 0
    for (const [itemId, qtyToSplit] of Object.entries(itemsToSplit)) {
      const item = order.items.find(i => i.id === parseInt(itemId, 10));
      if (!item) continue;

      if (item.quantity === parseInt(qtyToSplit, 10)) {
        // All quantity of this item is being split, delete it
        await run(`DELETE FROM order_items WHERE id = ?`, [itemId]);
      } else {
        // Partial split, reduce quantity
        const newQty = item.quantity - parseInt(qtyToSplit, 10);
        await run(
          `UPDATE order_items SET quantity = ? WHERE id = ?`,
          [newQty, itemId]
        );
      }
    }

    // Recalculate original order total
    const remainingItems = await all(
      `SELECT price_at_order_time, quantity FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    const newTotalCents = remainingItems.reduce((sum, item) => {
      return sum + Math.round(item.price_at_order_time * item.quantity * 100);
    }, 0);

    const newTotal = newTotalCents / 100;

    // Update original order status based on remaining balance
    const toCentsFn = (val) => Math.round(Number(val) * 100);
    const newTotalWithVatCents = toCentsFn(newTotal * (1 + (order.service_charge_rate || 0.1)) * (1 + (order.vat_rate || 0.06)));
    const totalPaidCents = toCentsFn(order.total_paid) + toCentsFn(splitTotalWithVat);
    const newRemainingCents = newTotalWithVatCents - totalPaidCents;
    const newPaymentStatus = newRemainingCents <= 0 ? "paid" : "partially_paid";

    if (newPaymentStatus === "paid") {
      await run(
        `UPDATE orders SET total_price = ?, payment_status = ?, customer_archived_at = CURRENT_TIMESTAMP, kitchen_archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newTotal, newPaymentStatus, orderId]
      );
    } else {
      await run(
        `UPDATE orders SET total_price = ?, payment_status = ? WHERE id = ?`,
        [newTotal, newPaymentStatus, orderId]
      );
    }

    // Archive the split receipt immediately
    await run(
      `UPDATE orders SET customer_archived_at = CURRENT_TIMESTAMP, kitchen_archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [splitOrderId]
    );

    // Log to grand archive
    const methodRow = await get(`SELECT name FROM payment_methods WHERE id = ?`, [payment_method_id]);
    const methodName = methodRow ? methodRow.name : `Method #${payment_method_id}`;

    await run(
      `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["ORDER", "SPLIT_PAYMENT", employee_name || "Employee", orderId.toString(), `Order #${orderId} → Split Receipt #${splitOrderId}`, JSON.stringify({ Split_Amount: `RM ${splitTotalWithVat.toFixed(2)}`, Method: methodName, Items_Count: Object.keys(itemsToSplit).length })]
    );

    await run("COMMIT");

    // Return both orders
    const splitReceipt = await fetchOrderWithPayments(splitOrderId);
    const updatedParent = await fetchOrderWithPayments(orderId);

    return { split_receipt: splitReceipt, parent_order: updatedParent };
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

  const toCents = (val) => Math.round(Number(val) * 100);
  const lineTotalCents = toCents(menuItem.price) * quantity;
  const nextTotal = (toCents(order.total_price) + lineTotalCents) / 100;

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

  const updatedOrder = await fetchOrderWithPayments(orderId);

  // Broadcast the order update so payment counters and kitchen UIs refresh
  const broadcast = getBroadcast();
  if (broadcast && updatedOrder) {
    try {
      console.log(`[paymentController] broadcasting ORDER_STATUS_UPDATE for order ${orderId}`);
      broadcast({ type: "ORDER_STATUS_UPDATE", payload: updatedOrder });
      console.log(`[paymentController] broadcast succeeded for order ${orderId}`);
    } catch (e) {
      // non-fatal: continue to return the updated order
      console.error("Broadcast failed after addOrderItem", e);
    }
  } else {
    console.log(`[paymentController] no broadcast function available for ORDER_STATUS_UPDATE (order ${orderId})`);
  }

  res.status(201).json(updatedOrder);
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
          INSERT INTO archived_orders (original_order_id, table_id, status, total_price, vat_rate, service_charge_rate, payment_status, created_at, daily_ticket_number, order_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          order.daily_ticket_number,
          JSON.stringify(order)
        ]
      );
    }

    // Pro Way: Resolve N+1 query by doing a single bulk delete instead of deleting one by one in the loop
    if (ordersToArchive.length > 0) {
      const placeholders = ordersToArchive.map(() => "?").join(",");
      const ids = ordersToArchive.map(o => o.id);
      await run(`DELETE FROM orders WHERE id IN (${placeholders})`, ids);
    }

    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }

  return ordersToArchive.length;
};

/* 
 * forceArchiveLeftovers finds any orders created before today and forcibly moves 
 * them to the Grand Archive (archived_orders table). This ensures the system 
 * always starts the new working day with a clean slate.
 */
const forceArchiveLeftovers = async () => {
  const rows = await all(`SELECT id FROM orders WHERE date(created_at, 'localtime') < date('now', 'localtime')`);
  if (rows.length === 0) return 0;
  
  const leftoverOrders = await Promise.all(rows.map(r => fetchOrderWithPayments(r.id)));
  
  await run("BEGIN TRANSACTION");
  try {
    for (const order of leftoverOrders) {
      if (!order) continue;
      await run(
        `
          INSERT INTO archived_orders (original_order_id, table_id, status, total_price, vat_rate, service_charge_rate, payment_status, created_at, daily_ticket_number, order_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          order.daily_ticket_number,
          JSON.stringify(order)
        ]
      );
    }

    if (leftoverOrders.length > 0) {
      const validOrders = leftoverOrders.filter(Boolean);
      if (validOrders.length > 0) {
        const placeholders = validOrders.map(() => "?").join(",");
        const ids = validOrders.map(o => o.id);
        await run(`DELETE FROM orders WHERE id IN (${placeholders})`, ids);
      }
    }
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
  
  return leftoverOrders.length;
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
      SELECT id, original_order_id, table_id, status, total_price, vat_rate, service_charge_rate, payment_status, created_at, archived_at, daily_ticket_number, order_data
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
  splitPayment,
  editOrderVAT,
  addOrderItem,
  getOrderPayments,
  archivePaidOrders,
  getArchivedOrders,
  executeArchive,
  forceArchiveLeftovers,
  fetchOrderWithPayments,
  setBroadcast
};
