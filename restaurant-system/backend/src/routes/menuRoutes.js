/*
 * menuRoutes.js — HTTP routes for menu data.
 *
 * These three endpoints serve the menu to the customer view and provide
 * an administrative endpoint for recomputing which item is currently
 * the most popular. All routes are read-only from the customer's perspective.
 */

const express = require("express");
const { getMenu, getCategories, recomputePopular } = require("../controllers/menuController");
const { asyncHandler } = require("../middleware/validation");

const router = express.Router();

/*
 * GET /menu
 * Returns all available menu items with their category and image information.
 * This is the first request the customer view makes when it loads.
 * No authentication is required — anyone on the local network can browse the menu.
 */
router.get("/", asyncHandler(getMenu));

/*
 * GET /menu/categories
 * Returns all menu categories sorted by display_order. The customer view uses
 * this to build the category filter tabs at the top of the menu.
 */
router.get("/categories", asyncHandler(getCategories));

/*
 * POST /menu/popular/recompute
 * Queries the order history to find the most-ordered item(s) over a given
 * lookback period and marks them as popular in the database. This updates
 * the spotlight card shown at the top of the customer menu.
 * Body params: lookback_days (default 7), top (default 1, max 5).
 * This endpoint can be called on a schedule from any HTTP client — for example
 * a cron job on the Raspberry Pi running once per week.
 */
router.post("/popular/recompute", asyncHandler(recomputePopular));

module.exports = router;
