/*
 * server.js — Application entry point.
 *
 * I wrote this file to wire together every part of the system in one place:
 * the Express web server, the WebSocket server, all API route groups, the
 * database initialisation sequence, and the daily archive scheduler that
 * runs at 01:30 every night. Reading this file top-to-bottom gives you a
 * complete picture of how the application starts up.
 */

require("dotenv").config();
// Fail fast if critical secrets are missing to avoid insecure fallback behavior
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set. Aborting startup to prevent insecure default secrets.");
  process.exit(1);
}
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const helmet = require("helmet");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryAsync = async (work, attempts = 3, initialDelayMs = 5000) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      lastError = err;
      console.error(`Retry attempt ${attempt} failed:`, err);
      if (attempt < attempts) {
        await wait(initialDelayMs * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastError;
};

const { errorHandler, notFoundHandler } = require("./middleware/validation");
const { attachRoleMiddleware } = require("./middleware/role-based-access");
const menuRoutes = require("./routes/menuRoutes");
const orderRoutes = require("./routes/orderRoutes");
const tableRoutes = require("./routes/tableRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const managementRoutes = require("./routes/managementRoutes");
const { executeArchive, forceArchiveLeftovers } = require("./controllers/paymentController");
const { archiveStaffAssistanceRequests } = require("./controllers/orderController");
const initializeDatabase = require("./database/init");
const seedDatabase = require("./database/seed");
const { executeNightlyCloudBackup, ensureCloudBackupUpToDate } = require("./services/cloudBackupService");
const { compressImagesInDirectory } = require("./utils/imageCompressor");
const db = require("./database/db");

const DEFAULT_CAPTIVE_PORTAL_TARGET = "http://10.42.0.1:5000/";
const normalizeUrl = (value) => {
  if (!value || typeof value !== "string") return DEFAULT_CAPTIVE_PORTAL_TARGET;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CAPTIVE_PORTAL_TARGET;
  return trimmed.replace(/\/+$/, "") + "/";
};

const getRestaurantSetting = (key) =>
  new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });

const isLocalHostHeader = (host) =>
  typeof host === "string" && /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);

const getLocalNetworkAddress = () => {
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
};

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

const resolveCaptivePortalTarget = async (req) => {
  if (process.env.CAPTIVE_PORTAL_TARGET) {
    return normalizeUrl(process.env.CAPTIVE_PORTAL_TARGET);
  }

  try {
    const rawValue = await getRestaurantSetting("captive_portal_target");
    if (rawValue) {
      return normalizeUrl(rawValue);
    }
  } catch (err) {
    console.warn("Could not load captive portal target from settings:", err && err.message ? err.message : err);
  }

  const requestHostUrl = getServerBaseUrlFromRequest(req);
  if (requestHostUrl) {
    return requestHostUrl;
  }

  return DEFAULT_CAPTIVE_PORTAL_TARGET;
};

/*
 * I create the Express app and then wrap it in a plain Node.js HTTP server
 * instead of calling app.listen() directly. This is necessary because the
 * WebSocket server (ws) needs to attach to the same underlying HTTP server
 * object — you cannot attach a WebSocket server to an Express app directly.
 */
const app = express();
const server = http.createServer(app);

/* Attach the WebSocket server to the same HTTP server. */
const wss = new WebSocketServer({ server });

/*
 * Handle new WebSocket connections. Require a `token` query parameter with a
 * valid JWT (signed with `JWT_SECRET`). This prevents anonymous clients from
 * receiving sensitive management events. Non-browser clients (like mobile
 * devices) should connect using `wss://.../?token=<JWT>`.
 */
wss.on("connection", (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const qr = url.searchParams.get('qr') || url.searchParams.get('qr_code');

    const jwtLib = require('jsonwebtoken');
    const { getRoleFromQRCode, getTableNumberFromQR } = require('./middleware/role-based-access');

    // Prefer JWT token for authenticated/staff/manager clients
    if (token) {
      if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET not configured; rejecting WS connection');
        ws.close(1011, 'Server misconfiguration');
        return;
      }
      const decoded = jwtLib.verify(token, process.env.JWT_SECRET);
      ws._auth = decoded; // attach decoded JWT for use elsewhere
      ws._role = decoded?.role || null;
      console.log(`WS client connected via token (${ws._role || 'unknown'})`);
    } else if (qr) {
      const role = getRoleFromQRCode(qr);
      if (!role) {
        ws.close(4003, 'Invalid QR code');
        return;
      }

      // Only customer table WebSocket connections are allowed without JWT.
      // Staff and management clients must authenticate using a bearer token.
      if (role !== 'customer_waiter') {
        ws.close(4003, 'Staff and management WebSocket connections must use auth tokens');
        return;
      }

      ws._role = role;
      ws._qr = qr;
      const tableNumber = getTableNumberFromQR(qr);
      ws._tableNumber = tableNumber; // numeric table id
      console.log(`WS client connected via QR (${role})`);
    } else {
      ws.close(4001, 'Missing auth token or QR');
      return;
    }

    ws.on('close', () => console.log('Client disconnected'));
  } catch (err) {
    console.warn('WS connection auth failed:', err.message);
    try { ws.close(4002, 'Auth failed'); } catch (e) {}
  }
});

