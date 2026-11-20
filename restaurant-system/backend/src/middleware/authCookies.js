const COOKIE_NAMES = Object.freeze({
  manager: "dfg_manager_session",
  payment_counter: "dfg_payment_session",
  feedback: "dfg_feedback_session"
});

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const FEEDBACK_SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

const isSecureRequest = req =>
  req.secure === true || req.headers?.["x-forwarded-proto"]?.split(",")[0]?.trim() === "https";

const getCookieName = role => {
  const name = COOKIE_NAMES[role];
  if (!name) throw new Error("Unsupported authentication role");
  return name;
};

const getAuthCookieValue = (cookieHeader, role) => {
  if (typeof cookieHeader !== "string") return null;
  const name = getCookieName(role);

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0 || part.slice(0, separatorIndex).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
};

const appendSetCookie = (res, value) => {
  const existing = typeof res.getHeader === "function" ? res.getHeader("Set-Cookie") : null;
  const cookies = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader("Set-Cookie", cookies.length ? [...cookies, value] : value);
};

const setAuthCookie = (res, req, role, token, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) => {
  const name = getCookieName(role);
  const secure = isSecureRequest(req) ? "; Secure" : "";
  appendSetCookie(
    res,
    `${name}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
  res.setHeader("Cache-Control", "no-store");
};

const clearAuthCookie = (res, req, role) => {
  const name = getCookieName(role);
  const secure = isSecureRequest(req) ? "; Secure" : "";
  appendSetCookie(
    res,
    `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
  res.setHeader("Cache-Control", "no-store");
};

module.exports = {
  COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  FEEDBACK_SESSION_MAX_AGE_SECONDS,
  getAuthCookieValue,
  setAuthCookie,
  clearAuthCookie
};
