const express = require("express");
const { getTables, getTableByQrCode } = require("../controllers/tableController");
const { asyncHandler, validateQrCodeParam } = require("../middleware/validation");

const router = express.Router();

router.get("/", asyncHandler(getTables));
router.get("/qr/:qrCode", validateQrCodeParam, asyncHandler(getTableByQrCode));

module.exports = router;
