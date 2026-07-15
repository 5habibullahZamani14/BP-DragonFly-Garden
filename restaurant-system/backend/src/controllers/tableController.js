/*
 * tableController.js — Business logic for restaurant table management.
 *
 * Manages physical tables: listing with QR codes, lookup by QR string,
 * and full CRUD from the management dashboard. The QR SVG cache prevents
 * repeated expensive image generation for the same URL. Every write
 * operation is logged to grand_archive_logs.
 */

const QRCode = require("qrcode");
const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");
const { pickPreferredLocalIp } = require("../utils/networkAddress");

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:4173";
const DEFAULT_CAPTIVE_PORTAL_TARGET = "http://10.42.0.1:5000/";

const normalizeUrl = (value) => {
  if (!value || typeof value !== "string") return DEFAULT_CAPTIVE_PORTAL_TARGET;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CAPTIVE_PORTAL_TARGET;
  return trimmed.replace(/\/+$|\s+$/g, "").replace(/\/$/, "") + "/";
};

const normalizeBaseUrl = (value) => normalizeUrl(value).replace(/\/$/, "");

const isLocalHostHeader = (host) =>
  typeof host === "string" && /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);

const getLocalNetworkAddress = () => pickPreferredLocalIp();

const getServerBaseUrlFromRequest = (req) => {
  const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
  const hostHeader = req.get("host");
  if (hostHeader && !isLocalHostHeader(hostHeader)) {
    return `${proto}://${hostHeader}`;
  }

  const localIp = getLocalNetworkAddress();
  const port = req.socket?.localPort || Number(process.env.PORT) || 5000;
  if (localIp) {
    return `http://${localIp}:${port}`;
  }

  return null;
};

const getRestaurantSetting = (key) =>
  new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });

/*
 * resolveOrderingBaseUrl returns a stable base URL used for printed table
 * QR codes. It prefers the Raspberry Pi captive portal target set via the
 * backend environment or runtime settings. Falling back to the incoming
 * request host is only used for development or when no captive portal target
 * is configured.
 */
const resolveOrderingBaseUrl = async (req) => {
  const localIp = getLocalNetworkAddress();
  const port = Number(process.env.PORT) || 5000;

  if (localIp) {
    if (localIp === "10.42.0.1") {
      // Running on the Pi
      if (process.env.CAPTIVE_PORTAL_TARGET) {
        return normalizeBaseUrl(process.env.CAPTIVE_PORTAL_TARGET);
      }
      try {
        const rawValue = await getRestaurantSetting("captive_portal_target");
        if (rawValue) {
          return normalizeBaseUrl(rawValue);
        }
      } catch (err) {
        console.warn("Could not load captive portal target from settings:", err && err.message ? err.message : err);
      }
      return `http://10.42.0.1:${port}`;
    } else {
      // Running on PC/laptop or other local networks
      return `http://${localIp}:${port}`;
    }
  }

  // Fallback if no network IP is detected
  if (process.env.CAPTIVE_PORTAL_TARGET) {
    return normalizeBaseUrl(process.env.CAPTIVE_PORTAL_TARGET);
  }
  try {
    const rawValue = await getRestaurantSetting("captive_portal_target");
    if (rawValue) {
      return normalizeBaseUrl(rawValue);
    }
  } catch (err) {}

  return `http://127.0.0.1:${port}`;
};

/*
 * In-memory SVG cache keyed by ordering URL. Generating SVG QR images is
 * CPU-intensive; caching means each unique URL is only rendered once per
 * server process lifetime.
 */
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
      if (err) { reject(err); return; }
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) { reject(err); return; }
      resolve(row);
    });
  });

// Broadcast function for WebSocket events
let broadcastFn = null;
const setBroadcast = (fn) => { broadcastFn = fn; };
const getBroadcast = () => broadcastFn;

/*
 * buildOrderingUrl embeds both the numeric table ID and the QR code string in
 * the URL so the frontend has both values without a second lookup after loading.
 * In Raspberry Pi hotspot deployments, the captive portal target is used as a
 * stable host for printed table QR codes and captive portal redirects.
 */
