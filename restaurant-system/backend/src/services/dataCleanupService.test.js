const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3").verbose();
const { DataCleanupError, createDataCleanupService } = require("./dataCleanupService");

let database;
let service;

const execute = (sql, params = []) => new Promise((resolve, reject) => {
  database.run(sql, params, function onComplete(error) {
    if (error) return reject(error);
    resolve(this);
  });
});

const fetchAll = (sql, params = []) => new Promise((resolve, reject) => {
  database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const fetchOne = (sql, params = []) => new Promise((resolve, reject) => {
  database.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

test.beforeEach(async () => {
  database = new sqlite3.Database(":memory:");
  await new Promise((resolve, reject) => database.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE menu_items (
      id INTEGER PRIMARY KEY, name TEXT, description TEXT, category_id INTEGER,
      is_available INTEGER, type TEXT, image_url TEXT, pattern_id INTEGER, repo_image_id INTEGER
    );
    CREATE TABLE order_items (id INTEGER PRIMARY KEY, menu_item_id INTEGER);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE payments (id INTEGER PRIMARY KEY, payment_method_id INTEGER);
    CREATE TABLE customer_feedback (
      id INTEGER PRIMARY KEY, sender_name TEXT, sender_email TEXT, comment TEXT,
      table_number TEXT, status TEXT, rating_app INTEGER, created_at TEXT
    );
    CREATE TABLE customer_feedback_images (id INTEGER PRIMARY KEY, feedback_id INTEGER, image_url TEXT);
    CREATE TABLE customer_feedback_access_entries (id INTEGER PRIMARY KEY, session_id TEXT, feedback_id INTEGER);
    CREATE TABLE customer_feedback_access_sessions (id TEXT PRIMARY KEY, expires_at INTEGER);
    CREATE TABLE tables (id INTEGER PRIMARY KEY, table_number TEXT NOT NULL, qr_code TEXT);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, table_id INTEGER);
    CREATE TABLE patterns (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT, image_url TEXT);
    CREATE TABLE repo_images (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT, image_url TEXT);
    CREATE TABLE image_repository_sections (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    CREATE TABLE modifier_groups (id INTEGER PRIMARY KEY, name TEXT, is_required INTEGER, is_multi_select INTEGER, created_at TEXT);
    CREATE TABLE modifier_options (id INTEGER PRIMARY KEY, group_id INTEGER, label TEXT, price_delta REAL);
    CREATE TABLE item_modifier_assignments (id INTEGER PRIMARY KEY, modifier_group_id INTEGER, default_option_id INTEGER);
    CREATE TABLE restaurant_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `, (error) => error ? reject(error) : resolve()));
  service = createDataCleanupService({
    all: fetchAll,
    get: fetchOne,
    run: execute,
    publicDir: os.tmpdir(),
  });
});

test.afterEach(async () => {
  if (database) {
    await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    database = null;
  }
});

test("category-name filtering supports punctuation and returns only matching menu items", async () => {
  await execute("INSERT INTO categories (id, name) VALUES (1, ?), (2, ?)", ["Drinks & Treats", "Food"]);
  await execute("INSERT INTO menu_items (id, name, category_id, type, is_available) VALUES (1, 'Tea', 1, 'drink', 1), (2, 'Soup', 2, 'food', 1)");

  const result = await service.getRows("menu_items", { category: "Drinks & Treats" });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].label, "Tea");
});

test("date filters are rejected for categories without a date field", async () => {
  await assert.rejects(
    service.getRows("menu_items", { from: "2026-01-01" }),
    (error) => error instanceof DataCleanupError && /not available/.test(error.message)
  );
});

test("all-matching deletion refuses a stale reviewed count without deleting records", async () => {
  await execute("INSERT INTO customer_feedback (id, sender_name, comment, status, rating_app, created_at) VALUES (1, 'Guest', 'Good', 'active', 5, '2026-01-01')");

  await assert.rejects(
    service.deleteRecords({ dataset: "feedback", filters: {}, allMatching: true, expectedCount: 2 }),
    (error) => error instanceof DataCleanupError && error.status === 409
  );
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM customer_feedback")).count, 1);
});

test("all-matching deletion honors excluded records without dropping the remaining selection", async () => {
  await execute("INSERT INTO customer_feedback (id, sender_name, comment, status, rating_app, created_at) VALUES (1, 'Guest', 'One', 'active', 5, '2026-01-01'), (2, 'Guest', 'Two', 'active', 5, '2026-01-01'), (3, 'Guest', 'Three', 'active', 5, '2026-01-01')");

  const result = await service.deleteRecords({
    dataset: "feedback",
    filters: {},
    allMatching: true,
    excludedIds: ["2"],
    expectedCount: 2,
  });

  assert.equal(result.deleted, 2);
  assert.deepEqual((await fetchAll("SELECT id FROM customer_feedback ORDER BY id")).map((row) => row.id), [2]);
});

test("all-matching deletion supports the 8,292-record selection shown in the manager UI", async () => {
  await execute(`
    WITH RECURSIVE ids(id) AS (
      SELECT 1
      UNION ALL SELECT id + 1 FROM ids WHERE id < 8292
    )
    INSERT INTO customer_feedback (id, sender_name, comment, status, rating_app, created_at)
    SELECT id, 'Guest', 'Feedback', 'active', 5, '2026-01-01' FROM ids
  `);

  const result = await service.deleteRecords({
    dataset: "feedback",
    filters: {},
    allMatching: true,
    expectedCount: 8292,
  });

  assert.equal(result.deleted, 8292);
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM customer_feedback")).count, 0);
});

test("a failed audit write rolls the entire deletion transaction back", async () => {
  await execute("INSERT INTO customer_feedback (id, sender_name, comment, status, rating_app, created_at) VALUES (1, 'Guest', 'Good', 'active', 5, '2026-01-01')");

  await assert.rejects(
    service.deleteRecords({
      dataset: "feedback",
      ids: ["1"],
      audit: async () => { throw new Error("audit unavailable"); },
    }),
    /audit unavailable/
  );
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM customer_feedback")).count, 1);
  assert.equal(await fetchOne("SELECT value FROM restaurant_settings WHERE key = 'seed_data_locked'"), undefined);
});

test("default payment methods cannot be deleted", async () => {
  await execute("INSERT INTO payment_methods (id, name) VALUES (1, 'Cash')");

  await assert.rejects(
    service.deleteRecords({ dataset: "payment_methods", ids: ["1"] }),
    (error) => error instanceof DataCleanupError && error.status === 409
  );
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM payment_methods")).count, 1);
});

test("categories containing menu items cannot be deleted", async () => {
  await execute("INSERT INTO categories (id, name) VALUES (1, 'Food')");
  await execute("INSERT INTO menu_items (id, name, category_id) VALUES (1, 'Soup', 1)");

  await assert.rejects(
    service.deleteRecords({ dataset: "categories", ids: ["1"] }),
    (error) => error instanceof DataCleanupError && error.status === 409
  );
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM categories")).count, 1);
});

test("system ordering tables are hidden from cleanup results and cannot be selected for deletion", async () => {
  await execute("INSERT INTO tables (id, table_number) VALUES (999, 'Takeaway'), (7, 'Table 7'), (8, 'Counter Order'), (9, 'R4M')");

  const preview = await service.getRows("tables");
  assert.equal(preview.total, 1);
  assert.equal(preview.rows[0].id, "7");
  assert.equal(preview.rows[0].label, "Table 7");

  await assert.rejects(
    service.deleteRecords({ dataset: "tables", ids: ["999"] }),
    (error) => error instanceof DataCleanupError && error.status === 409
  );
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM tables WHERE id = 999")).count, 1);

  await assert.rejects(
    service.deleteRecords({ dataset: "tables", ids: ["9"] }),
    (error) => error instanceof DataCleanupError && error.status === 409
  );
  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM tables WHERE id = 9")).count, 1);
});

test("deleting a shared modifier choice clears its menu-item default", async () => {
  await execute("INSERT INTO modifier_groups (id, name) VALUES (1, 'Milk')");
  await execute("INSERT INTO modifier_options (id, group_id, label, price_delta) VALUES (2, 1, 'Oat', 1.5)");
  await execute("INSERT INTO item_modifier_assignments (id, modifier_group_id, default_option_id) VALUES (3, 1, 2)");

  await service.deleteRecords({ dataset: "modifier_options", ids: ["2"] });

  assert.equal((await fetchOne("SELECT COUNT(*) AS count FROM modifier_options")).count, 0);
  assert.equal((await fetchOne("SELECT default_option_id FROM item_modifier_assignments WHERE id = 3")).default_option_id, null);
});

test("deleting feedback photos removes only an unused generated feedback upload", async (t) => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "garden-data-cleanup-"));
  const feedbackDir = path.join(publicDir, "feedback-images");
  fs.mkdirSync(feedbackDir, { recursive: true });
  const generatedImage = path.join(feedbackDir, "fb-test.jpg");
  const unrelatedImage = path.join(feedbackDir, "logo.png");
  fs.writeFileSync(generatedImage, "generated test upload");
  fs.writeFileSync(unrelatedImage, "unrelated test file");
  t.after(() => fs.rmSync(publicDir, { recursive: true, force: true }));
  service = createDataCleanupService({ all: fetchAll, get: fetchOne, run: execute, publicDir });

  await execute("INSERT INTO customer_feedback (id, sender_name, comment, status, rating_app, created_at) VALUES (1, 'Guest', 'Photo', 'active', 5, '2026-01-01')");
  await execute("INSERT INTO customer_feedback_images (id, feedback_id, image_url) VALUES (1, 1, '/feedback-images/fb-test.jpg')");
  await service.deleteRecords({ dataset: "feedback_images", ids: ["1"] });

  assert.equal(fs.existsSync(generatedImage), false);
  assert.equal(fs.existsSync(unrelatedImage), true);
});
