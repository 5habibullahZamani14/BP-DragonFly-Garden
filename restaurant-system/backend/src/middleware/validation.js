const ORDER_STATUSES = ["pending", "confirmed", "cooking", "ready", "completed"];
const MAX_ORDER_ITEMS = 25;
const MAX_ITEM_QUANTITY = 99;
const MAX_NOTES_LENGTH = 250;
const QR_CODE_PATTERN = /^table-\d+$/;

const createHttpError = (statusCode, message, details) => {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const sanitizeNotes = (notes) => {
  if (notes === undefined || notes === null || notes === "") {
    return null;
  }

  if (typeof notes !== "string") {
    throw createHttpError(400, "Notes must be a string.");
  }

  const sanitized = notes.trim().replace(/\s+/g, " ");

  if (sanitized.length > MAX_NOTES_LENGTH) {
    throw createHttpError(400, `Notes must be ${MAX_NOTES_LENGTH} characters or less.`);
  }

  return sanitized || null;
};

const toPositiveInteger = (value) => {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const validateOrderCreation = (req, res, next) => {
  const tableId = toPositiveInteger(req.body?.table_id);
  const items = req.body?.items;

  if (!tableId) {
    return next(createHttpError(400, "Invalid table_id. Must be a positive integer."));
  }

  if (!Array.isArray(items) || items.length === 0) {
    return next(createHttpError(400, "Items array is required and must contain at least one item."));
  }

  if (items.length > MAX_ORDER_ITEMS) {
    return next(createHttpError(400, `Orders may contain at most ${MAX_ORDER_ITEMS} line items.`));
  }

  try {
    const aggregatedItems = new Map();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const menuItemId = toPositiveInteger(item?.menu_item_id);
      const quantity = toPositiveInteger(item?.quantity);

      if (!menuItemId) {
        throw createHttpError(400, `Item ${index + 1}: Invalid menu_item_id. Must be a positive integer.`);
      }

      if (!quantity) {
        throw createHttpError(400, `Item ${index + 1}: Invalid quantity. Must be a positive integer.`);
      }

      if (quantity > MAX_ITEM_QUANTITY) {
        throw createHttpError(400, `Item ${index + 1}: Quantity must be ${MAX_ITEM_QUANTITY} or less.`);
      }

      const notes = sanitizeNotes(item?.notes);
      const existing = aggregatedItems.get(menuItemId);

      if (existing) {
        const combinedQuantity = existing.quantity + quantity;

        if (combinedQuantity > MAX_ITEM_QUANTITY) {
          throw createHttpError(
            400,
            `Menu item ${menuItemId}: Combined quantity must be ${MAX_ITEM_QUANTITY} or less.`
          );
        }

        aggregatedItems.set(menuItemId, {
          ...existing,
          quantity: combinedQuantity,
          notes: existing.notes || notes
        });
        continue;
      }

      aggregatedItems.set(menuItemId, {
        menu_item_id: menuItemId,
        quantity,
        notes
      });
    }

    req.body = {
      table_id: tableId,
      items: [...aggregatedItems.values()]
    };

    next();
  } catch (error) {
    next(error);
  }
};

const validateStatusUpdate = (req, res, next) => {
  const rawStatus = req.body?.status;

  if (typeof rawStatus !== "string" || !rawStatus.trim()) {
    return next(createHttpError(400, "Status is required in the request body."));
  }

  const status = rawStatus.trim().toLowerCase();

  if (!ORDER_STATUSES.includes(status)) {
    return next(createHttpError(400, `Invalid status. Must be one of: ${ORDER_STATUSES.join(", ")}`));
  }

  req.body.status = status;
  next();
};

const validateOrderIdParam = (req, res, next) => {
  const orderId = toPositiveInteger(req.params?.id);

  if (!orderId) {
    return next(createHttpError(400, "Valid order ID is required."));
  }

  req.params.id = String(orderId);
  next();
};

const validateOrderQuery = (req, res, next) => {
  const sanitizedQuery = {};

  if (req.query.table_id !== undefined) {
    const tableId = toPositiveInteger(req.query.table_id);

    if (!tableId) {
      return next(createHttpError(400, "table_id must be a positive integer."));
    }

    sanitizedQuery.table_id = String(tableId);
  }

  if (req.query.status !== undefined) {
    if (typeof req.query.status !== "string" || !req.query.status.trim()) {
      return next(createHttpError(400, "status must be a non-empty string."));
    }

    const status = req.query.status.trim().toLowerCase();

    if (!ORDER_STATUSES.includes(status)) {
      return next(createHttpError(400, `status must be one of: ${ORDER_STATUSES.join(", ")}`));
    }

    sanitizedQuery.status = status;
  }

  req.query = sanitizedQuery;
  next();
};

const validateQrCodeParam = (req, res, next) => {
  const qrCode = typeof req.params?.qrCode === "string" ? req.params.qrCode.trim().toLowerCase() : "";

  if (!QR_CODE_PATTERN.test(qrCode)) {
    return next(createHttpError(400, "Invalid QR code format."));
  }

  req.params.qrCode = qrCode;
  next();
};

const notFoundHandler = (req, res, next) => {
  next(createHttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Malformed JSON request body.",
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === "SQLITE_CONSTRAINT") {
    return res.status(409).json({
      error: "Database constraint violation.",
      timestamp: new Date().toISOString()
    });
  }

  const payload = {
    error: err.message || "Internal server error",
    timestamp: new Date().toISOString()
  };

  if (err.details !== undefined) {
    payload.details = err.details;
  }

  return res.status(err.statusCode || 500).json(payload);
};

module.exports = {
  ORDER_STATUSES,
  asyncHandler,
  createHttpError,
  validateOrderCreation,
  validateStatusUpdate,
  validateOrderIdParam,
  validateOrderQuery,
  validateQrCodeParam,
  notFoundHandler,
  errorHandler
};
