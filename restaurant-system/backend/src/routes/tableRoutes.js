/*
 * tableRoutes.js — HTTP routes for restaurant table management.
 *
 * These routes cover the full CRUD cycle for tables: listing all tables
 * (with their generated QR codes), looking up a table by its QR code string,
 * creating new tables, updating existing ones, and deleting them.
 *
 * Table management is done through the manager's dashboard. The QR lookup
 * route (/qr/:qrCode) is also called by the frontend on startup to resolve
 * a table's database ID from the QR code in the URL — this is how the app
 * knows which table a customer is sitting at.
 */

const express = require("express");
const { getTables, getTableByQrCode, createTable, updateTable, deleteTable } = require("../controllers/tableController");
const { asyncHandler, validateQrCodeParam } = require("../middleware/validation");

const router = express.Router();

/*
 * GET /tables
 * Returns all tables with their table numbers, QR codes, ordering URLs, and
 * pre-rendered SVG QR code images. The management dashboard uses this to
 * display and manage the table list.
 */
router.get("/", asyncHandler(getTables));

/*
 * POST /tables
 * Creates a new table. Body must include table_number and qr_code.
 * The controller generates and caches the QR code SVG automatically.
 */
router.post("/", asyncHandler(createTable));

/*
 * PUT /tables/:id
 * Updates an existing table's number or QR code. The SVG cache is invalidated
 * automatically when the ordering URL changes.
 */
router.put("/:id", asyncHandler(updateTable));

/*
 * DELETE /tables/:id
 * Removes a table from the database. The controller logs this action in
 * grand_archive_logs before deleting.
 */
router.delete("/:id", asyncHandler(deleteTable));

/*
 * GET /tables/qr/:qrCode
 * Looks up a table by its QR code string. The frontend calls this on load
 * when it detects a table QR code in the URL, and uses the returned table ID
 * for all subsequent order requests. validateQrCodeParam ensures the :qrCode
 * parameter matches the expected table-N format before it reaches the controller.
 */
router.get("/qr/:qrCode", validateQrCodeParam, asyncHandler(getTableByQrCode));

module.exports = router;
