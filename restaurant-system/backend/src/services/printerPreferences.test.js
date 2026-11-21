const assert = require("node:assert/strict");
const test = require("node:test");
const sqlite3 = require("sqlite3");
const {
  getStoredPrinterPreferences,
  mergePrinterPreferences,
  updateStoredPrinterPreferences
} = require("./printerPreferences");

const createDatabase = () => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(":memory:", error => {
    if (error) {
      reject(error);
      return;
    }
    db.run(
      "CREATE TABLE restaurant_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      createError => createError ? reject(createError) : resolve(db)
    );
  });
});

test("saving receipt copy counts preserves legacy profiles and other printer preferences", () => {
  const existing = {
    printer_profiles: { queue: { width: 58 } },
    receipt_copies: { global: { order_customer: 1, order_kitchen: 2 } },
    test_ticket: "Saved test ticket"
  };

  const copiesUpdated = mergePrinterPreferences(existing, {
    printerPreferences: { receipt_copies: { global: { order_customer: 3 } } }
  });
  assert.deepEqual(copiesUpdated.printer_profiles, existing.printer_profiles);
  assert.equal(copiesUpdated.test_ticket, existing.test_ticket);
  assert.deepEqual(copiesUpdated.receipt_copies, {
    global: { order_customer: 3, order_kitchen: 2 }
  });

});

test("concurrent saves persist receipt counts without overwriting other printer preferences", async () => {
  const db = await createDatabase();
  try {
    await updateStoredPrinterPreferences(db, {
      printerPreferences: {
        receipt_copies: { global: { order_customer: 2, order_kitchen: 3 } }
      }
    });

    await Promise.all([
      updateStoredPrinterPreferences(db, {
        printerPreferences: {
          receipt_copies: { global: { order_customer: 4, order_kitchen: 2 } }
        }
      }),
      updateStoredPrinterPreferences(db, { testTicket: "Saved ticket" })
    ]);

    const saved = await getStoredPrinterPreferences(db);
    assert.deepEqual(saved.receipt_copies.global, {
      order_customer: 4,
      order_kitchen: 2,
      addon_customer: 1,
      addon_kitchen: 1,
      final_receipt: 1,
      daily_sales_report: 1
    });
    assert.equal(saved.test_ticket, "Saved ticket");
  } finally {
    await new Promise(resolve => db.close(resolve));
  }
});
