/*
 * tableController.js — Business logic for restaurant table management.
 *
 * Manages physical tables: listing with QR codes, lookup by QR string,
 * and full CRUD from the management dashboard. The QR SVG cache prevents
 * repeated expensive image generation for the same URL. Every write
 * operation is logged to grand_archive_logs.
 */

const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");
const { setAuthCookie, CUSTOMER_TABLE_SESSION_MAX_AGE_SECONDS } = require("../middleware/authCookies");
const { getValidatedRequestBaseUrl, pickPreferredLocalIp } = require("../utils/networkAddress");
const { generateTableQrCode, normalizeTableQrCode, hashTableQrCode } = require("../utils/tableQrCode");
const {
  SYSTEM_ORDER_TABLE_ID,
  isProtectedSystemTable,
  isReservedSystemTableName,
} = require("../utils/systemTables");
const { all, run, get: dbGet } = require("../utils/dbUtils");

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:4173";
const DEFAULT_CAPTIVE_PORTAL_TARGET = "http://10.42.0.1:5000/";

const normalizeUrl = (value) => {
  if (!value || typeof value !== "string") return DEFAULT_CAPTIVE_PORTAL_TARGET;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CAPTIVE_PORTAL_TARGET;
  return trimmed.replace(/\/+$/, "").replace(/\s+$/, "") + "/";
};
 
const normalizeBaseUrl = (value) => normalizeUrl(value).replace(/\/$/, "");

const getLocalNetworkAddress = () => pickPreferredLocalIp();

const getServerBaseUrlFromRequest = (req) => getValidatedRequestBaseUrl(req);

const getRestaurantSetting = (key) =>
  new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });

/*
 * resolveOrderingBaseUrl returns a stable base URL used for printed table
 * QR codes. It prefers an explicitly configured target, otherwise uses the
 * incoming LAN host or detected network address. Raspberry Pi deployments
 * retain the runtime hotspot setting.
 */
const resolveOrderingBaseUrl = async (req) => {
  const localIp = getLocalNetworkAddress();
  const port = Number(process.env.PORT) || 5000;

  if (process.env.CAPTIVE_PORTAL_TARGET) {
    return normalizeBaseUrl(process.env.CAPTIVE_PORTAL_TARGET);
  }

  if (localIp !== "10.42.0.1") {
    const requestBaseUrl = getServerBaseUrlFromRequest(req);
    if (requestBaseUrl) return normalizeBaseUrl(requestBaseUrl);
    if (localIp) return `http://${localIp}:${port}`;
  }

  if (localIp) {
    if (localIp === "10.42.0.1") {
      // Running on the Pi
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
 * LRU Cache for QR SVG images to prevent unbounded memory growth.
 * Uses a simple Map with access-order tracking.
 */
const MAX_QR_CACHE_SIZE = 200;
const qrSvgCache = new Map();

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) { reject(err); return; }
      resolve(row);
    });
  });

/**
 * Get QR SVG from cache, updating access order for LRU.
 * @param {string} key - Cache key
 * @returns {string|null} - Cached SVG or null
 */
const getQrFromCache = (key) => {
  if (!qrSvgCache.has(key)) return null;
  const value = qrSvgCache.get(key);
  // Update access order (delete and re-add to move to end)
  qrSvgCache.delete(key);
  qrSvgCache.set(key, value);
  return value;
};

/**
 * Set QR SVG in cache with LRU eviction.
 * @param {string} key - Cache key
 * @param {string} value - SVG value to cache
 */
const setQrCache = (key, value) => {
  // Evict oldest entry if cache is full
  if (qrSvgCache.size >= MAX_QR_CACHE_SIZE) {
    const firstKey = qrSvgCache.keys().next().value;
    qrSvgCache.delete(firstKey);
  }
  qrSvgCache.set(key, value);
};

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
  let qrSvg = getQrFromCache(orderingUrl);

  if (!qrSvg) {
    qrSvg = await QRCode.toString(orderingUrl, { type: "svg", margin: 1, width: 220 });
    setQrCache(orderingUrl, qrSvg);
  }

  return { ...table, ordering_url: orderingUrl, qr_svg: qrSvg };
};

