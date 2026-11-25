const DEFAULT_RECEIPT_COPY_COUNTS = Object.freeze({
  order_customer: 1,
  order_kitchen: 1,
  addon_customer: 1,
  addon_kitchen: 1,
  final_receipt: 1,
  daily_sales_report: 1
});

const MAX_RECEIPT_COPIES = 5;
const MIN_RECEIPT_COPIES = 0;

const normalizeReceiptCopyCounts = (preferences) => {
  const receiptCopies = preferences?.receipt_copies;
  if (receiptCopies !== undefined && (!receiptCopies || typeof receiptCopies !== "object" || Array.isArray(receiptCopies))) {
    throw new Error("Stored receipt copy settings have an invalid format.");
  }
  const savedCounts = receiptCopies?.global;
  if (savedCounts !== undefined && (!savedCounts || typeof savedCounts !== "object" || Array.isArray(savedCounts))) {
    throw new Error("Stored global receipt copy counts have an invalid format.");
  }

  const normalized = {};

  for (const [type, fallback] of Object.entries(DEFAULT_RECEIPT_COPY_COUNTS)) {
    const rawCount = savedCounts?.[type] ?? fallback;
    const count = typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string" && rawCount.trim()
        ? Number(rawCount)
        : NaN;
    if (!Number.isInteger(count) || count < MIN_RECEIPT_COPIES || count > MAX_RECEIPT_COPIES) {
      throw new Error(`${type} copy count must be a whole number between ${MIN_RECEIPT_COPIES} and ${MAX_RECEIPT_COPIES}.`);
    }
    normalized[type] = count;
  }

  return normalized;
};

const printCopies = async (count, printCopy) => {
  if (!Number.isInteger(count) || count < MIN_RECEIPT_COPIES || count > MAX_RECEIPT_COPIES) {
    throw new Error(`Receipt copy count must be a whole number between ${MIN_RECEIPT_COPIES} and ${MAX_RECEIPT_COPIES}.`);
  }
  if (typeof printCopy !== "function") {
    throw new Error("A print function is required.");
  }

  const results = [];
  for (let index = 0; index < count; index += 1) {
    results.push(await printCopy(index + 1));
  }
  return results;
};

module.exports = {
  DEFAULT_RECEIPT_COPY_COUNTS,
  MIN_RECEIPT_COPIES,
  MAX_RECEIPT_COPIES,
  normalizeReceiptCopyCounts,
  printCopies
};
