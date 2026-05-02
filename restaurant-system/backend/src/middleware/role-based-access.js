/**
 * Role-Based Access Control Middleware
 * Determines user role based on QR code type and session
 * Supports customer/waiter vs kitchen crew roles
 */

const { createHttpError } = require("./validation");

// Role constants
const ROLES = {
  CUSTOMER_WAITER: "customer_waiter",
  KITCHEN_CREW: "kitchen_crew",
  PAYMENT_COUNTER: "payment_counter"
};

// QR code patterns to identify role
const QR_PATTERNS = {
  TABLE_QR: /^table-\d+$/,           // Table QR codes (e.g., "table-1", "table-2")
  KITCHEN_QR: /^kitchen-crew-\w+$/,  // Kitchen QR codes (e.g., "kitchen-crew-main")
  PAYMENT_QR: /^payment-counter-\w+$/ // Payment counter QR codes (e.g., "payment-counter-main")
};

/**
 * Determine user role from QR code
 * @param {string} qrCode - The QR code string
 * @returns {string} - The user role (CUSTOMER_WAITER, KITCHEN_CREW, or PAYMENT_COUNTER)
 */
const getRoleFromQRCode = (qrCode) => {
  if (!qrCode) {
    return null;
  }

  if (QR_PATTERNS.KITCHEN_QR.test(qrCode)) {
    return ROLES.KITCHEN_CREW;
  }

  if (QR_PATTERNS.PAYMENT_QR.test(qrCode)) {
    return ROLES.PAYMENT_COUNTER;
  }

  if (QR_PATTERNS.TABLE_QR.test(qrCode)) {
    return ROLES.CUSTOMER_WAITER;
  }

  return null;
};

/**
 * Extract table number from table QR code
 * @param {string} qrCode - QR code in format "table-{number}"
 * @returns {number|null} - Table number or null if not a valid table QR
 */
const getTableNumberFromQR = (qrCode) => {
  if (!QR_PATTERNS.TABLE_QR.test(qrCode)) {
    return null;
  }

  const match = qrCode.match(/table-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Middleware to attach role information to request
 * Extracts role from session or query parameter
 */
const attachRoleMiddleware = (req, res, next) => {
  // Get QR code from query parameter or session
  const qrCode = req.query.qr_code || req.session?.qr_code;

  if (qrCode) {
    const role = getRoleFromQRCode(qrCode);
    
    if (role) {
      req.userRole = role;
      req.qrCode = qrCode;

      if (role === ROLES.CUSTOMER_WAITER) {
        const tableNumber = getTableNumberFromQR(qrCode);
        if (tableNumber) {
          req.tableNumber = tableNumber;
        }
      }
    }
  }

  next();
};

/**
 * Middleware to require a specific role
 * @param {string} requiredRole - The role required to access the endpoint
 * @returns {Function} - Express middleware function
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return next(createHttpError(401, "User role not identified. Please scan a valid QR code."));
    }

    if (req.userRole !== requiredRole) {
      return next(
        createHttpError(403, `This action is not permitted for ${req.userRole}. Required role: ${requiredRole}`)
      );
    }

    next();
  };
};

/**
 * Middleware to require kitchen crew role
 */
const requireKitchenCrew = requireRole(ROLES.KITCHEN_CREW);

/**
 * Middleware to require payment counter role
 */
const requirePaymentCounter = requireRole(ROLES.PAYMENT_COUNTER);

/**
 * Middleware to require customer or waiter role
 */
const requireCustomerOrWaiter = (req, res, next) => {
  if (!req.userRole) {
    return next(createHttpError(401, "User role not identified. Please scan a valid QR code."));
  }

  if (req.userRole !== ROLES.CUSTOMER_WAITER) {
    return next(createHttpError(403, "This action is only available for customers and waiters."));
  }

  next();
};

module.exports = {
  ROLES,
  QR_PATTERNS,
  getRoleFromQRCode,
  getTableNumberFromQR,
  attachRoleMiddleware,
  requireRole,
  requireKitchenCrew,
  requirePaymentCounter,
  requireCustomerOrWaiter
};
