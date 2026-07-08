const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRedirectTargetUrl } = require("./captivePortalRedirect");

test("preserves table and qr parameters when redirecting to the ordering page", () => {
  const req = { query: { table: "7", qr: "table-7" } };
  const target = buildRedirectTargetUrl("http://10.42.0.1:5000/", req);
  assert.equal(target, "http://10.42.0.1:5000/?table=7&qr=table-7");
});

test("preserves additional query parameters and encodes values", () => {
  const req = { query: { table: "3", qr: "table 3", source: "scan" } };
  const target = buildRedirectTargetUrl("http://10.42.0.1:5000/portal", req);
  assert.equal(target, "http://10.42.0.1:5000/portal?source=scan&table=3&qr=table+3");
});
