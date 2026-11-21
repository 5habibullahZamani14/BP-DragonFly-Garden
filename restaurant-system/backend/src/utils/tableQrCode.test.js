const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateTableQrCode,
  normalizeTableQrCode,
  hashTableQrCode,
} = require("./tableQrCode");

test("table QR credentials are random, high-entropy values, not table numbers", () => {
  const first = generateTableQrCode();
  const second = generateTableQrCode();

  assert.match(first, /^table-[a-f0-9]{64}$/);
  assert.match(second, /^table-[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(normalizeTableQrCode("table-1"), null);
});

test("table QR normalization is strict and hashes remain one-way", () => {
  const code = generateTableQrCode();
  assert.equal(normalizeTableQrCode(code.toUpperCase()), code);
  assert.equal(normalizeTableQrCode("table-secret"), null);
  assert.match(hashTableQrCode(code), /^[a-f0-9]{64}$/);
  assert.notEqual(hashTableQrCode(code), code);
});
