const db = require("./db");

const run = (sql) =>
  new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

const optimizeDatabase = async () => {
  console.log("[DB] Starting optimization...");

  try {
    // 1. Ensure WAL Mode (Performance)
    await run("PRAGMA journal_mode=WAL;");
    await run("PRAGMA synchronous=NORMAL;");
    
    // 2. Add advanced indexes for the Upselling and Reporting queries
    console.log("[DB] Building advanced indexes...");
    await run("CREATE INDEX IF NOT EXISTS idx_order_items_menu_order ON order_items (order_id, menu_item_id);");
    await run("CREATE INDEX IF NOT EXISTS idx_grand_archive_logs_actor ON grand_archive_logs (actor_name, timestamp DESC);");
    await run("CREATE INDEX IF NOT EXISTS idx_orders_type_created ON orders (order_type, created_at DESC);");

    // 3. Optimize fragmented data
    console.log("[DB] Running VACUUM and ANALYZE...");
    await run("VACUUM;");
    await run("ANALYZE;");
    
    console.log("[DB] Optimization complete! The database is now running at peak efficiency.");
  } catch (err) {
    console.error("[DB] Optimization failed:", err);
  } finally {
    process.exit(0);
  }
};

optimizeDatabase();
