const db = require("./db");

const run = (sql) =>
  new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
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

const ensureColumn = async (tableName, columnName, definition) => {
  const columns = await all(`PRAGMA table_info(${tableName})`);

  if (!columns.some((column) => column.name === columnName)) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const ensureIndex = async (indexName, tableName, columns) => {
  await run(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`);
};

const initializeDatabase = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id INTEGER NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT NOT NULL UNIQUE,
      qr_code TEXT NOT NULL UNIQUE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_price REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_at_order_time REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      changed_by TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn("categories", "display_order", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("menu_items", "description", "TEXT");
  await ensureColumn("menu_items", "is_available", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("menu_items", "image_url", "TEXT");
  await ensureColumn("menu_items", "is_popular", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("menu_items", "is_promo", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("menu_items", "promo_label", "TEXT");
  await ensureColumn("tables", "table_number", "TEXT");
  await ensureColumn("tables", "qr_code", "TEXT");
  await ensureColumn("orders", "status", "TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn("orders", "total_price", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("orders", "created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("order_items", "price_at_order_time", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("order_items", "notes", "TEXT");
  await ensureColumn("order_status_history", "order_id", "INTEGER NOT NULL");
  await ensureColumn("order_status_history", "status", "TEXT NOT NULL");
  await ensureColumn("order_status_history", "changed_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("order_status_history", "changed_by", "TEXT");

  const tableColumns = await all(`PRAGMA table_info(tables)`);
  const hasLegacyNameColumn = tableColumns.some((column) => column.name === "name");

  if (hasLegacyNameColumn) {
    await run(`
      UPDATE tables
      SET table_number = COALESCE(table_number, name, 'Table ' || id)
      WHERE table_number IS NULL OR TRIM(table_number) = ''
    `);
  } else {
    await run(`
      UPDATE tables
      SET table_number = 'Table ' || id
      WHERE table_number IS NULL OR TRIM(table_number) = ''
    `);
  }

  await run(`
    UPDATE tables
    SET qr_code = 'table-' || id
    WHERE qr_code IS NULL OR TRIM(qr_code) = ''
  `);

  await ensureIndex("idx_menu_items_category_available", "menu_items", "category_id, is_available");
  await ensureIndex("idx_orders_table_status_created", "orders", "table_id, status, created_at");
  await ensureIndex("idx_orders_status_created", "orders", "status, created_at");
  await ensureIndex("idx_order_items_order", "order_items", "order_id");
  await ensureIndex("idx_order_items_menu_item", "order_items", "menu_item_id");
  await ensureIndex("idx_tables_qr_code", "tables", "qr_code");
  await ensureIndex("idx_order_status_history_order", "order_status_history", "order_id, changed_at DESC");
  await ensureIndex("idx_order_status_history_status", "order_status_history", "status, changed_at DESC");

  console.log("Database schema ready");
};

module.exports = initializeDatabase;
