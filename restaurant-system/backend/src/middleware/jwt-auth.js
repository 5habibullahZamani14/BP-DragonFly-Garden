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

const verifyJwtToken = (req, allowedRoles = []) => {
  const token = getBearerToken(req);
  if (!token) {
    throw createHttpError(401, "Unauthorized: Missing token");
  }

  if (!process.env.JWT_SECRET) {
    throw createHttpError(500, "Server misconfiguration: missing JWT secret");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded || typeof decoded !== "object" || !decoded.role) {
    throw createHttpError(403, "Forbidden: Invalid or malformed token");
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
    if (decoded.role !== ROLES.MANAGER) {
      throw createHttpError(403, "Forbidden: Insufficient privileges");
    }
  }

  return decoded;
};

const requireJwtRole = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      const decoded = verifyJwtToken(req, allowedRoles);
      req.user = {
        id: decoded.id,
        role: decoded.role,
        name: decoded.name || null,
        department: decoded.department || null,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
};

const requireManagerToken = requireJwtRole([ROLES.MANAGER]);
const requirePaymentToken = requireJwtRole([ROLES.PAYMENT_COUNTER]);
const requireKitchenToken = requireJwtRole([ROLES.KITCHEN_CREW]);

module.exports = {
  getBearerToken,
  verifyJwtToken,
  requireManagerToken,
  requirePaymentToken,
  requireKitchenToken,
};
