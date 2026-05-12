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
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const { errorHandler, notFoundHandler } = require("./middleware/validation");
const { attachRoleMiddleware } = require("./middleware/role-based-access");
const menuRoutes = require("./routes/menuRoutes");
const orderRoutes = require("./routes/orderRoutes");
const tableRoutes = require("./routes/tableRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const managementRoutes = require("./routes/managementRoutes");
const { executeArchive } = require("./controllers/paymentController");
const initializeDatabase = require("./database/init");
const { archiveYesterdaysOrders } = require("./controllers/orderController");
const seedDatabase = require("./database/seed");

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
 * Handle new WebSocket connections. Right now the server only uses WebSockets
 * to push events to clients (new orders, status changes) — clients do not send
 * any messages back, so I only need to handle the connect and disconnect events.
 */
wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.on("close", () => console.log("Client disconnected"));
});

/*
 * The broadcast function sends a JSON event to every currently-connected
 * WebSocket client. readyState === 1 means the connection is open and
 * ready to receive messages (OPEN state in the WebSocket spec).
 * Controllers call this function after any state change that clients
 * need to know about immediately, such as a new order or a status update.
 */
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
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

/* Allow cross-origin requests (needed during local development). */
app.use(cors());

/* Parse incoming JSON request bodies, capped at 100 KB to prevent abuse. */
app.use(express.json({ limit: "100kb" }));

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
app.get(/^(?!\/(?:menu|orders|tables|payments|management)\b).*/, (req, res) => {
  if (fs.existsSync(frontendDistPath)) {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  } else {
    res.json({
      message: "API is running",
      frontend: "No frontend build found. Run the frontend build to serve the web app from this server.",
    });
  }
});

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

    /* Move any ready orders left over from yesterday into the archive. */
    await archiveYesterdaysOrders();

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
          const count = await executeArchive();
            await archiveYesterdaysOrders();
            console.log(`Scheduled archive completed. Archived ${count} orders.`);
          } catch (err) {
            console.error("Scheduled archive failed:", err);
          }
        };

        console.log(`Daily archive scheduled for ${nextRun.toLocaleString()}`);
        setTimeout(() => {
          runArchive();
          setInterval(runArchive, 24 * 60 * 60 * 1000);
        }, delay);
      };

      scheduleDailyArchive();
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
