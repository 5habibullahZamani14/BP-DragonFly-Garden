const express = require("express");
const { getTables, getTableByQrCode, createTable, updateTable, deleteTable } = require("../controllers/tableController");
const { asyncHandler, validateQrCodeParam } = require("../middleware/validation");

const router = express.Router();

router.get("/", asyncHandler(getTables));
router.post("/", asyncHandler(createTable));
router.put("/:id", asyncHandler(updateTable));
router.delete("/:id", asyncHandler(deleteTable));
router.get("/qr/:qrCode", validateQrCodeParam, asyncHandler(getTableByQrCode));

module.exports = router;
