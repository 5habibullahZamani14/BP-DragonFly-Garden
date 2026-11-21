const { createHash, randomBytes } = require("node:crypto");

const TABLE_QR_PATTERN = /^table-[a-f0-9]{64}$/i;

const generateTableQrCode = () => `table-${randomBytes(32).toString("hex")}`;

const normalizeTableQrCode = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return TABLE_QR_PATTERN.test(normalized) ? normalized : null;
};

const hashTableQrCode = (value) =>
  createHash("sha256").update(value).digest("hex");

module.exports = {
  TABLE_QR_PATTERN,
  generateTableQrCode,
  normalizeTableQrCode,
  hashTableQrCode,
};
