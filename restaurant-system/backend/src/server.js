const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { errorHandler, notFoundHandler } = require("./middleware/validation");
const { attachRoleMiddleware } = require("./middleware/role-based-access");
const menuRoutes = require("./routes/menuRoutes");
const orderRoutes = require("./routes/orderRoutes");
const tableRoutes = require("./routes/tableRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const initializeDatabase = require("./database/init");
const seedDatabase = require("./database/seed");

const app = express();
const frontendDistPath = path.resolve(__dirname, "../../../frontend/dist");
const hasFrontendBuild = fs.existsSync(frontendDistPath);

app.use(cors());
app.use(express.json({ limit: "100kb" }));

// Attach role information to all requests
app.use(attachRoleMiddleware);

app.use("/menu", menuRoutes);
app.use("/orders", orderRoutes);
app.use("/tables", tableRoutes);
app.use("/payments", paymentRoutes);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get(/^(?!\/(?:menu|orders|tables)\b).*/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.json({
      message: "API is running",
      frontend: "No frontend build found. Run the frontend build to serve the web app from this server."
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    await initializeDatabase();
    await seedDatabase();

    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);

      const scheduleDailyArchive = () => {
        const now = new Date();
        const nextRun = new Date(now);
        nextRun.setHours(1, 30, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        const delay = nextRun.getTime() - now.getTime();

        const runArchive = () => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port: PORT,
              path: "/payments/archive?qr_code=payment-counter-scheduler",
              method: "POST",
              headers: {
                "Content-Length": 0,
              },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => {
                body += chunk;
              });
              res.on("end", () => {
                console.log(`Scheduled archive completed with status ${res.statusCode}: ${body}`);
              });
            }
          );

          req.on("error", (err) => {
            console.error("Scheduled archive request failed:", err);
          });
          req.end();
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
