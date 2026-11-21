const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const {
  validateManagerPassword,
  hashManagerPassword,
  verifyManagerCredentials,
} = require("./managerPassword");

test("manager passwords enforce the supported length range", () => {
  assert.match(validateManagerPassword("short"), /at least 8 characters/);
  assert.match(validateManagerPassword("a".repeat(73)), /72 UTF-8 bytes/);
  assert.equal(validateManagerPassword("secure-pass-123"), null);
});

test("manager passwords are persisted as bcrypt hashes", async () => {
  const password = "secure-pass-123";
  const hashed = await hashManagerPassword(password);

  assert.notEqual(hashed, password);
  assert.match(hashed, /^\$2[aby]\$/);
  assert.equal(await bcrypt.compare(password, hashed), true);
});

test("manager login requires both the configured ID and password", async () => {
  const password = "secure-pass-123";
  const profile = { id: "manager", password: await hashManagerPassword(password) };

  assert.deepEqual(await verifyManagerCredentials("manager", password, profile), {
    matches: true,
    needsHash: false,
  });
  assert.deepEqual(await verifyManagerCredentials("other-user", password, profile), {
    matches: false,
    needsHash: false,
  });
  assert.deepEqual(await verifyManagerCredentials("manager", `${password}${"x".repeat(60)}`, profile), {
    matches: false,
    needsHash: false,
  });
});

test("legacy plaintext credentials are marked for hashing after successful verification", async () => {
  const password = "legacy-password";

  assert.deepEqual(await verifyManagerCredentials("manager", password, {
    id: "manager",
    password,
  }), {
    matches: true,
    needsHash: true,
  });
});

test("legacy passwords longer than bcrypt's input limit migrate without truncation", async () => {
  const password = `legacy-${"x".repeat(90)}`;
  const profile = { id: "manager", password };
  const legacyCredentials = await verifyManagerCredentials("manager", password, profile);
  assert.deepEqual(legacyCredentials, { matches: true, needsHash: true });

  const migratedHash = await hashManagerPassword(password);
  assert.match(migratedHash, /^sha256\$\$2[aby]\$/);
  assert.equal((await verifyManagerCredentials("manager", password, {
    id: "manager",
    password: migratedHash,
  })).matches, true);
  assert.equal((await verifyManagerCredentials("manager", `${password}wrong`, {
    id: "manager",
    password: migratedHash,
  })).matches, false);
});
