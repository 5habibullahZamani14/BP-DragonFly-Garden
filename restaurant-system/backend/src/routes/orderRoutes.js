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
const { requireKitchenCrew } = require("../middleware/role-based-access");
const printerService = require("../services/printerService");

/*
 * orderRoutes is a factory function rather than a plain router export.
 * This pattern lets me close over the broadcast function so every route
 * handler in this file can call it without needing to import it separately.
 */
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
    const order = await createOrder(req.body);
    broadcast({ type: "NEW_ORDER", payload: order });
    
    // Print 2 physical copies with a 4 second pause between them so they can be torn manually
    (async () => {
      try {
        await printerService.printTicket(order);
        await new Promise(resolve => setTimeout(resolve, 4000));
        await printerService.printTicket(order);
      } catch (err) {
        console.error("Printer failed:", err);
      }
    })();

    res.status(201).json(order);
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
