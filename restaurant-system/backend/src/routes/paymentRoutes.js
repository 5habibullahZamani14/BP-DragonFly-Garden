/*
 * paymentRoutes.js — HTTP routes for the payment counter.
 *
 * All routes here are restricted to users holding a payment-counter QR code
 * (requirePaymentCounter), except GET /payments/methods which is public
 * because the frontend needs the list of payment options before login.
 *
 * Like orderRoutes, this file is a factory that accepts the broadcast function
 * so it can push a NEW_PAYMENT WebSocket event whenever a payment is processed,
 * allowing the kitchen and management views to reflect the updated payment
 * status without a page reload.
 */

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

  /*
   * GET /payments/methods
   * Returns the list of accepted payment methods (Cash, Card, eWallet, etc.).
   * This is intentionally public so the payment counter UI can load the list
   * before the employee has authenticated.
   */
  router.get("/methods", asyncHandler(getPaymentMethods));

  /*
   * GET /payments/unpaid
   * Returns all orders that have not been fully paid yet. The payment counter
   * uses this to build its main working list of pending orders.
   */
  router.get("/unpaid", requirePaymentCounter, asyncHandler(getUnpaidOrders));

  /*
   * GET /payments/paid
   * Returns orders that have been fully paid during the current working session.
   * The payment counter uses this to review completed transactions.
   */
  router.get("/paid", requirePaymentCounter, asyncHandler(getPaidOrders));

  /*
   * POST /payments/:orderId/payments
   * Records a payment transaction against an order. The body must include
   * payment_method_id, amount_paid, employee_id, and employee_name.
   * A NEW_PAYMENT WebSocket event is broadcast after a successful payment.
   */
  router.post("/:orderId/payments", requirePaymentCounter, validateOrderIdParam, validatePaymentCreation, asyncHandler(async (req, res) => {
    const payment = await processPayment(req.params.orderId, req.body);
    broadcast({ type: "NEW_PAYMENT", payload: payment });
    res.status(201).json(payment);
  }));

  /*
   * GET /payments/:orderId/payments
   * Returns all payment transactions recorded against a specific order.
   * Used to show the payment history panel for an order at the counter.
   */
  router.get("/:orderId/payments", requirePaymentCounter, validateOrderIdParam, asyncHandler(getOrderPayments));

  /*
   * PATCH /payments/:orderId/vat
   * Adjusts the VAT rate applied to a specific order. The body must include
   * vat_rate (0–1), employee_id, and employee_name. This action is logged.
   */
  router.patch("/:orderId/vat", requirePaymentCounter, validateOrderIdParam, validateVATEdit, asyncHandler(editOrderVAT));

  /*
   * POST /payments/:orderId/items
   * Adds an extra menu item to an existing order at the counter — for example,
   * if a customer decides to order dessert after the original order was placed.
   * Inventory is deducted automatically when the item is added.
   */
  router.post("/:orderId/items", requirePaymentCounter, validateOrderIdParam, validateAddItem, asyncHandler(addOrderItem));

  /*
   * POST /payments/archive
   * Moves all fully-paid orders from the live orders table into archived_orders.
   * The payment counter calls this at the end of each shift to clear the board.
   */
  router.post("/archive", requirePaymentCounter, asyncHandler(archivePaidOrders));

  /*
   * GET /payments/archived
   * Returns the list of archived (completed and paid) orders for review.
   */
  router.get("/archived", requirePaymentCounter, asyncHandler(getArchivedOrders));

  return router;
};

module.exports = paymentRoutes;