const buildOrderingUrl = async (req, table) => {
  const baseUrl = await resolveOrderingBaseUrl(req);
  return `${baseUrl}/?table=${table.id}&qr=${encodeURIComponent(table.qr_code)}`;
};

/* withQrCode appends the ordering URL and cached SVG to any table object. */
const withQrCode = async (req, table) => {
  const orderingUrl = await buildOrderingUrl(req, table);
  let qrSvg = qrSvgCache.get(orderingUrl);

  if (!qrSvg) {
    qrSvg = await QRCode.toString(orderingUrl, { type: "svg", margin: 1, width: 220 });
    qrSvgCache.set(orderingUrl, qrSvg);
  }

  return { ...table, ordering_url: orderingUrl, qr_svg: qrSvg };
};

const getTables = async (req, res) => {
  const tables = await all(`SELECT id, table_number, qr_code FROM tables ORDER BY id ASC`);
  const payload = await Promise.all(tables.map((t) => withQrCode(req, t)));
  return res.json(payload);
};

/*
 * getTableByQrCode is called by the frontend on startup when it detects
 * a table QR code in the URL, resolving the QR string to a DB table ID.
 */
const getTableByQrCode = async (req, res) => {
  const table = await get(
    `SELECT id, table_number, qr_code FROM tables WHERE qr_code = ?`,
    [req.params.qrCode]
  );
  if (!table) throw createHttpError(404, "Table not found");
  return res.json(await withQrCode(req, table));
};

const createTable = async (req, res) => {
  const { table_number, qr_code } = req.body;
  if (!table_number || !qr_code) throw createHttpError(400, "Table number and QR code are required");

  const existing = await get("SELECT id FROM tables WHERE qr_code = ?", [qr_code]);
  if (existing) throw createHttpError(400, "A table with this QR code already exists");

  const result = await run(`INSERT INTO tables (table_number, qr_code) VALUES (?, ?)`, [table_number, qr_code]);
  const table = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [result.lastID]);

  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name) VALUES (?, ?, ?, ?, ?)`,
    ["SYSTEM", "CREATE_TABLE", "Manager", result.lastID.toString(), table_number]
  );

  // Emit WebSocket event for table update
  const broadcast = getBroadcast();
  if (broadcast) {
    broadcast({ type: "TABLE_UPDATE", payload: { id: result.lastID } });
  }

  return res.status(201).json(await withQrCode(req, table));
};

const updateTable = async (req, res) => {
  const { id } = req.params;
  const { table_number, qr_code } = req.body;
  if (!table_number || !qr_code) throw createHttpError(400, "Table number and QR code are required");

  const existing = await get("SELECT id FROM tables WHERE qr_code = ? AND id != ?", [qr_code, id]);
  if (existing) throw createHttpError(400, "A table with this QR code already exists");

  await run(`UPDATE tables SET table_number = ?, qr_code = ? WHERE id = ?`, [table_number, qr_code, id]);
  const table = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [id]);

  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name) VALUES (?, ?, ?, ?, ?)`,
    ["SYSTEM", "UPDATE_TABLE", "Manager", id.toString(), table_number]
  );

  // Emit WebSocket event for table update
  const broadcast = getBroadcast();
  if (broadcast) {
    broadcast({ type: "TABLE_UPDATE", payload: { id } });
  }

  return res.json(await withQrCode(req, table));
};

const deleteTable = async (req, res) => {
  const { id } = req.params;
  const table = await get("SELECT table_number FROM tables WHERE id = ?", [id]);
  if (!table) throw createHttpError(404, "Table not found");

  await run(`DELETE FROM tables WHERE id = ?`, [id]);
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name) VALUES (?, ?, ?, ?, ?)`,
    ["SYSTEM", "DELETE_TABLE", "Manager", id.toString(), table.table_number]
  );

  // Emit WebSocket event for table update
  const broadcast = getBroadcast();
  if (broadcast) {
    broadcast({ type: "TABLE_UPDATE", payload: { id } });
  }

  return res.json({ success: true, message: "Table deleted successfully" });
};

module.exports = { getTables, getTableByQrCode, createTable, updateTable, deleteTable, setBroadcast };
