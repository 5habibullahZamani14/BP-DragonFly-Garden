const assert = require("node:assert/strict");
const test = require("node:test");
const db = require("../database/db");
const { formatSampleTicket, printSampleTicket } = require("./printerService");

test.after(async () => {
  await db.close();
});

test("sample order and add-on tickets use the real checklist formatter", () => {
  const customerOrder = formatSampleTicket("order_customer");
  const kitchenOrder = formatSampleTicket("order_kitchen");
  const customerAddon = formatSampleTicket("addon_customer");
  const kitchenAddon = formatSampleTicket("addon_kitchen");

  assert.match(customerOrder, /\[CENTER\]CUSTOMER COPY/);
  assert.match(customerOrder, /\[CENTER\]BP DRAGONFLY GARDEN/);
  assert.match(customerOrder, /\[CENTER\]NEW ORDER/);
  assert.match(customerOrder, /ORDER DETAILS/);
  assert.match(customerOrder, /ORDER: #42/);
  assert.match(customerOrder, /ITEMS TO PREPARE/);
  assert.match(customerOrder, /Thank you! Your order is being prepared\./);
  assert.match(kitchenOrder, /\[CENTER\]KITCHEN COPY/);
  assert.match(kitchenOrder, /Please prepare the items listed above\./);
  assert.match(customerAddon, /\[CENTER\]ADD-ON ORDER/);
  assert.match(customerAddon, /ADDED ITEMS/);
  assert.match(customerAddon, /These items have been added to your order\./);
  assert.match(kitchenAddon, /\[CENTER\]KITCHEN COPY/);
  assert.match(kitchenAddon, /\[CENTER\]ADD-ON/);
  assert.match(kitchenAddon, /Please add these items to the existing\s+order\./);

  for (const ticket of [customerOrder, kitchenOrder, customerAddon, kitchenAddon]) {
    assert.match(ticket, /^-{44}$/m);
    assert.match(ticket, /Jacket Potato/);
    assert.match(ticket, /Lemon Tea/);
    assert.match(ticket, /Kampung Eggs/);
    assert.match(ticket, /No sour cream/);
    assert.match(ticket, /Extra cheese \(\+RM 2\.50\)/);
  }
});

test("sample final receipt and daily sales report include their actual sections", () => {
  const finalReceipt = formatSampleTicket("final_receipt");
  const dailyReport = formatSampleTicket("daily_sales_report");

  assert.match(finalReceipt, /\[CENTER\]FINAL RECEIPT/);
  assert.match(finalReceipt, /RECEIPT: 1042/);
  assert.match(finalReceipt, /CASHIER: Sample Cashier/);
  assert.match(finalReceipt, /SUBTOTAL: RM 29\.50/);
  assert.match(finalReceipt, /TOTAL DUE: RM 34\.40/);
  assert.match(finalReceipt, /THANK YOU FOR DINING WITH US/);
  assert.match(finalReceipt, /\[RIGHT\]RM 11\.50/);
  assert.match(finalReceipt, /Jacket Potato/);
  assert.match(dailyReport, /\[CENTER\]DAILY SALES REPORT/);
  assert.match(dailyReport, /ORDERS RECORDED: 3/);
  assert.match(dailyReport, /ORDER #40/);
  assert.match(dailyReport, /ORDER #42/);
  assert.match(dailyReport, /TOTAL SALES: RM 71\.00/);
  assert.match(dailyReport, /^={44}$/m);
});

test("sample receipt layouts stay within the 44-column paper width", () => {
  for (const type of [
    "order_customer",
    "order_kitchen",
    "addon_customer",
    "addon_kitchen",
    "final_receipt",
    "daily_sales_report"
  ]) {
    const lines = formatSampleTicket(type)
      .split("\n")
      .map(line => line.replace(/^\[(?:CENTER|RIGHT)\]/, ""));
    assert.ok(lines.every(line => line.length <= 44), `${type} contains a line wider than 44 columns`);
  }
});

test("rejects unknown sample ticket types before printing", async () => {
  assert.throws(
    () => formatSampleTicket("unknown"),
    { code: "INVALID_SAMPLE_TICKET_TYPE" }
  );
  await assert.rejects(
    () => printSampleTicket("unknown"),
    { code: "INVALID_SAMPLE_TICKET_TYPE" }
  );
});
