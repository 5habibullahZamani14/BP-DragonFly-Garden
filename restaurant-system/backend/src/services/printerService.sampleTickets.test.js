const assert = require("node:assert/strict");
const test = require("node:test");
const db = require("../database/db");
const { formatChecklistTicket, formatFinalReceipt, formatSampleTicket, printSampleTicket } = require("./printerService");
const {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
  RECEIPT_RIGHT_MARGIN_HUNDREDTHS_INCH
} = require("./receiptLayout");

test.after(async () => {
  await db.close();
});

test("receipt layout keeps the right margin independently configurable", () => {
  const { marginsMm } = RECEIPT_LAYOUT;
  assert.equal(RECEIPT_LAYOUT.columns, 40);
  assert.equal(RECEIPT_LAYOUT.fontFamily, "Oranienbaum");
  assert.equal(RECEIPT_LAYOUT.brandFontFamily, "Cinzel");
  assert.equal(RECEIPT_LAYOUT.numericFontFamily, "Bodoni Moda");
  assert.equal(RECEIPT_LAYOUT.fontWeight, 400);
  assert.equal(RECEIPT_LAYOUT.boldFontWeight, 700);
  assert.equal(RECEIPT_LAYOUT.brandFontWeight, 700);
  assert.equal(RECEIPT_LAYOUT.numericFontWeight, 400);
  assert.equal(RECEIPT_LAYOUT.numericBoldFontWeight, 700);
  assert.equal(RECEIPT_LAYOUT.baseFontSizePt, 10);
  assert.equal(RECEIPT_LAYOUT.brandFontSizePt, 20);
  assert.equal(RECEIPT_LAYOUT.totalFontSizePt, 13);
  assert.equal(RECEIPT_LAYOUT.logoSizeMm, 30);
  assert.equal(RECEIPT_LAYOUT.qrCodeSizeMm, 40);
  assert.equal(marginsMm.left, marginsMm.top);
  assert.equal(marginsMm.left, marginsMm.bottom);
  assert.equal(RECEIPT_MARGIN_HUNDREDTHS_INCH, 7);
  assert.equal(RECEIPT_RIGHT_MARGIN_HUNDREDTHS_INCH, 16);
  assert.ok(Math.abs(marginsMm.left - 1.75) < 0.05);
  assert.ok(Math.abs(marginsMm.right - 4.0) < 0.07);
});

