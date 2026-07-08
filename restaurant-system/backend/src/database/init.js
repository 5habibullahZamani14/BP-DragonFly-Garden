/*
 * init.js — Database schema initialisation.
 *
 * I wrote this file to set up every table the application needs. It runs once
 * at server startup (called from server.js before any requests are accepted).
 * All CREATE TABLE statements use IF NOT EXISTS, so running this file on an
 * already-populated database is completely safe — it will not overwrite data.
 *
 * The ensureColumn helper at the top handles schema migrations: as the
 * application grows and new columns are added, this function checks whether
 * a column exists before trying to add it. This means you can deploy a new
 * version of the code without having to manually migrate the existing database
 * file on the Raspberry Pi.
 *
 * Database layout (tables and their relationships):
 *
 *   categories          Menu categories (Mains, Beverages, etc.)
 *   menu_items          Individual dishes and drinks, linked to a category
 *   menu_item_ingredients  Recipe ingredients linking menu items to inventory
 *   tables              Physical restaurant tables, each with a unique QR code
 *   orders              Customer orders, linked to a table
 *   order_items         Line items within an order, linked to menu_items
 *   order_status_history  Audit trail of every status change on an order
 *   payment_methods     Accepted payment types (Cash, Card, eWallet, etc.)
 *   payments            Individual payment transactions against an order
 *   payment_logs        Audit trail of payment-related actions
 *   archived_orders     Completed orders moved out of the live orders table
 *   restaurant_settings Key-value table for configurable settings
 *   employees           Staff records managed through the management dashboard
 *   inventory_items     Ingredient / supply stock levels
 *   grand_archive_logs  System-wide audit log for all significant actions
 */

const db = require("./db");

/*
 * run wraps db.run in a Promise so I can use async/await instead of nested
 * callbacks. It resolves with the SQLite statement context (which has
 * lastID and changes) on success, or rejects with the error on failure.
 */
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

/* all wraps db.all in a Promise — used here to read PRAGMA results. */
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

/*
 * ensureColumn checks whether a column already exists in a table using
 * SQLite's PRAGMA table_info command. If the column is missing, it adds it
 * with ALTER TABLE. This is how I handle live schema migrations — instead of
 * dropping and recreating tables (which would destroy data), I just add the
 * missing columns when the server starts.
 */
