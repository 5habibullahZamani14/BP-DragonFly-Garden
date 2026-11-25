/*
 * server.js — Application entry point.
 *
 * I wrote this file to wire together every part of the system in one place:
 * the Express web server, the WebSocket server, all API route groups, the
 * database initialisation sequence, and the daily archive scheduler that
 * runs at 01:30 every night. Reading this file top-to-bottom gives you a
 * complete picture of how the application starts up.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.local"), override: true });
const { validateJwtSecret } = require("./utils/jwtSecret");
const jwtSecretError = validateJwtSecret(process.env.JWT_SECRET);
if (jwtSecretError) {
  console.error(`FATAL: ${jwtSecretError} Generate a unique random secret before starting the server.`);
  process.exit(1);
}
const fs = require("fs");
const os = require("os");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { clientShouldReceive, sanitizeCustomerRealtimeEvent } = require("./websocketAccess");
const helmet = require("helmet");
const { getAuthCookieValue } = require("./middleware/authCookies");
const { verifyJwtToken, verifyCustomerTableToken } = require("./middleware/jwt-auth");
const { redactSensitiveData, redactText } = require("./middleware/secretRedaction");
const {
  isTrustedOrigin,
  isMicrosoftConnectivityOrigin,
  createTrustedOriginMiddleware,
} = require("./middleware/trustedOrigin");
const { printCopies } = require("./services/receiptCopies");
const { getValidatedRequestBaseUrl } = require("./utils/networkAddress");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryAsync = async (work, attempts = 3, initialDelayMs = 5000) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      lastError = err;
      console.error(`Retry attempt ${attempt} failed:`, redactText(err && err.message ? err.message : "Unknown error"));
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
const printerService = require("./services/printerService");

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

const getLocalNetworkAddress = () => {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaceList of Object.values(nets)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === "IPv4" && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }
  return candidates.find((address) => address === "10.42.0.1")
    || candidates[0]
    || null;
};

const getServerBaseUrlFromRequest = (req) => {
  const requestBaseUrl = getValidatedRequestBaseUrl(req);
  if (requestBaseUrl) return requestBaseUrl;

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

  const localIp = getLocalNetworkAddress();
  const port = req.socket?.localPort || Number(process.env.PORT) || 5000;

  if (localIp !== "10.42.0.1") {
    const requestHostUrl = getServerBaseUrlFromRequest(req);
    if (requestHostUrl) return normalizeUrl(requestHostUrl);
    if (localIp) return normalizeUrl(`http://${localIp}:${port}`);
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
let isShuttingDown = false;
const app = express();
const server = http.createServer(app);

/* Attach the WebSocket server to the same HTTP server. */
const wss = new WebSocketServer({ server });

/*
 * Browser WebSocket authentication uses HttpOnly session cookies. Tokens in
 * query strings are rejected so they cannot leak through URLs or diagnostics.
 */
wss.on("connection", async (ws, req) => {
  if (isShuttingDown) {
    ws.close(1012, "Server is shutting down");
    return;
  }

  try {
    const wsProtocol = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || (req.socket.encrypted ? "https" : "http");
    if (!isTrustedOrigin(req.headers.origin, req.headers.host, allowedOrigins, allowDevelopmentPort, wsProtocol)) {
      ws.close(4003, "WebSocket origin is not allowed");
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.searchParams.has("token") || url.searchParams.has("qr") || url.searchParams.has("qr_code")) {
      ws.close(4003, "Query-string authentication is disabled");
      return;
    }

    const requestedRole = url.searchParams.get("role");
    if (requestedRole === "customer_waiter") {
      const tableSession = await verifyCustomerTableToken(req.headers.cookie);
      ws._role = tableSession.role;
      ws._tableNumber = tableSession.tableId;
      ws._tableId = tableSession.tableId;
      console.log("WS client connected via authenticated table session");
    } else {
      const cookieRole = requestedRole === "payment_counter" ? "payment_counter" : "manager";
      if (requestedRole && !["manager", "payment_counter"].includes(requestedRole)) {
        ws.close(4003, "Unsupported WebSocket role");
        return;
      }
      const cookieToken = getAuthCookieValue(req.headers.cookie, cookieRole);
      if (!cookieToken) {
        ws.close(4001, "Missing authenticated session");
        return;
      }

      const decoded = await verifyJwtToken(
        { headers: { authorization: `Bearer ${cookieToken}` } },
        [cookieRole]
      );
      ws._auth = decoded;
      ws._role = decoded.role;
    }
  } catch (err) {
    console.warn('WS connection authentication failed');
    try { ws.close(4002, 'Auth failed'); } catch (e) {}
  }
});

