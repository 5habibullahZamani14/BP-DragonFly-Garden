/*
 * role-based-access.js — customer table QR detection and request context.
 *
 * Only customer table QR codes are treated as public entry points. Staff and
 * manager access is authenticated via username/password and server-issued JWTs.
 * Any legacy manager/payment QR route is rejected so that a QR value can never
 * grant privileged access.
 */

const { createHttpError } = require("./validation");
const { TABLE_QR_PATTERN, normalizeTableQrCode } = require("../utils/tableQrCode");

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
  TABLE_QR: TABLE_QR_PATTERN,
  LEGACY_PRIVILEGED_QR: /^(payment-counter|manager)-[\w:]+$/
};

const getRoleFromQRCode = (qrCode) => {
  if (!qrCode) {
    return null;
  }

  const normalizedQr = normalizeTableQrCode(qrCode);
  if (!normalizedQr && QR_PATTERNS.LEGACY_PRIVILEGED_QR.test(qrCode)) {
    return null;
  }

  if (normalizedQr) {
    return ROLES.CUSTOMER_WAITER;
  }

  return null;
};

/*
 * Random QR credentials do not encode a table ID. Table ownership is resolved
 * only after the backend validates the HttpOnly table-session cookie.
 */
const getTableNumberFromQR = (_qrCode) => {
  return null;
};

/*
 * attachRoleMiddleware runs on every request before any route handler.
 * QR credentials may only bootstrap a table session; their presence in a
 * query string never authenticates the request or grants a role.
 */
const attachRoleMiddleware = (req, res, next) => {
  const qrCode = req.query.qr_code || req.session?.qr_code;

  if (qrCode) {
    req.qrCode = normalizeTableQrCode(qrCode);
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
  if (!Number.isSafeInteger(req.customerTableId)) {
    return next(createHttpError(401, "Please scan the table QR code to continue."));
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
