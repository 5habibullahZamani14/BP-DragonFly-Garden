/*
 * Import the Express.js library
 * This is a framework that helps us build web servers and APIs
 */
const express = require("express");

/*
 * Create an Express router object
 * This router will handle HTTP requests related to payment operations
 */
const router = express.Router();

/*
 * Import the payment controller functions
 */
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

/*
 * Import validation middleware functions
 */
const {
  asyncHandler,
  validatePaymentCreation,
  validateVATEdit,
  validateAddItem,
  validateOrderIdParam
} = require("../middleware/validation");

const { requirePaymentCounter } = require("../middleware/role-based-access");

/*
 * GET /payment-methods
 * Returns all available payment methods
 */
router.get("/methods", asyncHandler(getPaymentMethods));

/*
 * GET /unpaid
 * Returns all unpaid orders with details
 */
router.get("/unpaid", requirePaymentCounter, asyncHandler(getUnpaidOrders));

/*
 * GET /paid
 * Returns all paid orders for the day (toggleable history)
 */
router.get("/paid", requirePaymentCounter, asyncHandler(getPaidOrders));

/*
 * POST /:orderId/payments
 * Process a payment for an order
 */
router.post("/:orderId/payments", requirePaymentCounter, validateOrderIdParam, validatePaymentCreation, asyncHandler(processPayment));

/*
 * GET /:orderId/payments
 * Get payment history for an order
 */
router.get("/:orderId/payments", requirePaymentCounter, validateOrderIdParam, asyncHandler(getOrderPayments));

/*
 * PATCH /:orderId/vat
 * Edit VAT rate for an order (requires employee auth)
 */
router.patch("/:orderId/vat", requirePaymentCounter, validateOrderIdParam, validateVATEdit, asyncHandler(editOrderVAT));

/*
 * POST /:orderId/items
 * Add item to an order
 */
router.post("/:orderId/items", requirePaymentCounter, validateOrderIdParam, validateAddItem, asyncHandler(addOrderItem));

/*
 * POST /archive
 * Archive all paid orders at end of day
 */
router.post("/archive", requirePaymentCounter, asyncHandler(archivePaidOrders));

/*
 * GET /archived
 * Get archived orders with search/filter
 */
router.get("/archived", requirePaymentCounter, asyncHandler(getArchivedOrders));

module.exports = router;