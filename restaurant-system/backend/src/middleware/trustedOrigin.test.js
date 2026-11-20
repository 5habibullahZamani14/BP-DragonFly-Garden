const assert = require("node:assert/strict");
const test = require("node:test");
const { isTrustedOrigin } = require("./trustedOrigin");

test("trusted origin accepts the same host and explicitly configured frontends", () => {
  assert.equal(isTrustedOrigin("http://localhost:5000", "localhost:5000"), true);
  assert.equal(isTrustedOrigin("https://localhost:5000", "localhost:5000", [], false, "http"), false);
  assert.equal(isTrustedOrigin("https://pos.example.com", "api.example.com", ["https://pos.example.com"]), true);
  assert.equal(isTrustedOrigin("https://attacker.example", "api.example.com", []), false);
});

test("development mode permits a Vite port on the same host only", () => {
  assert.equal(isTrustedOrigin("http://localhost:5173", "localhost:5000", [], true, "http"), true);
  assert.equal(isTrustedOrigin("http://attacker.local:5173", "localhost:5000", [], true, "http"), false);
  assert.equal(isTrustedOrigin("null", "localhost:5000", [], true, "http"), false);
});
