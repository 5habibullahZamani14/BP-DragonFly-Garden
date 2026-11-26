const getManagerActionTab = (requestPath) => {
  if (/^\/management\/printers(?:\/|$)/i.test(requestPath)) return "settings";
  if (/^\/management\/(?:settings|auth|profile)(?:\/|$)/i.test(requestPath)) return "settings";
  if (/^\/(?:inventory|management\/inventory)(?:\/|$)/i.test(requestPath)) return "inventory";
  if (/^\/(?:employees|management\/employees)(?:\/|$)/i.test(requestPath)) return "employees";
  if (/^\/(?:tables|management\/tables)(?:\/|$)/i.test(requestPath)) return "tables";
  if (/^\/(?:payments|management\/payments)(?:\/|$)/i.test(requestPath)) return "finance";
  if (/^\/(?:menu|management\/menu|menu-images)(?:\/|$)/i.test(requestPath)) return "menu";
  if (/^\/(?:feedback|feedback-images|management\/feedback)(?:\/|$)/i.test(requestPath)) return "feedback";
  return "logs";
};

const normalizePath = (requestPath) =>
  requestPath
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");

const createManagerIssueCaptureMiddleware = (reportIssue) => (req, res, next) => {
  let responseMessage = "";
  const json = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object") {
      const message = body.message || body.error;
      if (typeof message === "string") responseMessage = message;
    }
    return json(body);
  };

  res.once("finish", () => {
    if (res.statusCode < 500 || req.path.startsWith("/management/system-issues")) return;

    const route = normalizePath(req.path);
    const status = res.statusCode;
    void reportIssue({
      fingerprint: `http:${req.method}:${route}:${status}`,
      source: `HTTP ${req.method} ${route}`,
      message: responseMessage || `The server returned HTTP ${status}.`,
      actionTab: getManagerActionTab(req.path),
    }).catch((error) => {
      console.error("Could not save manager alert for a failed request:", error);
    });
  });

  next();
};

module.exports = { createManagerIssueCaptureMiddleware, getManagerActionTab };
