const QRCode = require("qrcode");
const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:4173";
const CANONICAL_QR_CODES = ["table-1", "table-2", "table-3", "table-4", "table-5"];
const qrSvgCache = new Map();

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const getBaseUrl = (req) => {
  if (process.env.FRONTEND_BASE_URL) {
    return process.env.FRONTEND_BASE_URL.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
};

const buildOrderingUrl = (req, table) =>
  `${getBaseUrl(req)}/?table=${table.id}&qr=${encodeURIComponent(table.qr_code)}`;

const withQrCode = async (req, table) => {
  const orderingUrl = buildOrderingUrl(req, table);
  let qrSvg = qrSvgCache.get(orderingUrl);

  if (!qrSvg) {
    qrSvg = await QRCode.toString(orderingUrl, {
      type: "svg",
      margin: 1,
      width: 220
    });
    qrSvgCache.set(orderingUrl, qrSvg);
  }

  return {
    ...table,
    ordering_url: orderingUrl,
    qr_svg: qrSvg
  };
};

const getTables = async (req, res) => {
  const placeholders = CANONICAL_QR_CODES.map(() => "?").join(", ");
  const tables = await all(
    `
      SELECT id, table_number, qr_code
      FROM tables
      WHERE qr_code IN (${placeholders})
      ORDER BY id ASC
    `,
    CANONICAL_QR_CODES
  );

  const payload = await Promise.all(tables.map((table) => withQrCode(req, table)));
  return res.json(payload);
};

const getTableByQrCode = async (req, res) => {
  const table = await get(
    `
      SELECT id, table_number, qr_code
      FROM tables
      WHERE qr_code = ?
    `,
    [req.params.qrCode]
  );

  if (!table) {
    throw createHttpError(404, "Table not found");
  }

  return res.json(await withQrCode(req, table));
};

module.exports = {
  getTables,
  getTableByQrCode
};
