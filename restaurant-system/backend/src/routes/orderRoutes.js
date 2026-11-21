/*
 * orderRoutes.js — HTTP routes for order management.
 *
 * This is the most complex route file in the application because orders
 * are central to everything: customers create them, fulfilment staff process
 * them, and the payment counter closes them. The route factory receives
 * the broadcast function from server.js so it can push real-time WebSocket
 * events to all connected clients whenever order state changes.
 *
 * Routes that modify order state (status updates, archiving) are protected
 * by role-based guards so that only authorised order staff can call them.
 * Order creation is open to any connected device because customers and
 * waiters both need to place orders.
 */

const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const { randomUUID } = require("node:crypto");
const db = require("../database/db");
const feedbackController = require("../controllers/feedbackController");
const {
  createOrder,
  getOrder,
  getOrders,
  getActiveTableOrders,
  customerArchiveOrder,
  getCustomerArchivedOrdersForTable,
} = require("../controllers/orderController");
const { fetchOrderWithPayments, processPayment } = require("../controllers/paymentController");
const {
  asyncHandler,
  validateOrderCreation,
  validateStatusUpdate,
  validateOrderIdParam,
  validateOrderQuery,
  validatePaymentCreation,
} = require("../middleware/validation");
const {
  requirePaymentToken,
  requireStaffToken,
  requireCustomerTableToken,
  requireCustomerOrPaymentToken,
} = require("../middleware/jwt-auth");
const { createHttpError } = require("../middleware/validation");
const { removeCustomerPrivateFields } = require("../websocketAccess");
const printerService = require("../services/printerService");
const { printCopies } = require("../services/receiptCopies");
const {
  InvalidUploadedImageError,
  sanitizeUploadedImage,
} = require("../utils/imageSanitizer");

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const logArchive = async (action, targetId, targetName, details = {}, actor = {}) => {
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_id, actor_name, target_id, target_name, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["STAFF", action, actor.id || null, actor.name || null, String(targetId), targetName, JSON.stringify(details)]
  );
};

const customerVisibleOrder = (order) => {
  if (!order) return order;
  return removeCustomerPrivateFields(order);
};

const customerVisibleOrders = (orders) =>
  Array.isArray(orders) ? orders.map(customerVisibleOrder) : orders;

const ensureCustomerOwnsOrder = async (req, orderId) => {
  if (!req.customerTableId) return;
  const order = await get("SELECT table_id FROM orders WHERE id = ?", [orderId]);
  if (!order || Number(order.table_id) !== req.customerTableId) {
    throw createHttpError(404, "Order not found");
  }
};

/*
 * orderRoutes is a factory function rather than a plain router export.
 * This pattern lets me close over the broadcast function so every route
 * handler in this file can call it without needing to import it separately.
 */
const feedbackImagesDir = path.join(__dirname, "../../../../frontend/public/feedback-images");
const feedbackTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-feedback-upload-"));
if (!fs.existsSync(feedbackImagesDir)) {
  fs.mkdirSync(feedbackImagesDir, { recursive: true });
}

const feedbackUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, feedbackTempDir),
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(createHttpError(400, "Only JPEG, PNG, WebP, or GIF images are allowed."));
  },
});

const removeUploadedFiles = async (filePaths) => {
  await Promise.all(filePaths.map(async (filePath) => {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Could not remove a feedback upload:", error.message);
      }
    }
  }));
};

const sanitizeFeedbackUploads = async (req, res, next) => {
  const uploads = req.files || [];
  const temporaryPaths = uploads.map((file) => file.path);
  const sanitizedPaths = [];
  res.on("finish", () => {
    if (res.statusCode >= 400) void removeUploadedFiles(sanitizedPaths);
  });

  try {
    for (const [index, file] of uploads.entries()) {
      const sanitized = await sanitizeUploadedImage(file.path, feedbackImagesDir);
      sanitizedPaths.push(sanitized.path);
      file.filename = sanitized.filename;
      file.path = sanitized.path;
      file.destination = feedbackImagesDir;
      file.mimetype = "image/webp";
      file.size = (await fs.promises.stat(sanitized.path)).size;
      await fs.promises.unlink(temporaryPaths[index]);
    }
  } catch (error) {
    await removeUploadedFiles([...temporaryPaths, ...sanitizedPaths]);
    if (error instanceof InvalidUploadedImageError) {
      return next(createHttpError(400, "Each feedback attachment must be a valid JPEG, PNG, WebP, or GIF image."));
    }
    return next(error);
  }

  next();
};