const ensureColumn = async (tableName, columnName, definition) => {
  const columns = await all(`PRAGMA table_info(${tableName})`);

  if (!columns.some((column) => column.name === columnName)) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

/*
 * ensureIndex creates a database index if it does not already exist.
 * Indexes speed up SELECT queries on frequently-searched columns. I added
 * indexes on columns that are used in WHERE clauses across the controllers,
 * such as table_id, status, and created_at on the orders table.
 */
const ensureIndex = async (indexName, tableName, columns) => {
  await run(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`);
};

const initializeDatabase = async () => {
  // ==========================================
  // PHASE 1: CREATE BASE TABLES
  // ==========================================

  /* Categories group menu items into sections like Mains, Beverages, etc. */
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  /* Menu items are the individual dishes and drinks shown to customers. */
  await run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id INTEGER NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      pattern_id INTEGER,
      repo_image_id INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE SET NULL,
      FOREIGN KEY (repo_image_id) REFERENCES repo_images(id) ON DELETE SET NULL
    )
  `);

  /* Pattern assets represent decorative overlays managers can apply to menu cards. */
  await run(`
    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      opacity REAL NOT NULL DEFAULT 0.4,
      zoom REAL NOT NULL DEFAULT 1.0,
      rotation REAL NOT NULL DEFAULT 0,
      flip_horizontal INTEGER NOT NULL DEFAULT 0,
      flip_vertical INTEGER NOT NULL DEFAULT 0,
      fade_direction TEXT NOT NULL DEFAULT 'none',
      fade_intensity REAL NOT NULL DEFAULT 0.5
    )
  `);

  /* Repository sections allow managers to group reusable menu images. */
  await run(`
    CREATE TABLE IF NOT EXISTS image_repository_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      max_bytes INTEGER NOT NULL DEFAULT 102400,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS repo_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (section_id) REFERENCES image_repository_sections(id) ON DELETE CASCADE
    )
  `);

  /* Tables represent the physical tables in the restaurant. */
  await run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT NOT NULL UNIQUE,
      qr_code TEXT NOT NULL UNIQUE
    )
  `);

  /*
   * Orders are created when a customer submits their cart. The status column
   * tracks the order through its lifecycle: queue → preparing → ready.
   */
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

  /* Order items are the individual line items (dishes) within an order. */
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

  /*
   * Order status history records every status change with a timestamp and
   * who made the change. This provides a complete audit trail for each order.
   */
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

  /* Payment methods are the accepted ways to pay (Cash, Card, eWallet, etc.). */
  await run(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  /* Payments records each individual payment transaction. */
  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method_id INTEGER NOT NULL,
      amount_paid REAL NOT NULL,
      payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      employee_id TEXT,
      employee_name TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT
    )
  `);

  /* Payment logs is an audit trail of every payment-related action. */
  await run(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      employee_id TEXT,
      employee_name TEXT,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  /*
   * Archived orders stores a JSON snapshot of each completed order. Once an
   * order is paid and the payment counter closes it, the full order details
   * (items, quantities, prices) are serialised into order_data so the record
   * is self-contained even if the original order or menu items are deleted.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS archived_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_order_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      total_price REAL NOT NULL,
      vat_rate REAL NOT NULL DEFAULT 0.06,
      service_charge_rate REAL NOT NULL DEFAULT 0.10,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      created_at DATETIME NOT NULL,
      archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      order_data TEXT NOT NULL -- JSON string of order details
    )
  `);

  /*
   * Staff assistance requests are created when customers press Call Staff.
   * Current-day requests stay visible to the payment counter; older requests
   * are marked archived by the nightly archive job.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS staff_assistance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      table_number TEXT NOT NULL,
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      acknowledged_at DATETIME,
      acknowledged_by_id TEXT,
      acknowledged_by_name TEXT,
      archived_at DATETIME
    )
  `);

  /*
   * Customer feedback — private to sender (view_token) and manager dashboard.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS customer_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      view_token TEXT NOT NULL UNIQUE,
      table_id INTEGER,
      table_number TEXT,
      order_id INTEGER,
      sender_name TEXT NOT NULL,
      sender_email TEXT,
      comment TEXT NOT NULL,
      rating_staff INTEGER,
      rating_app INTEGER,
      rating_cleanliness INTEGER,
      rating_food INTEGER,
      rating_atmosphere INTEGER,
      rating_value INTEGER,
      suggestion_tags TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      manager_response TEXT,
      responded_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at DATETIME
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS customer_feedback_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (feedback_id) REFERENCES customer_feedback(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS feedback_analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_from TEXT,
      period_to TEXT,
      feedback_count INTEGER NOT NULL DEFAULT 0,
      report_json TEXT NOT NULL,
      analysis_method TEXT NOT NULL DEFAULT 'rule_based',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS feedback_analysis_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      evidence_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_at DATETIME,
      FOREIGN KEY (run_id) REFERENCES feedback_analysis_runs(id) ON DELETE CASCADE
    )
  `);

  /*
   * restaurant_settings stores configuration values as key-value pairs.
   * Currently used for work_hours (when the payment counter is active)
   * and the manager's credentials. Using a key-value table means adding
   * a new setting requires no schema change — just a new row.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS restaurant_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  /* Employees are the staff members who can log into the payment counter. */
  await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      department TEXT,
      salary REAL DEFAULT 0,
      bonuses REAL DEFAULT 0,
      shift_start TEXT,
      shift_end TEXT,
      employment_type TEXT,
      contact_info TEXT,
      hire_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_archived INTEGER NOT NULL DEFAULT 0
    )
  `);

  /* Inventory tracks raw ingredient stock levels. */
  await run(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0,
      max_stock REAL NOT NULL DEFAULT 100,
      low_stock_threshold_percent REAL NOT NULL DEFAULT 15,
      is_archived INTEGER NOT NULL DEFAULT 0
    )
  `);

  /*
   * menu_item_ingredients links menu items to the inventory items they consume.
   * When an order is placed, the system deducts the required quantity from
   * current_stock for each ingredient in each ordered dish.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS menu_item_ingredients (
      menu_item_id INTEGER NOT NULL,
      inventory_item_id INTEGER NOT NULL,
      quantity_required REAL NOT NULL,
      PRIMARY KEY (menu_item_id, inventory_item_id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    )
  `);

  /*
   * grand_archive_logs is the central audit log for the whole system. Every
   * significant action — an employee being created, stock being restocked,
   * a table being added — gets an entry here. The management dashboard
   * reads from this table to display the activity log to the manager.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS grand_archive_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      category TEXT NOT NULL, -- e.g., 'EMPLOYEE', 'INVENTORY', 'ORDER', 'SYSTEM'
      action TEXT NOT NULL, -- e.g., 'LOGIN', 'RESTOCK', 'CREATE'
      actor_id TEXT, -- ID of the employee/manager doing the action
      actor_name TEXT,
      target_id TEXT, -- ID of the affected entity
      target_name TEXT,
      details TEXT -- JSON string with granular info
    )
  `);

  /*
   * item_option_groups groups modifier choices for a menu item, e.g. "Size",
   * "Ice Level", "Spice Level". Each group can be required or optional, and
   * single-select (radio) or multi-select (checkbox).
   */
  await run(`
    CREATE TABLE IF NOT EXISTS item_option_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 1,
      is_multi_select INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
    )
  `);

  /*
   * item_options are the individual choices within a group, e.g. Small/Medium/Large.
   * price_delta is added to the item's base price (0 = no extra charge).
   */
  await run(`
    CREATE TABLE IF NOT EXISTS item_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      price_delta REAL NOT NULL DEFAULT 0.0,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES item_option_groups(id) ON DELETE CASCADE
    )
  `);

  // ==========================================
  // PHASE 2: COLUMN MIGRATIONS (ensureColumn)
  // ==========================================

  await ensureColumn("categories", "display_order", "INTEGER NOT NULL DEFAULT 0");

  await ensureColumn("menu_items", "description", "TEXT");
  await ensureColumn("menu_items", "is_available", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("menu_items", "image_url", "TEXT");
  await ensureColumn("menu_items", "pattern_id", "INTEGER");
  await ensureColumn("menu_items", "is_popular", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("menu_items", "is_promo", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("menu_items", "promo_label", "TEXT");
  await ensureColumn("menu_items", "card_size", "TEXT NOT NULL DEFAULT 'normal'");

  // Pattern editing properties
  await ensureColumn("patterns", "opacity", "REAL NOT NULL DEFAULT 0.4");
  await ensureColumn("patterns", "zoom", "REAL NOT NULL DEFAULT 1.0");
  await ensureColumn("patterns", "rotation", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("patterns", "flip_horizontal", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("patterns", "flip_vertical", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("patterns", "fade_direction", "TEXT NOT NULL DEFAULT 'none'");
  await ensureColumn("patterns", "fade_intensity", "REAL NOT NULL DEFAULT 0.5");
  await ensureColumn("menu_items", "repo_image_id", "INTEGER");
  await run(`
    CREATE TABLE IF NOT EXISTS image_repository_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      max_bytes INTEGER NOT NULL DEFAULT 102400,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS repo_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (section_id) REFERENCES image_repository_sections(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      opacity REAL NOT NULL DEFAULT 0.4,
      zoom REAL NOT NULL DEFAULT 1.0,
      rotation REAL NOT NULL DEFAULT 0,
      flip_horizontal INTEGER NOT NULL DEFAULT 0,
      flip_vertical INTEGER NOT NULL DEFAULT 0,
      fade_direction TEXT NOT NULL DEFAULT 'none',
      fade_intensity REAL NOT NULL DEFAULT 0.5
    )
  `);

  await ensureColumn("tables", "table_number", "TEXT");
  await ensureColumn("tables", "qr_code", "TEXT");

  await ensureColumn("orders", "status", "TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn("orders", "total_price", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("orders", "created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("orders", "payment_status", "TEXT NOT NULL DEFAULT 'unpaid'");
  await ensureColumn("orders", "daily_ticket_number", "INTEGER");
  await ensureColumn("orders", "order_type", "TEXT NOT NULL DEFAULT 'DINE_IN'");
  await ensureColumn("orders", "customer_name", "TEXT");
  await ensureColumn("orders", "customer_phone", "TEXT");
  await ensureColumn("orders", "collection_time", "TEXT");
  await ensureColumn("orders", "delivery_address", "TEXT");
  await ensureColumn("orders", "vat_rate", "REAL NOT NULL DEFAULT 0.06");
  await ensureColumn("orders", "service_charge_rate", "REAL NOT NULL DEFAULT 0.10");
  await ensureColumn("orders", "customer_archived_at", "DATETIME");

  await ensureColumn("order_items", "price_at_order_time", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("order_items", "notes", "TEXT");
  await ensureColumn("order_items", "item_status", "TEXT NOT NULL DEFAULT 'queue'");
  await ensureColumn("order_items", "options_json", "TEXT");


  await ensureColumn("order_status_history", "order_id", "INTEGER NOT NULL");
  await ensureColumn("order_status_history", "status", "TEXT NOT NULL");
  await ensureColumn("order_status_history", "changed_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("order_status_history", "changed_by", "TEXT");

  await ensureColumn("archived_orders", "service_charge_rate", "REAL NOT NULL DEFAULT 0.10");
  await ensureColumn("archived_orders", "daily_ticket_number", "INTEGER");

  await ensureColumn("feedback_analysis_runs", "analysis_method", "TEXT NOT NULL DEFAULT 'rule_based'");

  await ensureColumn("inventory_items", "unit_cost", "REAL DEFAULT 0");
  await ensureColumn("inventory_items", "usage_unit", "TEXT");
  await ensureColumn("inventory_items", "usage_conversion", "REAL DEFAULT 1.0");

  // ── Global modifier library tables ────────────────────────────────────────
  /*
   * modifier_groups stores reusable modifier groups (e.g. "Size", "Ice Level",
   * "Add-ons") that are NOT tied to a specific menu item. Once created, they can
   * be assigned to any number of items via item_modifier_assignments.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS modifier_groups (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL UNIQUE,
      is_required       INTEGER NOT NULL DEFAULT 1,
      is_multi_select   INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /*
   * modifier_options contains the individual choices within a modifier_group.
   * price_delta is added to the item base price when this option is selected.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS modifier_options (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id     INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
      label        TEXT NOT NULL,
      price_delta  REAL NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0
    )
  `);

  /*
   * item_modifier_assignments is the junction table that links a menu item to
   * one or more modifier_groups. default_option_id can point to one option in
   * the group that should be pre-selected for this specific item.
   */
  await run(`
    CREATE TABLE IF NOT EXISTS item_modifier_assignments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id     INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
      default_option_id INTEGER REFERENCES modifier_options(id) ON DELETE SET NULL,
      UNIQUE (menu_item_id, modifier_group_id)
    )
  `);

  // ==========================================
  // PHASE 3: INDEX CREATION
  // ==========================================

  await ensureIndex("idx_menu_items_category_available", "menu_items", "category_id, is_available");
  await ensureIndex("idx_orders_table_status_created", "orders", "table_id, status, created_at");
  await ensureIndex("idx_orders_status_created", "orders", "status, created_at");
  await ensureIndex("idx_order_items_order", "order_items", "order_id");
  await ensureIndex("idx_order_items_menu_item", "order_items", "menu_item_id");
  await ensureIndex("idx_tables_qr_code", "tables", "qr_code");
  await ensureIndex("idx_payments_order", "payments", "order_id, payment_date DESC");
  await ensureIndex("idx_payment_logs_order", "payment_logs", "order_id, timestamp DESC");
  await ensureIndex("idx_archived_orders_date", "archived_orders", "archived_at DESC");
  await ensureIndex("idx_orders_payment_status", "orders", "payment_status, created_at DESC");
  await ensureIndex("idx_staff_assistance_today", "staff_assistance_requests", "requested_at DESC, archived_at, acknowledged_at");
  await ensureIndex("idx_customer_feedback_created", "customer_feedback", "created_at DESC");
  await ensureIndex("idx_customer_feedback_status", "customer_feedback", "status, created_at DESC");
  await ensureIndex("idx_feedback_findings_run", "feedback_analysis_findings", "run_id, status");
  await ensureIndex("idx_grand_archive_logs_category", "grand_archive_logs", "category, timestamp DESC");
  await ensureIndex("idx_employees_id", "employees", "employee_id");
  await ensureIndex("idx_item_option_groups_item", "item_option_groups", "menu_item_id");
  await ensureIndex("idx_item_options_group", "item_options", "group_id");
  await ensureIndex("idx_modifier_groups_name", "modifier_groups", "name");
  await ensureIndex("idx_modifier_options_group", "modifier_options", "group_id, sort_order");
  await ensureIndex("idx_item_modifier_assignments_item", "item_modifier_assignments", "menu_item_id");
  await ensureIndex("idx_item_modifier_assignments_group", "item_modifier_assignments", "modifier_group_id");


  // ==========================================
  // PHASE 4: LEGACY DATA MIGRATIONS & SEED PREPARATION
  // ==========================================

  /*
   * Legacy migration: early versions used a column called "name" on the tables
   * table. If that column still exists, copy its value into table_number before
   * the rest of the app tries to use table_number exclusively.
   */
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

  /* Make sure every table row has a valid QR code. */
  await run(`
    UPDATE tables
    SET qr_code = 'table-' || id
    WHERE qr_code IS NULL OR TRIM(qr_code) = ''
  `);

  /* Ensure the virtual 'Counter Orders' table exists for POS takeaway/pickup/delivery. */
  await run(`
    INSERT OR IGNORE INTO tables (id, table_number, qr_code)
    VALUES (999, 'Counter Order', 'counter-orders')
  `);

  /* Insert the default work hours setting if it has not been configured yet. */
  await run(`
    INSERT OR IGNORE INTO restaurant_settings (key, value)
    VALUES ('work_hours', '{"start": "09:00", "end": "22:00"}')
  `);

  /* Insert default SST and service charge settings if not yet configured. */
  await run(`INSERT OR IGNORE INTO restaurant_settings (key, value) VALUES ('sst_enabled', 'true')`);
  await run(`INSERT OR IGNORE INTO restaurant_settings (key, value) VALUES ('sst_rate', '0.06')`);
  await run(`INSERT OR IGNORE INTO restaurant_settings (key, value) VALUES ('service_charge_enabled', 'true')`);
  await run(`INSERT OR IGNORE INTO restaurant_settings (key, value) VALUES ('service_charge_rate', '0.10')`);
  await run(`INSERT OR IGNORE INTO restaurant_settings (key, value) VALUES ('captive_portal_target', 'http://10.42.0.1:5000/')`);

  console.log("Database schema ready");
};

module.exports = initializeDatabase;
