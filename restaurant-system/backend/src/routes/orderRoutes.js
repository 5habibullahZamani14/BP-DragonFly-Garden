/*
 * Import the Express.js library
 * This is a framework that helps us build web servers and APIs
 */
const express = require("express");

/*
 * Create an Express router object
 * This router will handle HTTP requests related to order operations
 * It acts as a mini-application that can have its own routes and middleware
 */
const router = express.Router();

/*
 * Import the order controller functions
 * These functions handle the business logic for order operations:
 * - createOrder: Creates a new order with items
 * - getOrder: Retrieves a specific order by ID
 * - getOrders: Retrieves all orders (with optional filters)
 * - updateOrderStatus: Updates the status of an existing order
 */
const { 
  createOrder, 
  getOrder, 
  getOrders,
  getKitchenOrders,
  updateOrderStatus 
} = require("../controllers/orderController");

/*
 * Import validation middleware functions
 * These middleware functions validate incoming request data before processing
 * - validateOrderCreation: Validates order creation requests
 * - validateStatusUpdate: Validates order status update requests
 */
const { 
  asyncHandler,
  validateOrderCreation,
  validateStatusUpdate,
  validateOrderIdParam,
  validateOrderQuery
} = require("../middleware/validation");

const { requireKitchenCrew, requireCustomerOrWaiter } = require("../middleware/role-based-access");

/*
 * Define a POST route on the root path (/)
 * URL: POST /orders
 * Middleware chain: validateOrderCreation → createOrder
 * First validates the request, then creates the order if valid
 * Request body should contain:
 *   - table_id: The ID of the table placing the order
 *   - items: Array of items with menu_item_id, quantity, and optional notes
 * Returns the newly created order ID and total price
 */
router.post("/", validateOrderCreation, asyncHandler(createOrder));

/*
 * Define a GET route for all orders (/orders)
 * URL: GET /orders
 * When a client sends a GET request to /orders, the getOrders function is called
 * Optional query parameters:
 *   - table_id: Filter orders for a specific table
 *   - status: Filter orders by status (pending, confirmed, cooking, ready, completed)
 * Returns an array of orders matching the criteria
 */
router.get("/", validateOrderQuery, asyncHandler(getOrders));
router.get("/kitchen", validateOrderQuery, asyncHandler(getKitchenOrders));

/*
 * Define a GET route for a specific order (/:id)
 * URL: GET /orders/123
 * When a client sends a GET request to /orders/123, the getOrder function is called
 * The :id parameter is extracted from the URL and passed to the controller
 * Returns the specific order with all its items and details
 */
router.get("/:id", validateOrderIdParam, asyncHandler(getOrder));

/*
 * Define a PATCH route to update order status (/:id/status)
 * URL: PATCH /orders/123/status
 * Middleware chain: requireKitchenCrew → validateStatusUpdate → updateOrderStatus
 * First checks that user is kitchen crew, validates the status, then updates the order
 * Request body should contain:
 *   - status: The new status (pending, confirmed, cooking, ready, or completed)
 * Returns a confirmation of the status update
 */
router.patch("/:id/status", requireKitchenCrew, validateOrderIdParam, validateStatusUpdate, asyncHandler(updateOrderStatus));

/*
 * Export the router
 * This makes the router available to other files that import this module
 * The main server file will use this router to handle all order-related requests
 * All routes defined here will be prefixed with /orders (as set in server.js)
 */
module.exports = router;
