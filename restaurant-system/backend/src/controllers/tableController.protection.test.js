const test = require("node:test");
const assert = require("node:assert/strict");
const { updateTable, deleteTable } = require("./tableController");

test("the system ordering table cannot be updated or deleted through table management routes", async () => {
  await assert.rejects(
    updateTable({ params: { id: "999" }, body: { table_number: "Table 99" } }, {}),
    (error) => error.statusCode === 409
  );
  await assert.rejects(
    deleteTable({ params: { id: "999" } }, {}),
    (error) => error.statusCode === 409
  );
});
