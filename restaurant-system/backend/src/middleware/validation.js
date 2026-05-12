/*
 * validation.js — Input validation middleware and global error handling.
 *
 * I centralised all request validation here so that the route files and
 * controllers stay focused on their business logic and do not repeat the
 * same input-checking code. Each exported validate* function is a standard
 * Express middleware: it sanitises and checks the request, then either
 * calls next() to continue or calls next(error) to jump straight to the
 * global error handler at the bottom of this file.
 *
 * The two most important exports are:
 *   asyncHandler  — wraps any async route handler so that thrown errors
 *                   are automatically forwarded to Express's error handling
 *                   chain instead of crashing the process.
 *   errorHandler  — the final Express error middleware that formats all
 *                   errors into a consistent JSON response.
 */

/* Valid order status values, used by multiple validators. */
const ORDER_STATUSES = ["queue", "preparing", "ready"];

/* Hard limits to protect against abusive or malformed requests. */
const MAX_ORDER_ITEMS = 25;
const MAX_ITEM_QUANTITY = 99;
const MAX_NOTES_LENGTH = 250;

/* Pattern used by validateQrCodeParam to verify table QR codes in URL params. */
const QR_CODE_PATTERN = /^table-\d+$/;

/*
 * createHttpError builds an Error object with a statusCode property.
 * Express's error handler (below) reads statusCode to decide which HTTP
 * status to send. This is a lightweight alternative to bringing in an
 * http-errors library dependency.
 */
const createHttpError = (statusCode, message, details) => {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};

/*
 * asyncHandler wraps an async route handler function so that any Promise
 * rejection inside it is passed to Express's next() function. Without this
 * wrapper, an unhandled rejection in an async handler would leave the request
 * hanging without a response.
 */
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/*
 * sanitizeNotes cleans and validates a free-text notes field. It trims
 * whitespace, collapses internal whitespace runs to single spaces, enforces
 * the character limit, and converts empty strings and nullish values to null
 * so the database stores a clean NULL instead of an empty string.
 */
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

/*
 * toPositiveInteger converts any value to a positive integer, returning null
 * if the value is not a valid positive integer. This is used throughout the
 * validators to normalise IDs and quantities that arrive as strings from the
 * request body or URL parameters.
 */
const toPositiveInteger = (value) => {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

/*
 * validateOrderCreation checks and sanitises the body of a POST /orders request.
 * It validates that table_id is a positive integer, that items is a non-empty
 * array within the size limit, and that each item has a valid menu_item_id and
 * quantity. It also aggregates duplicate menu_item_id entries so the database
 * never receives two rows for the same item in one order.
 */
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
    /*
     * I use a Map keyed by menu_item_id to accumulate quantities across
     * duplicate entries. If the same item appears twice in the request,
     * their quantities are summed and the first item's notes are kept.
     */
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

    /* Replace the raw request body with the cleaned, validated version. */
    req.body = {
      table_id: tableId,
      items: [...aggregatedItems.values()]
    };

    next();
  } catch (error) {
    next(error);
  }
};

/*
 * validateStatusUpdate checks that the request body contains a valid status
 * string for a PATCH /orders/:id/status request. It normalises to lowercase
 * so the kitchen crew does not have to worry about capitalisation.
 */
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

/*
 * validateOrderIdParam validates the :id or :orderId URL parameter.
 * It converts the string from the URL to a positive integer and writes it
 * back so controllers always receive a clean numeric string.
 */
const validateOrderIdParam = (req, res, next) => {
  const rawOrderId = req.params?.id ?? req.params?.orderId;
  const orderId = toPositiveInteger(rawOrderId);

  if (!orderId) {
    return next(createHttpError(400, "Valid order ID is required."));
  }

  if (req.params?.id !== undefined) {
    req.params.id = String(orderId);
  }

  if (req.params?.orderId !== undefined) {
    req.params.orderId = String(orderId);
  }

  next();
};

/*
 * validateOrderQuery sanitises the optional query parameters that can be
 * passed to GET /orders: table_id and status. Both are optional, but if
 * present they must be valid values.
 */
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

