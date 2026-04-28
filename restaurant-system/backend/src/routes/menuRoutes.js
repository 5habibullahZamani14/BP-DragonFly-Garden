/*
 * Import the Express.js library
 * This is a framework that helps us build web servers and APIs
 */
const express = require("express");

/*
 * Create an Express router object
 * This router will handle HTTP requests related to menu operations
 * It acts as a mini-application that can have its own routes and middleware
 */
const router = express.Router();

/*
 * Import the menu controller functions
 * These functions handle the business logic for menu-related operations
 * getMenu: Retrieves all menu items with categories
 * getCategories: Retrieves all menu categories
 */
const { getMenu, getCategories, recomputePopular } = require("../controllers/menuController");
const { asyncHandler } = require("../middleware/validation");

/*
 * Define a GET route on the root path (/)
 * URL: GET /menu
 * When a client sends a GET request to /menu, the getMenu function is called
 * Returns all available menu items with their categories and details
 */
router.get("/", asyncHandler(getMenu));

/*
 * Define a GET route for categories (/categories)
 * URL: GET /menu/categories
 * When a client sends a GET request to /menu/categories, the getCategories function is called
 * Returns all menu categories sorted by display order
 */
router.get("/categories", asyncHandler(getCategories));

router.post("/popular/recompute", asyncHandler(recomputePopular));

/*
 * Export the router
 * This makes the router available to other files that import this module
 * The main server file will use this router to handle all menu-related requests
 * All routes defined here will be prefixed with /menu (as set in server.js)
 */
module.exports = router;
