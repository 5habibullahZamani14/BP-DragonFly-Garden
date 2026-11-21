const test = require("node:test");
const assert = require("node:assert/strict");
const { validateJwtSecret } = require("./jwtSecret");

test("JWT startup validation rejects missing, placeholder, and weak secrets", () => {
  assert.match(validateJwtSecret(""), /required/);
  assert.match(validateJwtSecret("replace_with_secure_random_string"), /placeholder/);
  assert.match(validateJwtSecret("short-secret"), /at least 32/);
  assert.match(validateJwtSecret("x".repeat(40)), /repeated character/);
  assert.equal(validateJwtSecret("a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6"), null);
});