/*
 * The broadcast function sends a JSON event to every currently-connected
 * WebSocket client. readyState === 1 means the connection is open and
 * ready to receive messages (OPEN state in the WebSocket spec).
 * Controllers call this function after any state change that clients
 * need to know about immediately, such as a new order or a status update.
 */
/**
 * Determine whether a given WebSocket client should receive this event.
 * Managers (JWT with role=manager) receive everything. Kitchen and
 * payment counters receive events relevant to their workflows. Customers
 * (table QR) only receive events that reference their table.
 */
const clientShouldReceive = (client, data) => {
  if (client.readyState !== 1) return false;
  const type = data && data.type;

  // Managers get all events
  if (client._auth?.role === 'manager' || client._role === 'manager') return true;

  // Customer (table) sockets only get events for their own table
  if (client._role === 'customer_waiter') {
    const tableId = client._tableNumber || client._tableId || client._tableNumber === 0 ? client._tableNumber : null;
    // payload may include table_id or order.table_id
    const payload = data && data.payload;
    const eventTableId = payload && (payload.table_id || payload.order?.table_id || payload.table_id);
    if (eventTableId && tableId && Number(eventTableId) === Number(tableId)) return true;
    // Also allow explicit CALL_WAITER_ACK/CALL_WAITER events containing table_id
    if (type === 'CALL_WAITER' || type === 'CALL_WAITER_ACK') {
      return payload && Number(payload.table_id) === Number(tableId);
    }
    return false;
  }

  // Payment counter: interested in payments and order status changes
  if (client._role === 'payment_counter') {
    return ['NEW_PAYMENT', 'ORDER_STATUS_CHANGED', 'ORDER_STATUS_UPDATE', 'CALL_WAITER', 'CALL_WAITER_ACK'].includes(type);
  }

  // Fallback: if client has an authenticated role via JWT, allow if role matches the type
  if (client._auth && client._auth.role) {
    // conservative default: allow authenticated non-manager roles to receive nothing
    return false;
  }

  return false;
};

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    try {
      if (clientShouldReceive(client, data)) {
        client.send(JSON.stringify(data));
      }
    } catch (e) {
      console.warn('Failed to send WS message to client:', e && e.message);
    }
  });
};

/*
 * Path to the compiled frontend. When the frontend is built with
 * `npm run build`, Vite puts the output in frontend/dist. The Express
 * server serves those static files so the whole application can be
 * accessed from a single port in production.
 */
const frontendDistPath = path.resolve(__dirname, "../../../frontend/dist");

/* Configure CORS: permissive in dev, restricted in production via CORS_ALLOWED_ORIGINS */
if (process.env.VITE_DEV_MODE === '1') {
  app.use(cors());
} else {
  const allowed = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow non-browser requests like curl
    if (allowed.length === 0) return cb(new Error('CORS not configured'));
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  }}));
}

// Apply basic security headers
app.use(helmet({ contentSecurityPolicy: false }));

/* Parse incoming JSON request bodies, capped at 100 KB to prevent abuse. */
app.use(express.json({ limit: "100kb" }));

/* Serve dynamic menu images directly from the backend to bypass Vite caching issues. */
app.use("/menu-images", express.static(path.resolve(__dirname, "../../../frontend/public/menu-images")));
app.use("/feedback-images", express.static(path.resolve(__dirname, "../../../frontend/public/feedback-images")));

app.use((req, res, next) => {
  const noStorePaths = new Set(["/", "/index.html", "/sw.js", "/registerSW.js", "/manifest.webmanifest"]);
  if (noStorePaths.has(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

/*
 * The role-detection middleware runs on every request before any route handler.
 * It inspects the qr_code query parameter, figures out what role the caller
 * has (customer, kitchen crew, payment counter, or manager), and attaches that
 * information to the request object so downstream middleware and controllers
 * can make authorisation decisions. See middleware/role-based-access.js for
 * the full logic.
 */
app.use(attachRoleMiddleware);

/* Register all API route groups under their respective URL prefixes. */
app.use("/menu", menuRoutes);

/*
 * The order and payment route factories each receive the broadcast function
 * so they can push real-time events to connected clients whenever an order
 * is created or a payment is processed.
 */
app.use("/orders", orderRoutes(broadcast));
app.use("/tables", tableRoutes);
app.use("/payments", paymentRoutes(broadcast));
app.use("/management", managementRoutes);

// Set up broadcast function for management routes
managementRoutes.setupFeedbackBroadcast(broadcast);
managementRoutes.setupMenuBroadcast(broadcast);
managementRoutes.setupManagementBroadcast(broadcast);

// Set up broadcast function for table routes
tableRoutes.setBroadcast(broadcast);

/*
 * Static file serving for the compiled frontend. If the dist folder exists,
 * Express serves its contents. This is only active in production — during
 * development the Vite dev server handles the frontend separately.
 */
app.use((req, res, next) => {
  if (fs.existsSync(frontendDistPath)) {
    express.static(frontendDistPath)(req, res, next);
  } else {
    next();
  }
});

/*
 * SPA fallback route. Any URL that does not match an API path gets served
 * the frontend's index.html so the React router can handle it client-side.
 * The regex below matches everything EXCEPT the five API prefixes.
 * If no frontend build is found, a simple JSON message is returned instead.
 */
app.get(/^(?!\/(?:menu|orders|tables|payments|management|menu-images|feedback-images)\b).*/, (req, res) => {
  if (fs.existsSync(frontendDistPath)) {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  } else {
    res.json({
      message: "API is running",
      frontend: "No frontend build found. Run the frontend build to serve the web app from this server.",
    });
  }
});

/* Health and readiness endpoints */
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));
app.get('/ready', async (req, res) => {
  try {
    // quick DB ping
    await initializeDatabase();
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: String(err) });
  }
});

