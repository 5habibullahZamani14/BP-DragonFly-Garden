/*
 * role-based-access.js — customer table QR detection and request context.
 *
 * Only customer table QR codes are treated as public entry points. Staff and
 * manager access is authenticated via username/password and server-issued JWTs.
 * Any legacy manager/payment QR route is rejected so that a QR value can never
 * grant privileged access.
 */

const { createHttpError } = require("./validation");

/*
 * Role constants. Using a plain object instead of a string enum keeps the
 * code compatible with plain Node.js without needing TypeScript or Babel.
 */
const ROLES = {
  CUSTOMER_WAITER: "customer_waiter",
  PAYMENT_COUNTER: "payment_counter",
  MANAGER: "manager"
};

/*
 * Only table QR codes are valid for public customer entry. QR values used for
 * staff or manager authentication are explicitly rejected.
 */
const QR_PATTERNS = {
  TABLE_QR: /^table-\d+$/,
  LEGACY_PRIVILEGED_QR: /^(payment-counter|manager)-[\w:]+$/
};

const getRoleFromQRCode = (qrCode) => {
  if (!qrCode) {
    return null;
  }

  if (QR_PATTERNS.LEGACY_PRIVILEGED_QR.test(qrCode)) {
    return null;
  }

  if (QR_PATTERNS.TABLE_QR.test(qrCode)) {
    return ROLES.CUSTOMER_WAITER;
  }

  return null;
};

/*
 * getTableNumberFromQR extracts the numeric table number from a table QR code.
 * For example, "table-3" returns 3. Returns null for any non-table QR code.
 * Controllers use this to know which table an order or request belongs to.
 */
const getTableNumberFromQR = (qrCode) => {
  if (!QR_PATTERNS.TABLE_QR.test(qrCode)) {
    return null;
  }

  const match = qrCode.match(/table-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

/*
 * attachRoleMiddleware runs on every request before any route handler.
 * It reads the qr_code query parameter (sent by the frontend on every API
 * call), resolves the role, and stores both the role and the QR code string
 * on the request object. For table requests it also extracts and stores the
 * table number. Requests without a recognisable QR code get no role attached —
 * route-level guards then decide whether to reject or allow those requests.
 */
const attachRoleMiddleware = (req, res, next) => {
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

/*
 * requireRole is a factory that produces a middleware function enforcing
 * a specific role. If the request has no role or the wrong role, it passes
 * a 401 or 403 HTTP error to Express's error handler. Route files call this
 * factory once at startup and use the resulting middleware on protected routes.
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

/* Pre-built middleware instances for each role — imported directly by route files. */
const requirePaymentCounter = requireRole(ROLES.PAYMENT_COUNTER);

/*
 * requireCustomerOrWaiter is a specialised guard for the customer/waiter role.
 * Written separately from requireRole because the error message is more
 * descriptive for this specific case.
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
  requirePaymentCounter,
  requireCustomerOrWaiter
};
