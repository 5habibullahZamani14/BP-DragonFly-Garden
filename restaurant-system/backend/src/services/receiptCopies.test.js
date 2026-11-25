const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeReceiptCopyCounts, printCopies } = require("./receiptCopies");

test("normalizes persisted copy counts and defaults only missing receipt types", () => {
  const counts = normalizeReceiptCopyCounts({
    receipt_copies: {
      global: {
        order_customer: 2,
        addon_kitchen: "3"
      }
    }
  });

  assert.deepEqual(counts, {
    order_customer: 2,
    order_kitchen: 1,
    addon_customer: 1,
    addon_kitchen: 3,
    final_receipt: 1,
    daily_sales_report: 1
  });
});

test("preserves zero as an explicit no-print setting", async () => {
  const counts = normalizeReceiptCopyCounts({
    receipt_copies: { global: { addon_customer: 0 } }
  });

  assert.equal(counts.addon_customer, 0);
  assert.deepEqual(await printCopies(0, async () => {
    throw new Error("A zero-copy setting must not submit a print job.");
  }), []);
});

test("rejects invalid persisted copy counts instead of silently printing one copy", () => {
  assert.throws(
    () => normalizeReceiptCopyCounts({ receipt_copies: { global: { order_customer: -1 } } }),
    /between 0 and 5/
  );
  assert.throws(
    () => normalizeReceiptCopyCounts({ receipt_copies: { global: { order_customer: 1.5 } } }),
    /between 0 and 5/
  );
});

test("submits exactly the configured number of copies in sequence", async () => {
  const submitted = [];
  await printCopies(3, async (copyNumber) => {
    submitted.push(copyNumber);
    return `job-${copyNumber}`;
  });

  assert.deepEqual(submitted, [1, 2, 3]);
});

test("does not submit any copy when the requested count is invalid", async () => {
  let submitted = 0;
  await assert.rejects(printCopies(6, async () => {
    submitted += 1;
  }), /between 0 and 5/);
  assert.equal(submitted, 0);
});
