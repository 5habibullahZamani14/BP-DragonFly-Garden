const deriveEmployeeJwtRole = (department) => {
  const normalized = String(department || "").trim().toLowerCase();
  return /payment|cashier|counter/.test(normalized) ? "payment_counter" : null;
};

module.exports = { deriveEmployeeJwtRole };