test("sample order and add-on tickets use the real checklist formatter", () => {
  const customerOrder = formatSampleTicket("order_customer");
  const kitchenOrder = formatSampleTicket("order_kitchen");
  const customerAddon = formatSampleTicket("addon_customer");
  const kitchenAddon = formatSampleTicket("addon_kitchen");

  assert.match(customerOrder, /\[CENTER\]CUSTOMER COPY/);
  assert.doesNotMatch(customerOrder, /\[LOGO\]|\[QRCODE\]/);
  assert.doesNotMatch(customerOrder, /\[BRAND\]|BP DRAGONFLY GARDEN|Solok Pondok Upih|11020 Balik Pulau/);
  assert.match(customerOrder, /\[CENTER\]NEW ORDER/);
  assert.match(customerOrder, /ORDER: #42/);
  assert.match(customerOrder, /Thank you! Your order is being prepared\./);
  assert.doesNotMatch(customerOrder, /ORDER DETAILS|ITEMS TO PREPARE/);
  assert.match(customerOrder, /TIME: \d{2}\/\d{2}\/\d{4} (?:0[1-9]|1[0-2]):\d{2} (?:AM|PM)/);
  assert.match(kitchenOrder, /\[CENTER\]KITCHEN COPY/);
  assert.doesNotMatch(kitchenOrder, /Please prepare the items listed above\./);
  assert.match(customerAddon, /\[CENTER\]ADD-ON ORDER/);
  assert.doesNotMatch(customerAddon, /ADDED ITEMS/);
  assert.match(customerAddon, /These items have been added to your order\./);
  assert.match(kitchenAddon, /\[CENTER\]KITCHEN COPY/);
  assert.match(kitchenAddon, /\[CENTER\]ADD-ON/);
  assert.doesNotMatch(kitchenAddon, /Please add these items to the existing/);

  for (const ticket of [customerOrder, kitchenOrder, customerAddon, kitchenAddon]) {
    assert.doesNotMatch(ticket, /\[LOGO\]|\[QRCODE\]/);
    assert.doesNotMatch(ticket, /\[BRAND\]|BP DRAGONFLY GARDEN|Solok Pondok Upih|11020 Balik Pulau/);
    assert.equal((ticket.match(/^\[CHECKITEM\]/gm) || []).length, 3);
    assert.match(ticket, /^\[ITEMDETAIL\]Note: No sour cream$/m);
    assert.match(ticket, /^\[THIN_RULE\]$/m);
    assert.ok(!ticket.endsWith("\n"));
    assert.ok(!ticket.includes("\n\n"));
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

  assert.doesNotMatch(finalReceipt, /FINAL RECEIPT|ORDER DETAILS/);
  assert.match(finalReceipt, /\[LOGO\]\n\[BRAND\]BP DRAGONFLY GARDEN/);
  assert.match(finalReceipt, /Solok Pondok Upih, Taman Kristal/);
  assert.match(finalReceipt, /11020 Balik Pulau, Pulau Pinang/);
  assert.doesNotMatch(finalReceipt, /\[CHECKITEM\]|\[ITEMDETAIL\]/);
  assert.match(finalReceipt, /CONTACT: 017-488 2220/);
  assert.match(finalReceipt, /RECEIPT: 1042/);
  assert.match(finalReceipt, /CASHIER: Sample Cashier/);
  assert.match(finalReceipt, /DATE: \d{2}\/\d{2}\/\d{4} (?:0[1-9]|1[0-2]):\d{2} (?:AM|PM)/);
  assert.match(finalReceipt, /\[ROW\]SUBTOTAL\tRM 29\.50/);
  assert.match(finalReceipt, /\[TOTAL\]\[ROW\]TOTAL DUE\tRM 34\.40/);
  assert.match(finalReceipt, /THANK YOU FOR DINING WITH US/);
  assert.match(finalReceipt, /\[QRCODE\]https:\/\/www\.facebook\.com\/BPDragonflyGarden\//);
  assert.match(finalReceipt, /facebook\.com\/BPDragonflyGarden/);
  assert.match(finalReceipt, /\[ROW\]1 x Kampung Eggs\tRM 11\.50/);
  assert.match(finalReceipt, /Jacket Potato/);
  assert.match(dailyReport, /\[BOLD\]\[CENTER\]DAILY SALES REPORT/);
  assert.match(dailyReport, /ORDERS RECORDED: 3/);
  assert.match(dailyReport, /ORDER #40/);
  assert.match(dailyReport, /ORDER #42/);
  assert.match(dailyReport, /\[TOTAL\]\[ROW\]TOTAL SALES\tRM 71\.00/);
  assert.doesNotMatch(dailyReport, /END-OF-DAY SUMMARY|SALES BY ORDER/);
  assert.match(dailyReport, /^\[THICK_RULE\]$/m);
  assert.doesNotMatch(dailyReport, /\[LOGO\]|\[QRCODE\]/);
  assert.doesNotMatch(dailyReport, /\[BRAND\]|BP DRAGONFLY GARDEN|Solok Pondok Upih|11020 Balik Pulau/);

  for (const ticket of [finalReceipt, dailyReport]) {
    assert.ok(!ticket.endsWith("\n"));
    assert.ok(!ticket.includes("\n\n"));
  }
});

test("final receipt total rounding uses exact five-sen increments", () => {
  const receiptAtTwoSen = formatFinalReceipt({
    id: 1,
    daily_ticket_number: 1,
    order_type: "DINE_IN",
    table_number: "1",
    total_price: 10.02,
    service_charge_rate: 0,
    vat_rate: 0,
    items: []
  }, "Cashier");
  assert.match(receiptAtTwoSen, /\[ROW\]ROUNDING\tRM -0\.02/);
  assert.match(receiptAtTwoSen, /\[TOTAL\]\[ROW\]TOTAL DUE\tRM 10\.00/);

  const receiptAtThreeSen = formatFinalReceipt({
    id: 2,
    daily_ticket_number: 2,
    order_type: "DINE_IN",
    table_number: "1",
    total_price: 10.03,
    service_charge_rate: 0,
    vat_rate: 0,
    items: []
  }, "Cashier");
  assert.match(receiptAtThreeSen, /\[ROW\]ROUNDING\tRM 0\.02/);
  assert.match(receiptAtThreeSen, /\[TOTAL\]\[ROW\]TOTAL DUE\tRM 10\.05/);
});

test("printed pickup times use 12-hour AM/PM format", () => {
  const ticket = formatChecklistTicket(
    { id: 8, daily_ticket_number: 8, order_type: "PICKUP", collection_time: "21:30" },
    [],
    false,
    "CUSTOMER COPY",
  );
  assert.match(ticket, /PICKUP TIME: 09:30 PM/);
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
      .map(line => {
        if (line.startsWith("[CHECKITEM]")) return `[ ] ${line.substring(11)}`;
        if (line.startsWith("[ITEMDETAIL]")) return `    ${line.substring(12)}`;
        if (line === "[LOGO]") return "";
        if (line.startsWith("[QRCODE]")) return "";
        if (line === "[THIN_RULE]") return "-".repeat(44);
        if (line === "[THICK_RULE]") return "=".repeat(44);
        const visible = line.replace(/\[(?:CENTER|RIGHT|LEFT|BOLD|H1|BRAND|TOTAL|ROW|SQUARE)\]/g, "");
        if (!visible.includes("\t")) return visible;
        const [label, amount = ""] = visible.split("\t", 2);
        return `${label}${" ".repeat(Math.max(1, 44 - label.length - amount.length))}${amount}`;
      });
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
