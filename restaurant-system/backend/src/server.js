const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { errorHandler, notFoundHandler } = require("./middleware/validation");
const menuRoutes = require("./routes/menuRoutes");
const orderRoutes = require("./routes/orderRoutes");
const tableRoutes = require("./routes/tableRoutes");
const initializeDatabase = require("./database/init");
const seedDatabase = require("./database/seed");

const app = express();
const frontendDistPath = path.resolve(__dirname, "../../../frontend/dist");
const hasFrontendBuild = fs.existsSync(frontendDistPath);

app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.use("/menu", menuRoutes);
app.use("/orders", orderRoutes);
app.use("/tables", tableRoutes);

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

const startServer = async () => {
  try {
    await initializeDatabase();
    await seedDatabase();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
