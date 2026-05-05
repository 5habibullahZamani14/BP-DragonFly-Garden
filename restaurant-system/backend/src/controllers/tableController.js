const QRCode = require("qrcode");
const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:4173";
const qrSvgCache = new Map();

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

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
  const tables = await all(
    `
      SELECT id, table_number, qr_code
      FROM tables
      ORDER BY id ASC
    `
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

const createTable = async (req, res) => {
  const { table_number, qr_code } = req.body;
  if (!table_number || !qr_code) {
    throw createHttpError(400, "Table number and QR code are required");
  }

  const existing = await get("SELECT id FROM tables WHERE qr_code = ?", [qr_code]);
  if (existing) {
    throw createHttpError(400, "A table with this QR code already exists");
  }

  const result = await run(
    `INSERT INTO tables (table_number, qr_code) VALUES (?, ?)`,
    [table_number, qr_code]
  );

  const table = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [result.lastID]);
  
  // Also log it
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name)
     VALUES (?, ?, ?, ?, ?)`,
    ['SYSTEM', 'CREATE_TABLE', 'Manager', result.lastID.toString(), table_number]
  );

  return res.status(201).json(await withQrCode(req, table));
};

const updateTable = async (req, res) => {
  const { id } = req.params;
  const { table_number, qr_code } = req.body;
  
  if (!table_number || !qr_code) {
    throw createHttpError(400, "Table number and QR code are required");
  }

  const existing = await get("SELECT id FROM tables WHERE qr_code = ? AND id != ?", [qr_code, id]);
  if (existing) {
    throw createHttpError(400, "A table with this QR code already exists");
  }

  await run(
    `UPDATE tables SET table_number = ?, qr_code = ? WHERE id = ?`,
    [table_number, qr_code, id]
  );

  const table = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [id]);
  
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name)
     VALUES (?, ?, ?, ?, ?)`,
    ['SYSTEM', 'UPDATE_TABLE', 'Manager', id.toString(), table_number]
  );

  return res.json(await withQrCode(req, table));
};

const deleteTable = async (req, res) => {
  const { id } = req.params;
  
  const table = await get("SELECT table_number FROM tables WHERE id = ?", [id]);
  if (!table) throw createHttpError(404, "Table not found");

  await run(`DELETE FROM tables WHERE id = ?`, [id]);
  
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name)
     VALUES (?, ?, ?, ?, ?)`,
    ['SYSTEM', 'DELETE_TABLE', 'Manager', id.toString(), table.table_number]
  );

  return res.json({ success: true, message: "Table deleted successfully" });
};

module.exports = {
  getTables,
  getTableByQrCode,
  createTable,
  updateTable,
  deleteTable
};