/*
 * The broadcast function sends a JSON event to every currently-connected
 * WebSocket client. Controllers call this after relevant state changes.
 */
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    try {
      if (clientShouldReceive(client, data)) {
        const clientData = client._role === "customer_waiter"
          ? sanitizeCustomerRealtimeEvent(data)
          : data;
        client.send(JSON.stringify(clientData));
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
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
const allowDevelopmentPort = process.env.VITE_DEV_MODE === "1";
const getRequestProtocol = req => req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
app.use(cors((req, callback) => {
  const origin = req.get("Origin");
  if (!origin) return callback(null, { origin: false, credentials: true });

  const trusted = isTrustedOrigin(origin, req.get("host"), allowedOrigins, allowDevelopmentPort, getRequestProtocol(req))
    || isMicrosoftConnectivityOrigin(origin);
  callback(null, { origin: trusted ? origin : false, credentials: true });
}));
app.use(createTrustedOriginMiddleware(allowedOrigins, allowDevelopmentPort, getRequestProtocol));

// Apply basic security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    referrerPolicy: { policy: "no-referrer" },
  }),
);

/* Parse incoming JSON request bodies, capped at 100 KB to prevent abuse. */
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => json(redactSensitiveData(body));
  next();
});

app.use((req, res, next) => {
  if (!isShuttingDown) return next();
  res.setHeader("Connection", "close");
  return res.status(503).json({ error: "The server is shutting down." });
});

/* Serve dynamic menu images directly from the backend to bypass Vite caching issues. */
app.use("/menu-images", (req, res, next) => {
  if (!/\.(?:jpe?g|png|webp|gif)$/i.test(path.extname(req.path))) {
    return res.sendStatus(404);
  }
  return express.static(path.resolve(__dirname, "../../../frontend/public/menu-images"))(req, res, next);
});
app.use("/feedback-images", (req, res, next) => {
  if (!/\.(?:jpe?g|png|webp|gif)$/i.test(path.extname(req.path))) {
    return res.sendStatus(404);
  }
  return express.static(path.resolve(__dirname, "../../../frontend/public/feedback-images"))(req, res, next);
});

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
 * has (customer, payment counter staff, or manager), and attaches that
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
managementRoutes.setupDataCleanupBroadcast(broadcast);

// Set up broadcast function for table routes
tableRoutes.setBroadcast(broadcast);
// Inject broadcast into paymentController so controller functions can broadcast directly
const paymentController = require("./controllers/paymentController");
if (paymentController && typeof paymentController.setBroadcast === 'function') {
  paymentController.setBroadcast(broadcast);
}

/* Captive Portal Routes for Apple, Android, and common connectivity checks */
const redirectToCaptiveTarget = async (req, res) => {
  const target = await resolveCaptivePortalTarget(req);
  return res.status(302).redirect(target);
};

