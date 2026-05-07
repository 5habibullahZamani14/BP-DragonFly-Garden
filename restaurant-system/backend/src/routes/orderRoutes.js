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

const orderRoutes = (broadcast) => {
  const router = express.Router();

  // ── Create order ──────────────────────────────────────────────────────────
  router.post("/", validateOrderCreation, asyncHandler(async (req, res) => {
    const order = await createOrder(req.body);
    broadcast({ type: "NEW_ORDER", payload: order });
    res.status(201).json(order);
  }));

  // ── Read orders ───────────────────────────────────────────────────────────
  router.get("/", validateOrderQuery, asyncHandler(async (req, res) => {
    res.json(await getOrders(req.query));
  }));

  router.get("/kitchen", validateOrderQuery, asyncHandler(async (req, res) => {
    res.json(await getKitchenOrders(req.query));
  }));

  router.get("/by-table/:tableId", asyncHandler(async (req, res) => {
    res.json(await getActiveTableOrders(req.params.tableId));
  }));

  router.get("/customer-archived/:tableId", asyncHandler(async (req, res) => {
    res.json(await getCustomerArchivedOrdersForTable(req.params.tableId));
  }));

  router.get("/kitchen-archived", asyncHandler(async (req, res) => {
    res.json(await getKitchenArchivedOrders());
  }));

  router.get("/:id", validateOrderIdParam, asyncHandler(async (req, res) => {
    res.json(await getOrder(req.params.id));
  }));

  // ── Update order / item status ────────────────────────────────────────────
  router.patch("/:id/items/:itemId/status", requireKitchenCrew, asyncHandler(async (req, res) => {
    const { id, itemId } = req.params;
    const { status } = req.body;
    const updatedOrder = await updateItemStatus(Number(id), Number(itemId), status);
    broadcast({ type: "ITEM_STATUS_UPDATE", payload: updatedOrder });
    res.json(updatedOrder);
  }));

  router.patch("/:id/customer-archive", asyncHandler(async (req, res) => {
    res.json(await customerArchiveOrder(req.params.id));
  }));

  router.patch("/:id/kitchen-archive", requireKitchenCrew, asyncHandler(async (req, res) => {
    res.json(await kitchenArchiveOrder(req.params.id));
  }));

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
