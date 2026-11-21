const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { createHttpError } = require("./validation");
const { ROLES } = require("./role-based-access");
const db = require("../database/db");
const { getAuthCookieValue } = require("./authCookies");
const { hashTableQrCode } = require("../utils/tableQrCode");

const getBearerToken = (req, allowedRoles = []) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim() || null;
  }

  if (allowedRoles.includes(ROLES.MANAGER)) {
    return getAuthCookieValue(req.headers.cookie, "manager");
  }
  if (allowedRoles.includes(ROLES.PAYMENT_COUNTER)) {
    return getAuthCookieValue(req.headers.cookie, "payment_counter");
  }
  return null;
};

const getRestaurantSetting = (key) =>
  new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });

const getTableQrCode = (tableId) =>
  new Promise((resolve, reject) => {
    db.get("SELECT id, qr_code FROM tables WHERE id = ?", [tableId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });

const verifyCustomerTableToken = async (cookieHeader) => {
  const token = getAuthCookieValue(cookieHeader, "customer_table");
  if (!token) throw createHttpError(401, "Please scan the table QR code to continue.");
  if (!process.env.JWT_SECRET) throw createHttpError(500, "Server misconfiguration: missing JWT secret");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw createHttpError(401, "Your table session has expired. Please scan the table QR code again.");
  }

  if (
    !decoded ||
    decoded.role !== ROLES.CUSTOMER_WAITER ||
    decoded.action !== "customer_table_session" ||
    !Number.isSafeInteger(decoded.tableId) ||
    typeof decoded.qrHash !== "string"
  ) {
    throw createHttpError(401, "Invalid table session. Please scan the table QR code again.");
  }

  const table = await getTableQrCode(decoded.tableId);
  if (!table || table.id === 999) {
    throw createHttpError(401, "This table session is no longer valid. Please scan the table QR code again.");
  }

  const expectedHash = Buffer.from(hashTableQrCode(table.qr_code), "hex");
  const tokenHash = Buffer.from(decoded.qrHash, "hex");
  if (expectedHash.length !== tokenHash.length || !crypto.timingSafeEqual(expectedHash, tokenHash)) {
    throw createHttpError(401, "This table QR code has been replaced. Please scan the new code.");
  }

  return { tableId: table.id, role: ROLES.CUSTOMER_WAITER, sessionId: decoded.sessionId || null };
};

const parseStoredSession = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const verifyJwtToken = async (req, allowedRoles = []) => {
  const token = getBearerToken(req, allowedRoles);
  if (!token) {
    throw createHttpError(401, "Unauthorized: Missing token");
  }

  if (!process.env.JWT_SECRET) {
    throw createHttpError(500, "Server misconfiguration: missing JWT secret");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw createHttpError(401, "Unauthorized: Invalid or expired token");
  }

  if (!decoded || typeof decoded !== "object" || !decoded.role) {
    throw createHttpError(403, "Forbidden: Invalid or malformed token");
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
    if (decoded.role !== ROLES.MANAGER) {
      throw createHttpError(403, "Forbidden: Insufficient privileges");
    }
  }

  const now = Date.now();

  if (decoded.role === ROLES.MANAGER) {
    const rawValue = await getRestaurantSetting("manager_session");
    const session = parseStoredSession(rawValue);

    if (
      !session ||
      session.sessionId !== decoded.sessionId ||
      session.managerId !== decoded.id ||
      !session.expiresAt ||
      Number(session.expiresAt) <= now
    ) {
      throw createHttpError(401, "Manager session invalid or expired. Please log in again.");
    }
  }

  if (decoded.role === ROLES.PAYMENT_COUNTER) {
    const rawValue = await getRestaurantSetting("payment_counter_session");
    const session = parseStoredSession(rawValue);

    if (
      !session ||
      session.sessionId !== decoded.sessionId ||
      session.employee_id !== decoded.id ||
      !session.expiresAt ||
      Number(session.expiresAt) <= now
    ) {
      throw createHttpError(401, "Payment counter session invalid or expired. Please log in again.");
    }
  }

  return decoded;
};

const requireJwtRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const decoded = await verifyJwtToken(req, allowedRoles);
      req.user = {
        id: decoded.id,
        role: decoded.role,
        name: decoded.name || null,
        department: decoded.department || null,
        sessionId: decoded.sessionId || null,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
};

const requireManagerToken = requireJwtRole([ROLES.MANAGER]);
const requirePaymentToken = requireJwtRole([ROLES.PAYMENT_COUNTER]);
const requireStaffToken = requireJwtRole([ROLES.MANAGER, ROLES.PAYMENT_COUNTER]);
const requireCustomerTableToken = async (req, res, next) => {
  try {
    const tableSession = await verifyCustomerTableToken(req.headers.cookie);
    req.customerTableId = tableSession.tableId;
    req.userRole = tableSession.role;
    req.user = { id: tableSession.tableId, role: tableSession.role };
    next();
  } catch (err) {
    next(err);
  }
};

const requireCustomerOrPaymentToken = (req, res, next) => {
  const hasStaffSession =
    getAuthCookieValue(req.headers.cookie, "manager") ||
    getAuthCookieValue(req.headers.cookie, "payment_counter");
  if (!hasStaffSession && getAuthCookieValue(req.headers.cookie, "customer_table")) {
    return requireCustomerTableToken(req, res, next);
  }
  return requireStaffToken(req, res, next);
};

module.exports = {
  getBearerToken,
  verifyJwtToken,
  verifyCustomerTableToken,
  requireManagerToken,
  requirePaymentToken,
  requireStaffToken,
  requireCustomerTableToken,
  requireCustomerOrPaymentToken,
};
