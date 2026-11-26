const assert = require("node:assert/strict");
const test = require("node:test");
const { deriveEmployeeJwtRole } = require("./employeeRole");

test("payment-counter authentication is limited to payment, cashier, and counter departments", () => {
  assert.equal(deriveEmployeeJwtRole("Cashier"), "payment_counter");
  assert.equal(deriveEmployeeJwtRole("Payment Counter"), "payment_counter");
  assert.equal(deriveEmployeeJwtRole("Waiter"), null);
  assert.equal(deriveEmployeeJwtRole("Manager"), null);
});
