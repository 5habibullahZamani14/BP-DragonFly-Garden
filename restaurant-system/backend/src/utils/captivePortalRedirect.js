const URL = require("url").URL;

const buildRedirectTargetUrl = (baseTargetUrl, req) => {
  if (!baseTargetUrl) return baseTargetUrl;

  const target = new URL(baseTargetUrl);
  const params = new URLSearchParams(target.search);

  const incomingQuery = req && typeof req === "object" ? req.query || {} : {};
  const table = incomingQuery.table;
  const qr = incomingQuery.qr || incomingQuery.qr_code;

  Object.entries(incomingQuery).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === "table" || key === "qr" || key === "qr_code") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, `${item}`));
      return;
    }
    params.set(key, `${value}`);
  });

  if (table !== undefined && table !== null && `${table}`.trim() !== "") {
    params.set("table", `${table}`);
  }

  if (qr !== undefined && qr !== null && `${qr}`.trim() !== "") {
    params.set("qr", `${qr}`);
  }

  target.search = params.toString();
  return target.toString();
};

module.exports = { buildRedirectTargetUrl };
