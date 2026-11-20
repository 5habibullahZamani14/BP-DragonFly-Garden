const isTrustedOrigin = (origin, requestHost, allowedOrigins = [], allowDevelopmentPort = false, requestProtocol) => {
  if (!origin) return true;
  if (typeof origin !== "string" || origin === "null") return false;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const originUrl = new URL(origin);
    const host = String(requestHost || "").toLowerCase();
    const sameProtocol = !requestProtocol || originUrl.protocol === `${requestProtocol}:`;
    if (originUrl.host.toLowerCase() === host && sameProtocol) return true;
    if (allowDevelopmentPort && host) {
      return sameProtocol && originUrl.hostname.toLowerCase() === new URL(`http://${host}`).hostname.toLowerCase();
    }
  } catch {
    return false;
  }

  return false;
};

const createTrustedOriginMiddleware = (allowedOrigins = [], allowDevelopmentPort = false, getRequestProtocol = req => req.protocol) =>
  (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    const origin = req.get("Origin");
    if (isTrustedOrigin(origin, req.get("host"), allowedOrigins, allowDevelopmentPort, getRequestProtocol(req))) return next();
    return res.status(403).json({ error: "Request origin is not allowed" });
  };

module.exports = { isTrustedOrigin, createTrustedOriginMiddleware };
