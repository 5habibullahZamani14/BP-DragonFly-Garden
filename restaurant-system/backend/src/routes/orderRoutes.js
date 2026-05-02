const express = require("express");
const { 
  createOrder, 
  getOrder, 
  getOrders,
  getKitchenOrders,
  updateOrderStatus 
} = require("../controllers/orderController");
const { 
  asyncHandler,
  validateOrderCreation,
  validateStatusUpdate,
  validateOrderIdParam,
  validateOrderQuery
} = require("../middleware/validation");
const { requireKitchenCrew } = require("../middleware/role-based-access");

const orderRoutes = (broadcast) => {
  const router = express.Router();

  router.post("/", validateOrderCreation, async (req, res) => {
    const order = await createOrder(req.body);
    broadcast({ type: "NEW_ORDER", payload: order });
    res.status(201).json(order);
  });

  router.get("/", validateOrderQuery, asyncHandler(getOrders));
  router.get("/kitchen", validateOrderQuery, asyncHandler(getKitchenOrders));

  router.get("/:id", validateOrderIdParam, asyncHandler(getOrder));

  router.patch("/:id/status", requireKitchenCrew, validateOrderIdParam, validateStatusUpdate, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updatedOrder = await updateOrderStatus(id, status, req.user.role);
    broadcast({ type: "ORDER_STATUS_UPDATE", payload: updatedOrder });
    res.json(updatedOrder);
  });

  return router;
};

module.exports = orderRoutes;
