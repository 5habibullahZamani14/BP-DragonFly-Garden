const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();
const {
  ensureSystemTables,
  isProtectedSystemTable,
  isReservedSystemTableName,
  isR4MSystemTable,
} = require("./systemTables");

test("the system table and reserved order-route names are protected", () => {
  assert.equal(isProtectedSystemTable({ id: 999, table_number: "Takeaway" }), true);
  assert.equal(isProtectedSystemTable({ id: 12, table_number: "Takeaway" }), true);
  assert.equal(isProtectedSystemTable({ id: 13, table_number: "R4M" }), true);
  assert.equal(isR4MSystemTable({ table_number: " r4m " }), true);
  assert.equal(isProtectedSystemTable({ id: 12, table_number: "Table 12" }), false);
  assert.equal(isReservedSystemTableName("To Go"), true);
  assert.equal(isReservedSystemTableName("r4m"), true);
  assert.equal(isReservedSystemTableName("Table 12"), false);
});

test("system initialization creates one protected R4M table with a secure QR credential", async () => {
  const database = new sqlite3.Database(":memory:");
  const run = (sql, params = []) => new Promise((resolve, reject) => {
    database.run(sql, params, (error) => error ? reject(error) : resolve());
  });
  const all = (sql, params = []) => new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });

  try {
    await run("CREATE TABLE tables (id INTEGER PRIMARY KEY AUTOINCREMENT, table_number TEXT UNIQUE, qr_code TEXT UNIQUE)");
    await ensureSystemTables(run);
    await ensureSystemTables(run);

    const r4mRows = await all("SELECT id, table_number, qr_code FROM tables WHERE UPPER(table_number) = 'R4M'");
    assert.equal(r4mRows.length, 1);
    assert.equal(r4mRows[0].table_number, "R4M");
    assert.match(r4mRows[0].qr_code, /^table-[a-f0-9]{64}$/);
    assert.equal((await all("SELECT id FROM tables WHERE id = 999")).length, 1);
  } finally {
    await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  }
});
