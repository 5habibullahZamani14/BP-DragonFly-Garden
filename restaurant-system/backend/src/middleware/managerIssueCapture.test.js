const test = require("node:test");
const assert = require("node:assert/strict");
const { createManagerIssueCaptureMiddleware, getManagerActionTab } = require("./managerIssueCapture");

test("routes system alerts to the matching manager area", () => {
  assert.equal(getManagerActionTab("/management/printers/test"), "settings");
  assert.equal(getManagerActionTab("/inventory/stock"), "inventory");
  assert.equal(getManagerActionTab("/tables/12"), "tables");
  assert.equal(getManagerActionTab("/orders/12"), "logs");
});

test("captures server failures but ignores client errors and alert API failures", async () => {
  const captured = [];
  const middleware = createManagerIssueCaptureMiddleware(async (issue) => captured.push(issue));
  const createResponse = (statusCode) => {
    const listeners = {};
    return {
      statusCode,
      json(body) {
        return body;
      },
      once(event, listener) {
        listeners[event] = listener;
      },
      finish() {
        listeners.finish();
      },
    };
  };

  const next = () => {};
  const clientErrorResponse = createResponse(400);
  middleware({ method: "POST", path: "/orders" }, clientErrorResponse, next);
  clientErrorResponse.finish();

  const failedResponse = createResponse(503);
  middleware({ method: "POST", path: "/management/printers/test" }, failedResponse, next);
  failedResponse.json({ message: "Printer is offline" });
  failedResponse.finish();

  const alertApiResponse = createResponse(500);
  middleware({ method: "GET", path: "/management/system-issues" }, alertApiResponse, next);
  alertApiResponse.finish();

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(captured.length, 1);
  assert.equal(captured[0].source, "HTTP POST /management/printers/test");
  assert.equal(captured[0].message, "Printer is offline");
  assert.equal(captured[0].actionTab, "settings");
});
