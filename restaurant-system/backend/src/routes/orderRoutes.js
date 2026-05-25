/*
 * orderRoutes.js — HTTP routes for order management.
 *
 * This is the most complex route file in the application because orders
 * are central to everything: customers create them, the kitchen processes
 * them, and the payment counter closes them. The route factory receives
 * the broadcast function from server.js so it can push real-time WebSocket
 * events to all connected clients whenever order state changes.
 *
 * Routes that modify order state (status updates, archiving) are protected
 * by requireKitchenCrew so that only kitchen crew QR holders can call them.
 * Order creation is open to any connected device because customers and
 * waiters both need to place orders.
 */

const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const db = require("../database/db");
const feedbackController = require("../controllers/feedbackController");
const {
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
} = require("../controllers/orderController");
const {
  asyncHandler,
  validateOrderCreation,
  validateStatusUpdate,
  validateOrderIdParam,
  validateOrderQuery,
} = require("../middleware/validation");
const { requireKitchenCrew, requirePaymentCounter } = require("../middleware/role-based-access");
const printerService = require("../services/printerService");

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

/*
 * orderRoutes is a factory function rather than a plain router export.
 * This pattern lets me close over the broadcast function so every route
 * handler in this file can call it without needing to import it separately.
 */
const feedbackImagesDir = path.join(__dirname, "../../../../frontend/public/feedback-images");
if (!fs.existsSync(feedbackImagesDir)) {
  fs.mkdirSync(feedbackImagesDir, { recursive: true });
}

const feedbackUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, feedbackImagesDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `fb-${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed."));
  },
});

const orderRoutes = (broadcast) => {
  const router = express.Router();

  /*
   * POST /orders
   * Creates a new order. The request body must contain table_id and an items
   * array (validated by validateOrderCreation). After the order is saved, a
   * NEW_ORDER event is broadcast over WebSocket so the kitchen view updates
   * in real time without polling.
   */
  router.post("/", validateOrderCreation, asyncHandler(async (req, res) => {
    const { order, isAddOn, newItems } = await createOrder(req.body);
    broadcast({ type: "NEW_ORDER", payload: order });
    
    // If the cashier adds an item at the counter right before paying, they can pass silent: true to skip kitchen print
    if (!req.body.silent) {
      // Print 2 physical copies for DINE_IN, otherwise just 1 copy
      (async () => {
        try {
          const copies = order.order_type === 'DINE_IN' ? 2 : 1;
          const itemsToPrint = isAddOn ? newItems : order.items;
          
          await printerService.printChecklistTicket(order, itemsToPrint, isAddOn);
          
          if (copies > 1) {
            await new Promise(resolve => setTimeout(resolve, 6000));
            await printerService.printChecklistTicket(order, itemsToPrint, isAddOn);
          }
        } catch (err) {
          console.error("Printer failed:", err);
        }
      })();
    }

    res.status(201).json(order);
  }));

  /*
   * POST /orders/call-waiter
   * Customer presses "Call Staff" button. Broadcasts CALL_WAITER event to staff.
   */
  router.post("/call-waiter", asyncHandler(async (req, res) => {
    const { table_id } = req.body;
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

  router.get("/call-waiter/today", requirePaymentCounter, asyncHandler(async (req, res) => {
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
    feedbackUpload.array("images", 5),
    asyncHandler(feedbackController.submitFeedback),
  );
  router.post("/feedback/mine", asyncHandler(feedbackController.fetchMyFeedback));
  router.get("/feedback/:id", asyncHandler(feedbackController.getFeedbackByToken));

  router.patch("/call-waiter/:requestId/acknowledge", requirePaymentCounter, asyncHandler(async (req, res) => {
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

  router.post("/:id/checkout", asyncHandler(async (req, res) => {
    const { cashierName } = req.body;
    // We must use fetchOrderWithPayments from paymentController to get vat_rate, service_charge_rate, and total_with_vat
    const { fetchOrderWithPayments } = require("../controllers/paymentController");
    const order = await fetchOrderWithPayments(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    try {
      await printerService.printFinalReceipt(order, cashierName || "Cashier");
    } catch (err) {
      console.error("Printer failed:", err);
    }
    
    res.json(order);
  }));

  router.patch("/:id/pay", asyncHandler(async (req, res) => {
    const { markOrderPaid, getOrder } = require("../controllers/orderController");
    await markOrderPaid(req.params.id);
    const order = await getOrder(req.params.id);
    broadcast({ type: "ORDER_STATUS_CHANGED", payload: order });
    res.json(order);
  }));

  /*
   * GET /orders
   * Returns orders filtered by optional query parameters: table_id and status.
   * Used by the management dashboard to inspect active orders.
   */
  router.get("/", validateOrderQuery, asyncHandler(async (req, res) => {
    res.json(await getOrders(req.query));
  }));

  /*
   * GET /orders/kitchen
   * Returns all active orders formatted for the kitchen board. Only orders
   * that have not been kitchen-archived are included. The kitchen view polls
   * this (or listens via WebSocket) to keep its three-column board up to date.
   */
  router.get("/kitchen", validateOrderQuery, asyncHandler(async (req, res) => {
    res.json(await getKitchenOrders(req.query));
  }));

  /*
   * GET /orders/by-table/:tableId
   * Returns all active (non-customer-archived) orders for a specific table.
   * The customer view calls this on load to restore any orders that were placed
   * earlier in the same visit, so the customer can continue tracking them.
   */
  router.get("/by-table/:tableId", asyncHandler(async (req, res) => {
    res.json(await getActiveTableOrders(req.params.tableId));
  }));

  /*
   * GET /orders/customer-archived/:tableId
   * Returns orders that the customer has dismissed from their tracking view.
   * These are stored separately so the customer can optionally view their
   * order history for the current visit.
   */
  router.get("/customer-archived/:tableId", asyncHandler(async (req, res) => {
    res.json(await getCustomerArchivedOrdersForTable(req.params.tableId));
  }));

  /*
   * GET /orders/kitchen-archived
   * Returns orders that the kitchen crew has marked as done and removed from
   * the active board. Used by the kitchen history panel.
   */
  router.get("/kitchen-archived", asyncHandler(async (req, res) => {
    res.json(await getKitchenArchivedOrders());
  }));

  /*
   * GET /orders/:id
   * Returns a single order by its ID with all its items and current status.
   * The customer view calls this periodically to refresh their order's status.
   */
  router.get("/:id", validateOrderIdParam, asyncHandler(async (req, res) => {
    res.json(await getOrder(req.params.id));
  }));

  /*
   * PATCH /orders/:id/items/:itemId/status
   * Updates the status of a single item within an order. This is a kitchen-only
   * action (requireKitchenCrew). After the update an ITEM_STATUS_UPDATE event
   * is broadcast so the customer's order tracker reflects the change immediately.
   */
  router.patch("/:id/items/:itemId/status", requireKitchenCrew, asyncHandler(async (req, res) => {
    const { id, itemId } = req.params;
    const { status } = req.body;
    const updatedOrder = await updateItemStatus(Number(id), Number(itemId), status);
    broadcast({ type: "ITEM_STATUS_UPDATE", payload: updatedOrder });
    res.json(updatedOrder);
  }));

  /*
   * PATCH /orders/:id/customer-archive
   * Marks an order as dismissed by the customer. The order stays in the database
   * for the kitchen and payment counter but no longer appears in the customer's
   * active order tracker.
   */
  router.patch("/:id/customer-archive", asyncHandler(async (req, res) => {
    res.json(await customerArchiveOrder(req.params.id));
  }));

  /*
   * PATCH /orders/:id/kitchen-archive
   * Marks an order as done from the kitchen's perspective. The kitchen crew
   * uses this to clear a completed order from their board. Kitchen-crew role
   * is required.
   */
  router.patch("/:id/kitchen-archive", requireKitchenCrew, asyncHandler(async (req, res) => {
    res.json(await kitchenArchiveOrder(req.params.id));
  }));

  /*
   * PATCH /orders/:id/status
   * Updates the overall status of an order (queue → preparing → ready).
   * This is a kitchen-only action. After a successful update an
   * ORDER_STATUS_UPDATE event is broadcast to all connected clients.
   */
  router.patch("/:id/status", requireKitchenCrew, validateOrderIdParam, validateStatusUpdate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updatedOrder = await updateOrderStatus(id, status, req.userRole);
    broadcast({ type: "ORDER_STATUS_UPDATE", payload: updatedOrder });
    res.json(updatedOrder);
  }));

  return router;
};

module.exports = orderRoutes;
