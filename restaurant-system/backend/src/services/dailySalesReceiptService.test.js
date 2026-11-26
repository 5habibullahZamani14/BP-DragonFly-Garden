const assert = require("node:assert/strict");
const test = require("node:test");

const dbCalls = { gets: [], alls: [], runs: [] };
const databaseModule = require.resolve("../database/db");
require.cache[databaseModule] = {
  id: databaseModule,
  filename: databaseModule,
  loaded: true,
  exports: {
    get(sql, params, callback) {
      dbCalls.gets.push({ sql, params });
      if (sql.includes("SELECT status FROM daily_sales_receipt_logs")) {
        callback(null, { status: "printed" });
      } else {
        callback(null, null);
      }
    },
    all(sql, params, callback) {
      dbCalls.alls.push({ sql, params });
      callback(null, []);
    },
    run(sql, params, callback) {
      dbCalls.runs.push({ sql, params });
      callback.call({ changes: 1, lastID: 1 }, null);
    },
  },
};

const printerCalls = [];
const printerServiceModule = require.resolve("./printerService");
require.cache[printerServiceModule] = {
  id: printerServiceModule,
  filename: printerServiceModule,
  loaded: true,
  exports: {
    getReceiptCopyCounts: async () => ({ daily_sales_report: 1 }),
    printDailySalesReport: async (...args) => {
      printerCalls.push(args);
      return { success: true };
    },
  },
};

const dailySalesReceiptService = require("./dailySalesReceiptService");

test("does not print an already printed report unless reprinting is explicitly requested", async () => {
  const result = await dailySalesReceiptService.printDailySalesReportForDate("2026-11-26");

  assert.equal(result.success, false);
  assert.equal(result.alreadyPrinted, true);
  assert.equal(printerCalls.length, 0);
});

test("allows a manager-requested reprint of an already printed report", async () => {
  const result = await dailySalesReceiptService.printDailySalesReportForDate(
    "2026-11-26",
    { allowReprint: true },
  );

  assert.equal(result.success, true);
  assert.equal(result.salesDate, "2026-11-26");
  assert.equal(printerCalls.length, 1);
  assert.equal(dbCalls.runs.length, 1);
  assert.match(dbCalls.runs[0].sql, /INSERT INTO daily_sales_receipt_logs/);
});
