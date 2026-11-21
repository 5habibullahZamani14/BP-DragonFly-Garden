const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getPrintableCharacterColumns,
  paperWidthToCharacterColumns,
  wrapReceiptText,
} = require("./printerFormatting");

test("maps configured paper widths in millimeters to receipt character columns", () => {
  assert.equal(paperWidthToCharacterColumns(80), 48);
  assert.equal(paperWidthToCharacterColumns(58), 32);
  assert.equal(paperWidthToCharacterColumns(50), 32);
  assert.equal(paperWidthToCharacterColumns(45), 24);
});

test("subtracts character margins only after converting the paper width", () => {
  assert.equal(getPrintableCharacterColumns(80, 2, 3), 43);
  assert.equal(getPrintableCharacterColumns(58, 2, 2), 28);
});

test("rejects invalid widths and margins rather than silently misformatting tickets", () => {
  assert.throws(() => paperWidthToCharacterColumns(0), /between 30 and 120 mm/);
  assert.throws(() => paperWidthToCharacterColumns(80.5), /whole number/);
  assert.throws(() => getPrintableCharacterColumns(45, 20, 20), /leave no printable characters/);
});

test("wraps long words without dropping receipt text", () => {
  const wrapped = wrapReceiptText("Meal Supercalifragilistic 2", 8);
  assert.deepEqual(wrapped, ["Meal", "Supercal", "ifragili", "stic 2"]);
  assert.equal(wrapped.join("").replace(/\s/g, ""), "MealSupercalifragilistic2");
});
