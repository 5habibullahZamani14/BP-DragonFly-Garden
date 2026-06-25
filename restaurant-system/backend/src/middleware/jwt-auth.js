const jwt = require("jsonwebtoken");
const { createHttpError } = require("./validation");
const { ROLES } = require("./role-based-access");

const db = require("../database/db");
const jwt = require("jsonwebtoken");
const { createHttpError } = require("./validation");
const { ROLES } = require("./role-based-access");

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
};

const getRestaurantSetting = (key) =>
  new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });

const parseStoredSession = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const verifyJwtToken = async (req, allowedRoles = []) => {
  const token = getBearerToken(req);
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

module.exports = {
  getBearerToken,
  verifyJwtToken,
  requireManagerToken,
  requirePaymentToken,
};