/* Captive Portal Routes for Apple, Android, and common connectivity checks */
const redirectToCaptiveTarget = async (req, res) => {
  const target = await resolveCaptivePortalTarget(req);
  return res.status(302).redirect(target);
};

app.get(
  [
    "/hotspot-detect.html",
    "/generate_204",
    "/gen_204",
    "/ncsi.txt",
    "/connecttest.txt",
    "/success.txt",
    "/library/test/success.html",
    "/connectivity-check",
  ],
  async (req, res) => redirectToCaptiveTarget(req, res)
);

/* Global error handlers — these must be registered last. */
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

/*
 * startServer runs the database setup steps in the correct order before the
 * HTTP server begins accepting connections. The order matters: the schema must
 * be created before seeding, and old orders should be archived before any new
 * requests come in.
 */
const startServer = async () => {
  try {
    /* Create all tables if they do not already exist. */
    await initializeDatabase();

    /* Insert default menu items, tables, and settings if the database is empty. */
    await seedDatabase();

    /* Move any leftover orders from yesterday into the Grand Archive. */
    const leftoversCount = await forceArchiveLeftovers();
    if (leftoversCount > 0) {
      console.log(`[Startup] Cleaned up ${leftoversCount} leftover order(s) from previous days.`);
    }
    const archivedAssistanceCount = await archiveStaffAssistanceRequests();
    if (archivedAssistanceCount > 0) {
      console.log(`[Startup] Archived ${archivedAssistanceCount} old staff assistance request(s).`);
    }

    const menuImagesDir = path.resolve(__dirname, "../../../frontend/public/menu-images");
    const feedbackImagesDir = path.resolve(__dirname, "../../../frontend/public/feedback-images");
    await compressImagesInDirectory(menuImagesDir);
    await compressImagesInDirectory(feedbackImagesDir);

    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);

      /*
       * Schedule the nightly archive job. I calculate the milliseconds until
       * the next 01:30 AM and use a one-shot setTimeout to fire then. After
       * that first run it repeats every 24 hours with setInterval. This approach
       * is simpler than a cron library and has no additional dependencies.
       */
      const scheduleDailyArchive = () => {
        const now = new Date();
        const nextRun = new Date(now);
        nextRun.setHours(1, 30, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        const delay = nextRun.getTime() - now.getTime();

        const runArchive = async () => {
          try {
            await retryAsync(async () => {
              const count = await executeArchive();
              const leftoverCount = await forceArchiveLeftovers();
              const assistanceCount = await archiveStaffAssistanceRequests();
              console.log(`Scheduled archive completed. Archived ${count} paid orders, ${leftoverCount} leftover orders, and ${assistanceCount} staff assistance requests.`);
            }, 3, 10000);
          } catch (err) {
            console.error("Scheduled archive permanently failed after retries:", err);
          }
        };

        console.log(`Daily archive scheduled for ${nextRun.toLocaleString()}`);
        setTimeout(() => {
          runArchive();
          setInterval(runArchive, 24 * 60 * 60 * 1000);
        }, delay);
      };

      const scheduleCloudBackup = () => {
        const now = new Date();
        const nextRun = new Date(now);
        nextRun.setHours(3, 0, 0, 0); // 3:00 AM
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        const delay = nextRun.getTime() - now.getTime();

        const runCloudBackup = async () => {
          try {
            await retryAsync(async () => {
              await executeNightlyCloudBackup();
            }, 3, 15000);
          } catch (err) {
            console.error("Scheduled cloud backup permanently failed after retries:", err);
          }
        };

        console.log(`Cloud backup scheduled for ${nextRun.toLocaleString()}`);
        setTimeout(() => {
          runCloudBackup();
          setInterval(runCloudBackup, 24 * 60 * 60 * 1000);
        }, delay);
      };

      scheduleDailyArchive();
      scheduleCloudBackup();
      
      // Execute a catch-up backup check immediately on startup
      ensureCloudBackupUpToDate().catch(err => {
        console.error("Startup catch-up cloud backup failed:", err);
      });
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