/*
 * validateQrCodeParam validates the :qrCode URL parameter used on the
 * GET /tables/qr/:qrCode route. It only accepts the table-N format because
 * that is the only QR code type that maps to a physical table lookup.
 */
const validateQrCodeParam = (req, res, next) => {
  const qrCode = typeof req.params?.qrCode === "string" ? req.params.qrCode.trim().toLowerCase() : "";

  if (!QR_CODE_PATTERN.test(qrCode)) {
    return next(createHttpError(400, "Invalid QR code format."));
  }

  req.params.qrCode = qrCode;
  next();
};

/*
 * validatePaymentCreation validates the body of a POST payment request.
 * It requires a payment method, a positive amount, and the employee's
 * ID and name so the payment is attributable in the logs.
 */
const validatePaymentCreation = (req, res, next) => {
  const paymentMethodId = toPositiveInteger(req.body?.payment_method_id);
  const amountPaid = Number(req.body?.amount_paid);
  const employeeId = req.body?.employee_id?.toString().trim();
  const employeeName = req.body?.employee_name?.toString().trim();

  if (!paymentMethodId) {
    return next(createHttpError(400, "Valid payment_method_id is required."));
  }

  if (!amountPaid || amountPaid <= 0) {
    return next(createHttpError(400, "Valid amount_paid is required."));
  }

  if (!employeeId || !employeeName) {
    return next(createHttpError(400, "Employee ID and name are required."));
  }

  req.body = {
    payment_method_id: paymentMethodId,
    amount_paid: amountPaid,
    employee_id: employeeId,
    employee_name: employeeName
  };

  next();
};

/*
 * validateVATEdit validates a VAT rate change request. The rate must be
 * between 0 and 1 (representing 0% to 100%), and the employee making
 * the change must be identified.
 */
const validateVATEdit = (req, res, next) => {
  const vatRate = Number(req.body?.vat_rate);
  const employeeId = req.body?.employee_id?.toString().trim();
  const employeeName = req.body?.employee_name?.toString().trim();

  if (vatRate === null || vatRate === undefined || vatRate < 0 || vatRate > 1) {
    return next(createHttpError(400, "Valid VAT rate (0-1) is required."));
  }

  if (!employeeId || !employeeName) {
    return next(createHttpError(400, "Employee ID and name are required for VAT changes."));
  }

  req.body = {
    vat_rate: vatRate,
    employee_id: employeeId,
    employee_name: employeeName
  };

  next();
};

/*
 * validateAddItem validates a request to add an extra item to an existing
 * order at the payment counter. The employee must be identified because
 * this action is logged in the audit trail.
 */
const validateAddItem = (req, res, next) => {
  const menuItemId = toPositiveInteger(req.body?.menu_item_id);
  const quantity = toPositiveInteger(req.body?.quantity);
  const notes = sanitizeNotes(req.body?.notes);
  const employeeId = req.body?.employee_id?.toString().trim();
  const employeeName = req.body?.employee_name?.toString().trim();

  if (!menuItemId) {
    return next(createHttpError(400, "Valid menu_item_id is required."));
  }

  if (!quantity) {
    return next(createHttpError(400, "Valid quantity is required."));
  }

  if (!employeeId || !employeeName) {
    return next(createHttpError(400, "Employee ID and name are required."));
  }

  req.body = {
    menu_item_id: menuItemId,
    quantity,
    notes,
    employee_id: employeeId,
    employee_name: employeeName
  };

  next();
};

/*
 * notFoundHandler is registered after all route groups and generates a 404
 * error for any request that did not match any defined route. It passes the
 * error to errorHandler below.
 */
const notFoundHandler = (req, res, next) => {
  next(createHttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/*
 * errorHandler is the global error-handling middleware. Express recognises it
 * as an error handler because it has four parameters (err, req, res, next).
 * It must be registered last in server.js after all other middleware.
 *
 * It handles three specific error types specially:
 *   entity.parse.failed — malformed JSON in the request body
 *   SQLITE_CONSTRAINT    — a database unique/foreign-key constraint violation
 * Everything else uses the statusCode set by createHttpError, defaulting to 500.
 */
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
  validatePaymentCreation,
  validateVATEdit,
  validateAddItem,
  notFoundHandler,
  errorHandler
};
