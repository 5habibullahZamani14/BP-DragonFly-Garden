const SYSTEM_ORDER_TABLE_ID = 999;
const R4M_SYSTEM_TABLE_NAME = "R4M";
const RESERVED_SYSTEM_TABLE_NAME = /(takeaway|counter|to[- ]?go)/i;
const { generateTableQrCode } = require("./tableQrCode");

const isProtectedSystemTable = (table) =>
  Number(table?.id) === SYSTEM_ORDER_TABLE_ID ||
  RESERVED_SYSTEM_TABLE_NAME.test(String(table?.table_number || "")) ||
  String(table?.table_number || "").trim().toUpperCase() === R4M_SYSTEM_TABLE_NAME;

const isReservedSystemTableName = (tableNumber) =>
  RESERVED_SYSTEM_TABLE_NAME.test(String(tableNumber || "")) ||
  String(tableNumber || "").trim().toUpperCase() === R4M_SYSTEM_TABLE_NAME;

const isR4MSystemTable = (table) =>
  String(table?.table_number || "").trim().toUpperCase() === R4M_SYSTEM_TABLE_NAME;

const ensureSystemTables = async (run) => {
  await run(
    "INSERT OR IGNORE INTO tables (id, table_number, qr_code) VALUES (?, 'Counter Order', 'counter-orders')",
    [SYSTEM_ORDER_TABLE_ID]
  );
  await run(
    `INSERT OR IGNORE INTO tables (table_number, qr_code)
     SELECT ?, ? WHERE NOT EXISTS (
       SELECT 1 FROM tables WHERE UPPER(TRIM(table_number)) = ?
     )`,
    [R4M_SYSTEM_TABLE_NAME, generateTableQrCode(), R4M_SYSTEM_TABLE_NAME]
  );
};

module.exports = {
  SYSTEM_ORDER_TABLE_ID,
  R4M_SYSTEM_TABLE_NAME,
  isProtectedSystemTable,
  isReservedSystemTableName,
  isR4MSystemTable,
  ensureSystemTables,
};
