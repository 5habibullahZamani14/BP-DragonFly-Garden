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
const { executeArchive } = require("./controllers/paymentController");
const initializeDatabase = require("./database/init");
const seedDatabase = require("./database/seed");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.on("close", () => console.log("Client disconnected"));
});

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
};

const frontendDistPath = path.resolve(__dirname, "../../../frontend/dist");

app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.use(attachRoleMiddleware);

app.use("/menu", menuRoutes);
app.use("/orders", orderRoutes(broadcast));
app.use("/tables", tableRoutes);
app.use("/payments", paymentRoutes(broadcast));

app.use((req, res, next) => {
  if (fs.existsSync(frontendDistPath)) {
    express.static(frontendDistPath)(req, res, next);
  } else {
    next();
  }
});

app.get(/^(?!\/(?:menu|orders|tables|payments)\b).*/, (req, res) => {
  if (fs.existsSync(frontendDistPath)) {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  } else {
    res.json({
      message: "API is running",
      frontend: "No frontend build found. Run the frontend build to serve the web app from this server.",
    });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    await initializeDatabase();
    await seedDatabase();

    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);

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