const getTables = async (req, res) => {
  const tables = await all(`SELECT id, table_number, qr_code FROM tables ORDER BY id ASC`);
  const payload = await Promise.all(tables.map((t) => withQrCode(req, t)));
  return res.json(payload);
};

const createCustomerTableSession = async (req, res) => {
  const qrCode = normalizeTableQrCode(req.body?.qr_code);
  if (!qrCode) throw createHttpError(401, "Invalid table QR code. Please scan the code on your table.");

  const table = await get(
    `SELECT id, table_number, qr_code FROM tables WHERE qr_code = ?`,
    [qrCode]
  );
  if (!table || table.id === 999) throw createHttpError(404, "This table QR code is no longer valid.");
  if (!process.env.JWT_SECRET) throw createHttpError(500, "Server misconfiguration: missing JWT secret");

  const token = jwt.sign({
    role: "customer_waiter",
    action: "customer_table_session",
    tableId: table.id,
    qrHash: hashTableQrCode(table.qr_code),
  }, process.env.JWT_SECRET, { expiresIn: CUSTOMER_TABLE_SESSION_MAX_AGE_SECONDS });
  setAuthCookie(res, req, "customer_table", token, CUSTOMER_TABLE_SESSION_MAX_AGE_SECONDS);
  return res.json({ id: table.id, table_number: table.table_number });
};

const getCurrentCustomerTable = async (req, res) => {
  const table = await get("SELECT id, table_number FROM tables WHERE id = ?", [req.customerTableId]);
  if (!table) throw createHttpError(404, "This table is no longer available.");
  return res.json(table);
};

const createTable = async (req, res) => {
  const { table_number } = req.body;
  if (typeof table_number !== "string" || !table_number.trim()) {
    throw createHttpError(400, "A table number is required");
  }
  if (isReservedSystemTableName(table_number)) {
    throw createHttpError(409, "That table name is reserved for the system ordering route.");
  }

  const qrCode = generateTableQrCode();
  const result = await run(`INSERT INTO tables (table_number, qr_code) VALUES (?, ?)`, [table_number.trim(), qrCode]);
  const table = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [result.lastID]);

  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name) VALUES (?, ?, ?, ?, ?)`,
    ["SYSTEM", "CREATE_TABLE", "Manager", result.lastID.toString(), table_number.trim()]
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
  const { table_number } = req.body;
  if (Number(id) === SYSTEM_ORDER_TABLE_ID) {
    throw createHttpError(409, "The system ordering table cannot be edited.");
  }
  const existingTable = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [id]);
  if (!existingTable) throw createHttpError(404, "Table not found");
  if (isProtectedSystemTable(existingTable)) {
    throw createHttpError(409, "The system ordering table cannot be edited.");
  }
  if (typeof table_number !== "string" || !table_number.trim()) {
    throw createHttpError(400, "A table number is required");
  }
  if (isReservedSystemTableName(table_number)) {
    throw createHttpError(409, "That table name is reserved for the system ordering route.");
  }
  const qrCode = normalizeTableQrCode(existingTable.qr_code) || generateTableQrCode();
  await run(`UPDATE tables SET table_number = ?, qr_code = ? WHERE id = ?`, [table_number.trim(), qrCode, id]);
  const table = await get("SELECT id, table_number, qr_code FROM tables WHERE id = ?", [id]);

  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_name, target_id, target_name) VALUES (?, ?, ?, ?, ?)`,
    ["SYSTEM", "UPDATE_TABLE", "Manager", id.toString(), table_number.trim()]
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
  if (Number(id) === SYSTEM_ORDER_TABLE_ID) {
    throw createHttpError(409, "The system ordering table cannot be deleted.");
  }
  const table = await get("SELECT id, table_number FROM tables WHERE id = ?", [id]);
  if (!table) throw createHttpError(404, "Table not found");
  if (isProtectedSystemTable(table)) {
    throw createHttpError(409, "The system ordering table cannot be deleted.");
  }

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

module.exports = {
  getTables,
  createCustomerTableSession,
  getCurrentCustomerTable,
  createTable,
  updateTable,
  deleteTable,
  setBroadcast,
};
