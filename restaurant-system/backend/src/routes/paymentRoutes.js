const express = require("express");
const {
  getPaymentMethods,
  getUnpaidOrders,
  getPaidOrders,
  processPayment,
  editOrderVAT,
  addOrderItem,
  getOrderPayments,
  archivePaidOrders,
  getArchivedOrders
} = require("../controllers/paymentController");
const {
  asyncHandler,
  validatePaymentCreation,
  validateVATEdit,
  validateAddItem,
  validateOrderIdParam
} = require("../middleware/validation");
const { requirePaymentCounter } = require("../middleware/role-based-access");

const paymentRoutes = (broadcast) => {
  const router = express.Router();

  router.get("/methods", asyncHandler(getPaymentMethods));

  router.get("/unpaid", requirePaymentCounter, asyncHandler(getUnpaidOrders));

  router.get("/paid", requirePaymentCounter, asyncHandler(getPaidOrders));

  router.post("/:orderId/payments", requirePaymentCounter, validateOrderIdParam, validatePaymentCreation, asyncHandler(async (req, res) => {
    const payment = await processPayment(req.params.orderId, req.body);
    broadcast({ type: "NEW_PAYMENT", payload: payment });
    res.status(201).json(payment);
  }));

  router.get("/:orderId/payments", requirePaymentCounter, validateOrderIdParam, asyncHandler(getOrderPayments));

  router.patch("/:orderId/vat", requirePaymentCounter, validateOrderIdParam, validateVATEdit, asyncHandler(editOrderVAT));

  router.post("/:orderId/items", requirePaymentCounter, validateOrderIdParam, validateAddItem, asyncHandler(addOrderItem));

  router.post("/archive", requirePaymentCounter, asyncHandler(archivePaidOrders));

  router.get("/archived", requirePaymentCounter, asyncHandler(getArchivedOrders));

  return router;
};

module.exports = paymentRoutes;