const orderRoutes = (broadcast) => {
  const router = express.Router();

  /*
   * POST /orders
   * Creates a new order. The request body must contain table_id and an items
   * array (validated by validateOrderCreation). After the order is saved, a
   * NEW_ORDER event is broadcast over WebSocket so the relevant front-end
   * views update in real time without polling.
   */
  router.post("/", requireCustomerOrPaymentToken, validateOrderCreation, asyncHandler(async (req, res) => {
    if (req.customerTableId) {
      if (Number(req.body.table_id) !== req.customerTableId) {
        throw createHttpError(403, "Orders can only be placed for the table whose QR code was scanned.");
      }
      if (req.body.parent_order_id) {
        const parent = await get(
          "SELECT id FROM orders WHERE id = ? AND table_id = ? AND payment_status = 'unpaid'",
          [req.body.parent_order_id, req.customerTableId]
        );
        if (!parent) throw createHttpError(404, "The order to add to was not found for this table.");
      }
    }

    const { order, isAddOn, newItems } = await createOrder(req.body);
    broadcast({ type: "NEW_ORDER", payload: order });
    broadcast({ type: "MENU_UPDATE", payload: { reason: "order_inventory" } });
    
    // If the cashier adds an item at the counter right before paying, they can pass silent: true to skip kitchen print
    if (!req.body.silent) {
      // Print according to configured copy counts
      (async () => {
        try {
          const itemsToPrint = isAddOn ? newItems : order.items;
          const copyCounts = await printerService.getReceiptCopyCounts();
          
          const customerCopies = isAddOn ? copyCounts.addon_customer : copyCounts.order_customer;
          const kitchenCopies = isAddOn ? copyCounts.addon_kitchen : copyCounts.order_kitchen;
          
          await printCopies(customerCopies, () =>
            printerService.printChecklistTicket(order, itemsToPrint, isAddOn, 1)
          );
          await printCopies(kitchenCopies, () =>
            printerService.printChecklistTicket(order, itemsToPrint, isAddOn, 2)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Printer failed for order ${order.id}:`, message);
          try {
            broadcast({
              type: "PRINT_JOB_REVIEW_REQUIRED",
              payload: {
                orderId: order.id,
                message,
                submissionStarted: err?.printerSubmissionStarted === true
              }
            });
          } catch (broadcastError) {
            console.error("Could not notify managers about the printer failure:", broadcastError);
          }
        }
      })();
    }

    res.status(201).json(req.customerTableId ? customerVisibleOrder(order) : order);
  }));

  /*
   * POST /orders/call-waiter
   * Customer presses "Call Staff" button. Broadcasts CALL_WAITER event to staff.
   */
  router.post("/call-waiter", requireCustomerTableToken, asyncHandler(async (req, res) => {
    const table_id = req.customerTableId;
    const table = await get("SELECT id, table_number FROM tables WHERE id = ?", [table_id]);
    const tableNumber = table?.table_number || `Table ${table_id}`;
    const result = await run(
      `INSERT INTO staff_assistance_requests (table_id, table_number) VALUES (?, ?)`,
      [table_id, tableNumber]
    );
    const request = await get("SELECT * FROM staff_assistance_requests WHERE id = ?", [result.id]);

    await logArchive("ASSISTANCE_REQUESTED", result.id, tableNumber, {
      table_id,
      table_number: tableNumber,
      requested_at: request.requested_at,
    });

    broadcast({ type: "CALL_WAITER", payload: request });
    res.json({ success: true, request });
  }));

  router.get("/call-waiter/today", requirePaymentToken, asyncHandler(async (req, res) => {
    const requests = await all(
      `SELECT *
         FROM staff_assistance_requests
        WHERE archived_at IS NULL
          AND date(requested_at, 'localtime') = date('now', 'localtime')
        ORDER BY requested_at DESC, id DESC`
    );
    res.json(requests);
  }));

  router.post(
    "/feedback",
    requireCustomerOrPaymentToken,
    feedbackUpload.array("images", 5),
    sanitizeFeedbackUploads,
    asyncHandler(async (req, res, next) => {
      if (!req.customerTableId) return feedbackController.submitFeedback(req, res, next);
      const requestedOrderId = req.body?.order_id;
      if (requestedOrderId) {
        const order = await get("SELECT table_id FROM orders WHERE id = ?", [requestedOrderId]);
        if (!order || Number(order.table_id) !== req.customerTableId) {
          await Promise.all((req.files || []).map((file) => fs.promises.unlink(file.path)));
          throw createHttpError(404, "Order not found for this table.");
        }
      }
      req.body.table_id = String(req.customerTableId);
      return feedbackController.submitFeedback(req, res, next);
    }),
  );
  router.post("/feedback/mine", asyncHandler(feedbackController.fetchMyFeedback));
  router.get("/feedback/:id", asyncHandler(feedbackController.getMyFeedbackById));

  router.patch("/call-waiter/:requestId/acknowledge", requirePaymentToken, asyncHandler(async (req, res) => {
    const requestId = Number(req.params.requestId);
    const { employee_id, employee_name } = req.body || {};
    await run(
      `UPDATE staff_assistance_requests
          SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
              acknowledged_by_id = COALESCE(acknowledged_by_id, ?),
              acknowledged_by_name = COALESCE(acknowledged_by_name, ?)
        WHERE id = ?`,
      [employee_id || null, employee_name || null, requestId]
    );
    const request = await get("SELECT * FROM staff_assistance_requests WHERE id = ?", [requestId]);
    if (!request) return res.status(404).json({ error: "Assistance request not found" });

    await logArchive("ASSISTANCE_ACKNOWLEDGED", request.id, request.table_number, {
      table_id: request.table_id,
      table_number: request.table_number,
      requested_at: request.requested_at,
      acknowledged_at: request.acknowledged_at,
    }, { id: employee_id, name: employee_name });

    broadcast({ type: "CALL_WAITER_ACK", payload: request });
    res.json(request);
  }));

  router.post("/:id/checkout", requirePaymentToken, asyncHandler(async (req, res) => {
    const { cashierName } = req.body;
    // We must use fetchOrderWithPayments from paymentController to get vat_rate, service_charge_rate, and total_with_vat
    const { fetchOrderWithPayments } = require("../controllers/paymentController");
    const order = await fetchOrderWithPayments(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    try {
      const copyCounts = await printerService.getReceiptCopyCounts();
      const finalReceiptCopies = copyCounts.final_receipt;
      
      await printCopies(finalReceiptCopies, async () => {
        const printResult = await printerService.printFinalReceipt(order, cashierName || "Cashier");
        if (!printResult || printResult.success !== true) {
          throw new Error(printResult?.message || "The printer did not accept the receipt print job");
        }
        return printResult;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Receipt print failed after payment completed:", message);
      try {
        broadcast({
          type: "PRINT_JOB_REVIEW_REQUIRED",
          payload: {
            orderId: order.id,
            message,
            paymentCompleted: true,
            submissionStarted: err?.printerSubmissionStarted === true
          }
        });
      } catch (broadcastError) {
        console.error("Could not notify managers about the printer failure:", broadcastError);
      }
      return res.status(503).json({
        success: false,
        paymentCompleted: true,
        message: `Payment completed, but receipt printing failed: ${message}`
      });
    }
    
    res.json(order);
  }));

  router.patch("/:id/pay", requirePaymentToken, validateOrderIdParam, validatePaymentCreation, asyncHandler(async (req, res) => {
    const payment = await processPayment(req.params.id, req.body);
    broadcast({ type: "NEW_PAYMENT", payload: payment });
    res.json(payment);
  }));

  /*
   * GET /orders
   * Returns orders filtered by optional query parameters: table_id and status.
   * Used by the management dashboard to inspect active orders.
   */
  router.get("/", requireStaffToken, validateOrderQuery, asyncHandler(async (req, res) => {
    res.json(await getOrders(req.query));
  }));

  /*
   * GET /orders/by-table/:tableId
   * Returns all active (non-customer-archived) orders for a specific table.
   * The customer view calls this on load to restore any orders that were placed
   * earlier in the same visit, so the customer can continue tracking them.
   */
  router.get("/by-table/:tableId", requireCustomerOrPaymentToken, asyncHandler(async (req, res) => {
    if (req.customerTableId && Number(req.params.tableId) !== req.customerTableId) {
      throw createHttpError(404, "Table not found");
    }
    const orders = await getActiveTableOrders(req.params.tableId);
    res.json(req.customerTableId ? customerVisibleOrders(orders) : orders);
  }));

  /*
   * GET /orders/customer-archived/:tableId
   * Returns orders that the customer has dismissed from their tracking view.
   * These are stored separately so the customer can optionally view their
   * order history for the current visit.
   */
  router.get("/customer-archived/:tableId", requireCustomerTableToken, asyncHandler(async (req, res) => {
    if (Number(req.params.tableId) !== req.customerTableId) {
      throw createHttpError(404, "Table not found");
    }
    res.json(customerVisibleOrders(await getCustomerArchivedOrdersForTable(req.params.tableId)));
  }));

  /*
   * GET /orders/:id
   * Returns a single order by its ID with all its items and current status.
   * The customer view calls this periodically to refresh their order's status.
   */
  router.get("/:id", requireCustomerOrPaymentToken, validateOrderIdParam, asyncHandler(async (req, res) => {
    await ensureCustomerOwnsOrder(req, req.params.id);
    const order = await getOrder(req.params.id);
    if (!order) throw createHttpError(404, "Order not found");
    res.json(req.customerTableId ? customerVisibleOrder(order) : order);
  }));

  /*
   * PATCH /orders/:id/customer-archive
   * Marks an order as dismissed by the customer. The order stays in the database
   * for the kitchen and payment counter but no longer appears in the customer's
   * active order tracker.
   */
  router.patch("/:id/customer-archive", requireCustomerTableToken, validateOrderIdParam, asyncHandler(async (req, res) => {
    await ensureCustomerOwnsOrder(req, req.params.id);
    const archivedOrder = await customerArchiveOrder(req.params.id);
    if (archivedOrder) broadcast({ type: "ORDER_STATUS_UPDATE", payload: archivedOrder });
    res.json(customerVisibleOrder(archivedOrder));
  }));

  /*
   * PATCH /orders/:id/cancel
   * Cancels an order from the payment counter. Only payment counter staff can
   * cancel unpaid orders. Sets order status to 'cancelled' and broadcasts the event.
   */
  router.patch("/:id/cancel", requirePaymentToken, asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const { employee_id, employee_name } = req.body || {};

    const order = await get("SELECT id, status, payment_status FROM orders WHERE id = ?", [orderId]);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.payment_status !== "unpaid") {
      return res.status(400).json({ error: "Only unpaid orders can be cancelled" });
    }

    const cancelledOrder = await fetchOrderWithPayments(orderId);
    if (!cancelledOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    await run(`UPDATE orders SET status = 'cancelled', payment_status = 'cancelled' WHERE id = ?`, [orderId]);
    await run(
      `INSERT INTO archived_orders (original_order_id, table_id, status, total_price, vat_rate, service_charge_rate, payment_status, created_at, daily_ticket_number, order_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cancelledOrder.id,
        cancelledOrder.table_id,
        'cancelled',
        cancelledOrder.total_price,
        cancelledOrder.vat_rate,
        cancelledOrder.service_charge_rate,
        'cancelled',
        cancelledOrder.created_at,
        cancelledOrder.daily_ticket_number,
        JSON.stringify(cancelledOrder),
      ]
    );

    await logArchive("ORDER_CANCELLED", orderId, `Order #${orderId}`, {
      order_id: orderId,
      previous_status: order.status,
      payment_status: order.payment_status,
      cancelled_at: new Date().toISOString(),
    }, { id: employee_id, name: employee_name });

    const updatedOrder = await getOrder(orderId);
    broadcast({ type: "ORDER_STATUS_UPDATE", payload: updatedOrder });
    
    res.json(updatedOrder);
  }));

  return router;
};

module.exports = orderRoutes;