app.get(
  [
    "/hotspot-detect.html",
      "/redirect",
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
 * The regex below excludes API prefixes and explicit health/readiness endpoints.
 * If no frontend build is found, a simple JSON message is returned instead.
 */
app.get(/^(?!\/(?:menu|orders|tables|payments|management|menu-images|feedback-images|health|ready)\b).*/, (req, res) => {
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
    console.error("Readiness check failed:", redactText(err && err.message ? err.message : "Unknown error"));
    res.status(503).json({ ready: false, error: "Service is not ready" });
  }
});

/* Global error handlers — these must be registered last. */
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

// Store references to all timers/intervals for cleanup
const scheduledTasks = {
  archiveTimeout: null,
  archiveInterval: null,
  cloudBackupTimeout: null,
  cloudBackupInterval: null,
  salesReportInterval: null,
  inFlight: new Set(),
  shuttingDown: false,
};

const trackScheduledTask = (task) => {
  if (scheduledTasks.shuttingDown) return;

  const taskPromise = Promise.resolve().then(task);
  scheduledTasks.inFlight.add(taskPromise);
  taskPromise.then(
    () => scheduledTasks.inFlight.delete(taskPromise),
    (err) => {
      scheduledTasks.inFlight.delete(taskPromise);
      console.error("Scheduled background task failed:", err);
    }
  );
};

/*
 * Graceful shutdown handler - ensures proper cleanup of all resources
 * when the server receives termination signals (SIGINT, SIGTERM)
 */
let shutdownPromise = null;
let shutdownExitCode = 0;
const gracefulShutdown = (signal) => {
  if (signal === "UNCAUGHT_EXCEPTION" || signal === "UNHANDLED_REJECTION") {
    shutdownExitCode = 1;
  }
  if (shutdownPromise) return shutdownPromise;

  console.log(`\n${signal} received. Starting graceful shutdown...`);
  const forceShutdownTimer = setTimeout(() => {
    console.error("Forced shutdown after 120 seconds.");
    process.exit(1);
  }, 120000);
  forceShutdownTimer.unref();

  shutdownPromise = (async () => {
    try {
      scheduledTasks.shuttingDown = true;
      isShuttingDown = true;
      if (scheduledTasks.archiveTimeout) clearTimeout(scheduledTasks.archiveTimeout);
      if (scheduledTasks.archiveInterval) clearInterval(scheduledTasks.archiveInterval);
      if (scheduledTasks.cloudBackupTimeout) clearTimeout(scheduledTasks.cloudBackupTimeout);
      if (scheduledTasks.cloudBackupInterval) clearInterval(scheduledTasks.cloudBackupInterval);
      if (scheduledTasks.salesReportInterval) clearInterval(scheduledTasks.salesReportInterval);
      console.log("Scheduled tasks stopped; rejecting new requests and closing WebSocket clients.");

      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify({ type: "SERVER_SHUTDOWN", message: "Server is shutting down" }));
            client.close(1000, "Server shutdown");
          } catch (err) {
            console.warn("Error closing WebSocket client:", err.message);
          }
        }
      });

      await new Promise((resolve) => wss.close(resolve));
      console.log("WebSocket server closed");

      while (scheduledTasks.inFlight.size > 0) {
        await Promise.allSettled(Array.from(scheduledTasks.inFlight));
      }
      console.log("Active background work finished");

      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log("HTTP server closed");

      await db.close();
      console.log("Database connection closed");
      console.log("Graceful shutdown completed successfully");
      clearTimeout(forceShutdownTimer);
      process.exit(shutdownExitCode);
    } catch (err) {
      console.error("Graceful shutdown failed:", err);
      clearTimeout(forceShutdownTimer);
      process.exit(1);
    }
  })();

  return shutdownPromise;
};

managementRoutes.setupShutdownHandler(() => gracefulShutdown("MANAGER_REQUEST"));

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions to prevent zombie processes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

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
              broadcast({ type: "DATA_REFRESH" });
            }, 3, 10000);
          } catch (err) {
            console.error("Scheduled archive permanently failed after retries:", err);
          }
        };

        console.log(`Daily archive scheduled for ${nextRun.toLocaleString()}`);
        scheduledTasks.archiveTimeout = setTimeout(() => {
          if (scheduledTasks.shuttingDown) return;
          trackScheduledTask(runArchive);
          scheduledTasks.archiveInterval = setInterval(() => trackScheduledTask(runArchive), 24 * 60 * 60 * 1000);
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
            broadcast({ type: "BACKUP_UPDATE" });
          } catch (err) {
            console.error("Scheduled cloud backup permanently failed after retries:", err);
          }
        };

        console.log(`Cloud backup scheduled for ${nextRun.toLocaleString()}`);
        scheduledTasks.cloudBackupTimeout = setTimeout(() => {
          if (scheduledTasks.shuttingDown) return;
          trackScheduledTask(runCloudBackup);
          scheduledTasks.cloudBackupInterval = setInterval(() => trackScheduledTask(runCloudBackup), 24 * 60 * 60 * 1000);
        }, delay);
      };

      const scheduleDailySalesReport = () => {
        const dailySales = require("./services/dailySalesReceiptService");
        const checkAndPrintSalesReport = async () => {
          await dailySales.reconcileDailySalesReceipts();
          broadcast({ type: "DAILY_SALES_REPORT_UPDATE" });
        };
        trackScheduledTask(checkAndPrintSalesReport);
        scheduledTasks.salesReportInterval = setInterval(() => trackScheduledTask(checkAndPrintSalesReport), 60 * 1000);
      };

      scheduleDailyArchive();
      scheduleCloudBackup();
      scheduleDailySalesReport();
      
      // Execute a catch-up backup check immediately on startup
      trackScheduledTask(async () => {
        try {
          await ensureCloudBackupUpToDate();
          broadcast({ type: "BACKUP_UPDATE" });
        } catch (err) {
          console.error("Startup catch-up cloud backup failed:", err);
        }
      });
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
