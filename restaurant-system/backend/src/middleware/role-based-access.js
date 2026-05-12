/*
 * role-based-access.js — QR-code-based role detection and access control.
 *
 * This is the core security layer of the application. Because the system
 * has no traditional login screen for customers or kitchen crew, I needed
 * a different way to know who is making each request. The solution is to
 * embed the user's role in the QR code they scan to enter the application.
 *
 * When a customer scans their table QR code, the URL they land on contains
 * a parameter like ?qr=table-3. When kitchen crew scan their dedicated QR
 * code, the URL contains ?qr=kitchen-crew-main. This middleware reads that
 * parameter on every incoming request and attaches the resolved role to the
 * request object. Route handlers and controllers then check req.userRole
 * instead of a session token.
 *
 * The four roles in this system are:
 *   customer_waiter   — Scanning a table QR. Can browse the menu and place orders.
 *   kitchen_crew      — Scanning the kitchen QR. Can view and update order status.
 *   payment_counter   — Scanning the payment QR. Can process payments.
 *   manager           — Scanning the manager QR. Can access the full dashboard.
 */

const { createHttpError } = require("./validation");

/*
 * Role constants. Using a plain object instead of a string enum keeps the
 * code compatible with plain Node.js without needing TypeScript or Babel.
 */
const ROLES = {
  CUSTOMER_WAITER: "customer_waiter",
  KITCHEN_CREW: "kitchen_crew",
  PAYMENT_COUNTER: "payment_counter",
  MANAGER: "manager"
};

/*
 * QR code patterns. Each role has a distinct prefix in its QR code string.
 * The regex patterns enforce the expected format so that a malformed or
 * unknown QR code string does not accidentally grant access.
 *
 *   Table QR:      "table-1", "table-2", ...
 *   Kitchen QR:    "kitchen-crew-main", "kitchen-crew-secondary", ...
 *   Payment QR:    "payment-counter-main", "payment-counter-demo:1", ...
 *   Manager QR:    "manager-main", ...
 */
const QR_PATTERNS = {
  TABLE_QR: /^table-\d+$/,
  KITCHEN_QR: /^kitchen-crew-[\w:]+$/,
  PAYMENT_QR: /^payment-counter-[\w:]+$/,
  MANAGER_QR: /^manager-[\w:]+$/
};

/*
 * getRoleFromQRCode reads the QR code string and returns the matching role.
 * The order of checks matters: more specific patterns (manager, kitchen) are
 * tested before the general table pattern to avoid any ambiguity.
 * Returns null if the QR code does not match any known pattern.
 */
const getRoleFromQRCode = (qrCode) => {
  if (!qrCode) {
    return null;
  }

  if (QR_PATTERNS.KITCHEN_QR.test(qrCode)) {
    return ROLES.KITCHEN_CREW;
  }

  if (QR_PATTERNS.MANAGER_QR.test(qrCode)) {
    return ROLES.MANAGER;
  }

  if (QR_PATTERNS.PAYMENT_QR.test(qrCode)) {
    return ROLES.PAYMENT_COUNTER;
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
const requireKitchenCrew = requireRole(ROLES.KITCHEN_CREW);
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
  requireKitchenCrew,
  requirePaymentCounter,
  requireCustomerOrWaiter
};
