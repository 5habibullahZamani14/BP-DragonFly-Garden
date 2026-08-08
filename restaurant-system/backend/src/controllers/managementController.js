/*
 * managementController.js — Business logic for the manager dashboard.
 *
 * This is the largest controller in the backend. It handles six distinct
 * feature areas: activity logging, system settings, employee management,
 * inventory and recipe management, manager authentication, and password
 * reset by email.
 *
 * Key design decisions:
 *   - Manager credentials are stored in the restaurant_settings table under
 *     the key "manager_profile" as a JSON blob. This avoids a separate users
 *     table and keeps the profile editable through the dashboard without any
 *     schema migrations.
 *   - The DEFAULT_MANAGER object is used as a fallback before the manager
 *     has saved a custom profile. These defaults should be changed on first login.
 *   - The Resend email client is lazy-initialised (getResend) so a missing
 *     API key does not crash the server — the email feature simply becomes
 *     unavailable and returns a 503 with a clear message.
 *   - The sendResetEmail function always returns a success response regardless
 *     of whether the submitted email matches the registered one. This prevents
 *     email enumeration attacks.
 *   - The createLog helper is exported so controllers outside this file
 *     (e.g. tableController) can log to grand_archive_logs using the same
 *     interface without duplicating the INSERT statement.
 */

const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { exec: execCb } = require("child_process");
const exec = promisify(execCb);
const { listCloudBackups, downloadCloudBackup } = require("../services/cloudBackupService");
const {
  RESET_CONFIRMATION_SENTENCE,
  RESET_CONFIRMATION_CODE,
  getResetCategoryOptions,
  getResetCategoryByKey,
  normalizeResetCategoryKey,
} = require("../utils/dataReset");

const backupsDir = path.join(__dirname, "../../full-manual-backup");
const backendRoot = path.resolve(__dirname, "../../..");
const repoRoot = path.resolve(__dirname, "../../../..");
const frontendDir = path.join(repoRoot, "frontend");
const updateBranch = process.env.UPDATE_BRANCH || "main";
const tmpDir = path.join(__dirname, "../../tmp");
const versionFile = path.join(__dirname, "../../version.json");
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const sanitizeFilename = (filename) => {
  if (!filename || typeof filename !== "string") return "";
  return filename.replace(/[^a-zA-Z0-9_.-]/g, "");
};
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}
const dbPath = path.join(__dirname, "../database/database.sqlite");
const dbWalPath = dbPath + "-wal";
const dbShmPath = dbPath + "-shm";

/*
 * Resend is loaded lazily so that a missing RESEND_API_KEY in .env does not
 * crash the server at startup. The placeholder value check prevents the
 * library from being initialised with an obviously invalid key.
 */
let _resend = null;
const getResend = () => {
  if (!_resend && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "re_your_key_here") {
    const { Resend } = require("resend");
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
};

/*
 * DEFAULT_MANAGER is the fallback profile used before the manager has
 * configured their own credentials. The password should be changed on
 * first login via the Profile tab in the dashboard.
 */
const DEFAULT_MANAGER = { id: "admin", password: "", name: "Manager", email: "", phone: "" };

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

// Broadcast function for WebSocket events
let broadcastFn = null;
const setBroadcast = (fn) => { broadcastFn = fn; };
const getBroadcast = () => broadcastFn;

/*
 * generateEmployeeId creates a unique 4-character alphanumeric ID for a new
 * employee. The loop retries until a unique value is found, which in practice
 * always succeeds in one attempt given the small number of employees expected.
 */
const generateEmployeeId = async () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id;
  let isUnique = false;
  while (!isUnique) {
    id = "";
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await get("SELECT id FROM employees WHERE employee_id = ?", [id]);
    if (!existing) isUnique = true;
  }
  return id;
};

// ── Activity logging ──────────────────────────────────────────────────────────

/*
 * createLog inserts a row into grand_archive_logs. It is exported so other
 * controllers can write to the central audit log without importing db directly.
 */
const createLog = async (category, action, actorId, actorName, targetId, targetName, detailsObj) => {
  const details = detailsObj ? JSON.stringify(detailsObj) : null;
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_id, actor_name, target_id, target_name, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [category, action, actorId, actorName, targetId, targetName, details]
  );
};

const deriveEmployeeJwtRole = (department) => {
  const normalized = String(department || "").trim().toLowerCase();
  if (/payment|cashier|counter/.test(normalized)) return "payment_counter";
  return "payment_counter";
};

/* getFinanceData returns comprehensive financial data for the dashboard (P&L, Revenue, Cost of Goods Sold) */
const getFinanceData = async (req, res, next) => {
  try {
    const orders = await all("SELECT id, total_price, order_type, table_id, created_at FROM orders WHERE payment_status = 'paid' OR status = 'archived'");
    
    const items = await all(`
      SELECT 
        mi.id,
        mi.name,
        mi.price,
        mi.type,
        IFNULL(SUM(oi.quantity), 0) as total_sold
      FROM menu_items mi
      LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
      LEFT JOIN orders o ON oi.order_id = o.id AND (o.payment_status = 'paid' OR o.status = 'archived')
      GROUP BY mi.id
    `);

    const ingredientCosts = await all(`
      SELECT 
        m.menu_item_id, 
        SUM(m.quantity_required * i.unit_cost) as item_cost
      FROM menu_item_ingredients m
      JOIN inventory_items i ON m.inventory_item_id = i.id
      GROUP BY m.menu_item_id
    `);

    const itemsWithCosts = items.map(item => {
      const costRow = ingredientCosts.find(c => c.menu_item_id === item.id);
      const unitCost = costRow ? costRow.item_cost : 0;
      return {
        ...item,
        unit_cost: unitCost,
        profit_margin: item.price > 0 ? ((item.price - unitCost) / item.price) * 100 : 0
      };
    });

    const orderItems = await all(`
      SELECT 
        oi.order_id, 
        oi.menu_item_id, 
        oi.quantity, 
        oi.price_at_order_time, 
        mi.type, 
        o.created_at
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid' OR o.status = 'archived'
    `);

    const feedbacks = await all(`
      SELECT 
        rating_staff, 
        rating_app, 
        rating_cleanliness, 
        rating_food, 
        rating_atmosphere, 
        rating_value,
        created_at,
        order_id
      FROM customer_feedback
    `);

    const helpStats = await all(`
      SELECT 
        strftime('%w', requested_at) as day_of_week,
        COUNT(*) as count
      FROM staff_assistance_requests
      GROUP BY day_of_week
    `);

    const inventoryForecast = await all(`
      SELECT 
        ii.id,
        ii.name,
        ii.current_stock,
        ii.max_stock,
        ii.unit,
        ii.low_stock_threshold_percent,
        (
          SELECT GROUP_CONCAT(DISTINCT mi.type)
          FROM menu_item_ingredients mii
          JOIN menu_items mi ON mii.menu_item_id = mi.id
          WHERE mii.inventory_item_id = ii.id
        ) as linked_types,
        IFNULL(
          (
            SELECT SUM(oi.quantity * mii.quantity_required)
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN menu_item_ingredients mii ON oi.menu_item_id = mii.menu_item_id
            WHERE mii.inventory_item_id = ii.id
              AND (o.payment_status = 'paid' OR o.status = 'archived')
              AND o.created_at >= datetime('now', '-30 days')
          ),
          0
        ) as usage_30_days
      FROM inventory_items ii
    `);

    const inventoryForecastNormalized = inventoryForecast.map(ii => {
      const burnRatePerDay = ii.usage_30_days / 30;
      const daysRemaining = burnRatePerDay > 0 ? (ii.current_stock / burnRatePerDay) : null;
      return {
        id: ii.id,
        name: ii.name,
        current_stock: ii.current_stock,
        max_stock: ii.max_stock,
        unit: ii.unit,
        burn_rate_day: burnRatePerDay,
        days_remaining: daysRemaining !== null ? parseFloat(daysRemaining.toFixed(1)) : null,
        linked_types: ii.linked_types || ""
      };
    });

    const recipeIngredients = await all(`
      SELECT menu_item_id, inventory_item_id, quantity_required
      FROM menu_item_ingredients
    `);

    const helpRequests = await all("SELECT table_id, requested_at FROM staff_assistance_requests");

    res.json({
      orders,
      items: itemsWithCosts,
      order_items: orderItems,
      feedbacks: feedbacks,
      help_stats: helpStats,
      inventory_forecast: inventoryForecastNormalized,
      recipe_ingredients: recipeIngredients,
      help_requests: helpRequests
    });
  } catch (error) { next(error); }
};

/* getLogs returns audit log entries, optionally filtered by category. */
const getLogs = async (req, res, next) => {
  try {
    const { category, limit = 100 } = req.query;
    let query = "SELECT * FROM grand_archive_logs";
    const params = [];
    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }
    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(parseInt(limit));
    res.json(await all(query, params));
  } catch (error) { next(error); }
};

// ── System settings ───────────────────────────────────────────────────────────

/*
 * getSettings returns all settings as a plain object. Values stored as JSON
 * strings (like work_hours) are parsed automatically; plain strings are
 * returned as-is. The try/catch handles any values that are not valid JSON.
 */
const getSettings = async (req, res, next) => {
  try {
    const settings = await all("SELECT * FROM restaurant_settings");
    const result = {};
    settings.forEach((s) => {
      try { result[s.key] = JSON.parse(s.value); }
      catch (e) { result[s.key] = s.value; }
    });
    res.json(result);
  } catch (error) { next(error); }
};

const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await all(
      "SELECT key, value FROM restaurant_settings WHERE key IN (?, ?, ?, ?, ?)",
      ["work_hours", "sst_enabled", "sst_rate", "service_charge_enabled", "service_charge_rate"]
    );
    const result = {};
    settings.forEach((s) => {
      try { result[s.key] = JSON.parse(s.value); }
      catch (e) { result[s.key] = s.value; }
    });
    res.json(result);
  } catch (error) { next(error); }
};

/*
 * updateSetting uses SQLite's INSERT OR REPLACE (upsert) syntax to set a
 * setting value. Objects are serialised to JSON; primitives are stored as
 * strings. Every change is logged.
 */
const updateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    await run(
      "INSERT INTO restaurant_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, stringValue]
    );
    await createLog("SYSTEM", "UPDATE_SETTING", req.user?.id, req.user?.name, key, key, { value });
    
    // Emit WebSocket event for settings update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "SETTINGS_UPDATE", payload: { key } });
    }
    
    res.json({ success: true, key, value });
  } catch (error) { next(error); }
};

const deleteFileIfExists = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Failed to delete file:", filePath, error);
  }
};

const clearDirectoryContents = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) return;
  for (const entry of fs.readdirSync(directoryPath)) {
    const entryPath = path.join(directoryPath, entry);
    try {
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entryPath);
      }
    } catch (error) {
      console.error("Failed to clear directory entry:", entryPath, error);
    }
  }
};

const deleteMenuImageFileIfUnused = async (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith("/menu-images/")) return;
  const remaining = await get(
    "SELECT COUNT(*) AS count FROM menu_items WHERE image_url = ?",
    [imageUrl]
  );
  if (remaining?.count) return;
  const filePath = path.join(repoRoot, "frontend/public", imageUrl);
  deleteFileIfExists(filePath);
};

const deleteRepoImageFileIfUnused = async (repoImageId) => {
  if (!repoImageId) return;
  const remaining = await get(
    "SELECT COUNT(*) AS count FROM menu_items WHERE repo_image_id = ?",
    [repoImageId]
  );
  if (remaining?.count) return;

  const row = await get(
    "SELECT image_url FROM repo_images WHERE id = ?",
    [repoImageId]
  );
  if (!row || !row.image_url) return;

  const filePath = path.join(repoRoot, "frontend/public", row.image_url.replace(/^\//, ""));
  deleteFileIfExists(filePath);
  await run("DELETE FROM repo_images WHERE id = ?", [repoImageId]);
};

const getDataResetCategoryPayload = async (selectedKey) => {
  const category = getResetCategoryByKey(selectedKey);
  if (!category) return null;
  return category;
};

const getDataResetOptions = async (req, res, next) => {
  try {
    const options = getResetCategoryOptions();
    res.json({
      options,
      confirmationSentence: RESET_CONFIRMATION_SENTENCE,
      confirmationCode: RESET_CONFIRMATION_CODE,
    });
  } catch (error) {
    next(error);
  }
};

const performDataReset = async (req, res, next) => {
  try {
    const { category: rawCategory, confirmationSentence, confirmationCode, confirmationText } = req.body;
    const category = getResetCategoryByKey(rawCategory);
    if (!category) {
      return next(createHttpError(400, "Invalid reset category."));
    }

    if (category.key === "all_data") {
      if (String(confirmationSentence || "").trim() !== RESET_CONFIRMATION_SENTENCE) {
        return next(createHttpError(400, "Confirmation sentence does not match."));
      }
      if (String(confirmationCode || "").trim() !== RESET_CONFIRMATION_CODE) {
        return next(createHttpError(400, "Confirmation code does not match."));
      }
    } else {
      if (String(confirmationText || "").trim() !== category.label) {
        return next(createHttpError(400, "Please type the selected category label exactly to confirm."));
      }
    }

    const managerProfileRow = await get(
      "SELECT value FROM restaurant_settings WHERE key = 'manager_profile'"
    );
    const managerProfileValue = managerProfileRow?.value || null;

    const menuImagesDir = path.join(repoRoot, "frontend/public/menu-images");
    const feedbackImagesDir = path.join(repoRoot, "frontend/public/feedback-images");
    const uploadsDir = path.join(__dirname, "../../uploads");

    const deleteMenuImagesForType = async (type) => {
      const rows = await all(
        `SELECT DISTINCT image_url, repo_image_id FROM menu_items WHERE type = ? AND (image_url IS NOT NULL AND TRIM(image_url) <> '' OR repo_image_id IS NOT NULL)`,
        [type]
      );
      await run(`UPDATE menu_items SET image_url = NULL, repo_image_id = NULL WHERE type = ?`, [type]);
      for (const row of rows) {
        await deleteMenuImageFileIfUnused(row.image_url);
        await deleteRepoImageFileIfUnused(row.repo_image_id);
      }
    };

    const deleteRepoImagesForType = async (type) => {
      const rows = await all(
        `SELECT DISTINCT repo_image_id FROM menu_items WHERE type = ? AND repo_image_id IS NOT NULL`,
        [type]
      );
      await run(`UPDATE menu_items SET repo_image_id = NULL WHERE type = ?`, [type]);
      for (const row of rows) {
        await deleteRepoImageFileIfUnused(row.repo_image_id);
      }
    };

    const deleteMenuItemsByType = async (type) => {
      const rows = await all(
        `SELECT DISTINCT image_url, repo_image_id FROM menu_items WHERE type = ?`,
        [type]
      );
      await run(`DELETE FROM menu_items WHERE type = ?`, [type]);
      for (const row of rows) {
        await deleteMenuImageFileIfUnused(row.image_url);
        await deleteRepoImageFileIfUnused(row.repo_image_id);
      }
    };

    const deleteAllMenuImages = async () => {
      const imageRows = await all(`SELECT DISTINCT image_url FROM menu_items WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''`);
      const repoRows = await all(`SELECT id, image_url FROM repo_images`);
      await run(`UPDATE menu_items SET image_url = NULL, repo_image_id = NULL`);
      for (const row of imageRows) {
        await deleteMenuImageFileIfUnused(row.image_url);
      }
      for (const row of repoRows) {
        const filePath = path.join(repoRoot, "frontend/public", row.image_url.replace(/^\//, ""));
        deleteFileIfExists(filePath);
      }
      await run(`DELETE FROM repo_images`);
    };

    const deleteAllFeedbackImages = async () => {
      const rows = await all(`SELECT DISTINCT image_url FROM customer_feedback_images`);
      await run(`DELETE FROM customer_feedback_images`);
      for (const row of rows) {
        if (row.image_url && row.image_url.startsWith("/feedback-images/")) {
          const filePath = path.join(repoRoot, "frontend/public", row.image_url.replace(/^\//, ""));
          deleteFileIfExists(filePath);
        }
      }
    };

    const deleteAllFeedbackRecords = async () => {
      await run(`DELETE FROM customer_feedback`);
      await run(`DELETE FROM feedback_analysis_findings`);
      await run(`DELETE FROM feedback_analysis_runs`);
      clearDirectoryContents(feedbackImagesDir);
    };

    const deleteAllAppData = async () => {
      await run(`DELETE FROM order_items`);
      await run(`DELETE FROM orders`);
      await run(`DELETE FROM order_status_history`);
      await run(`DELETE FROM payments`);
      await run(`DELETE FROM payment_logs`);
      await run(`DELETE FROM archived_orders`);
      await run(`DELETE FROM staff_assistance_requests`);
      await run(`DELETE FROM customer_feedback_images`);
      await run(`DELETE FROM customer_feedback`);
      await run(`DELETE FROM feedback_analysis_findings`);
      await run(`DELETE FROM feedback_analysis_runs`);
      await run(`DELETE FROM menu_item_ingredients`);
      await run(`DELETE FROM menu_items`);
      await run(`DELETE FROM categories`);
      await run(`DELETE FROM inventory_items`);
      await run(`DELETE FROM employees`);
      await run(`DELETE FROM payment_methods`);
      await run(`DELETE FROM promo_items`); // defensive if future fallback table exists
      await run(`DELETE FROM restaurant_settings`);
      if (managerProfileValue) {
        await run(
          "INSERT INTO restaurant_settings (key, value) VALUES ('manager_profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [managerProfileValue]
        );
      }
      clearDirectoryContents(menuImagesDir);
      clearDirectoryContents(feedbackImagesDir);
      clearDirectoryContents(uploadsDir);
    };

    if (category.key === "all_data") {
      await deleteAllAppData();
    } else if (category.key === "foods") {
      await deleteMenuItemsByType("food");
    } else if (category.key === "drinks") {
      await deleteMenuItemsByType("drink");
    } else if (category.key === "food_images") {
      await deleteMenuImagesForType("food");
    } else if (category.key === "drink_images") {
      await deleteMenuImagesForType("drink");
    } else if (category.key === "menu_images") {
      await deleteAllMenuImages();
    } else if (category.key === "feedbacks") {
      await deleteAllFeedbackRecords();
    } else if (category.key === "feedback_images") {
      await deleteAllFeedbackImages();
    }

    await createLog(
      "SYSTEM",
      "DATA_RESET",
      req.user?.id,
      req.user?.name,
      category.key,
      category.label,
      { category: category.key }
    );

    res.json({ success: true, message: `Reset completed for ${category.label}` });
  } catch (error) {
    next(error);
  }
};

// ── Employee management ───────────────────────────────────────────────────────

/* getEmployees returns active employees by default; pass include_archived=true for all. */
const getEmployees = async (req, res, next) => {
  try {
    const { include_archived } = req.query;
    let query = "SELECT * FROM employees";
    if (include_archived !== "true") query += " WHERE is_archived = 0";
    query += " ORDER BY department, name";
    res.json(await all(query));
  } catch (error) { next(error); }
};

/* createEmployee generates a unique ID and inserts the new employee record. */
const createEmployee = async (req, res, next) => {
  try {
    const { name, department, salary, bonuses, shift_start, shift_end, employment_type, contact_info } = req.body;
    if (!name) return next(createHttpError(400, "Name is required"));

    const employee_id = await generateEmployeeId();
    const result = await run(
      `INSERT INTO employees (employee_id, name, department, salary, bonuses, shift_start, shift_end, employment_type, contact_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, name, department, salary || 0, bonuses || 0, shift_start, shift_end, employment_type, contact_info]
    );

    const employee = await get("SELECT * FROM employees WHERE id = ?", [result.lastID]);
    await createLog("EMPLOYEE", "CREATE", req.user?.id, req.user?.name, employee.employee_id, employee.name, employee);
    
    // Emit WebSocket event for employee update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "EMPLOYEE_UPDATE", payload: { id: result.lastID } });
    }
    
    res.status(201).json(employee);
  } catch (error) { next(error); }
};

/*
 * updateEmployee uses COALESCE so that any field not included in the request
 * body retains its current database value. Setting is_archived = 1 soft-deletes
 * the employee without removing their historical records from payment logs.
 */
const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, department, salary, bonuses, shift_start, shift_end, employment_type, contact_info, is_archived } = req.body;
    await run(
      `UPDATE employees SET
        name = COALESCE(?, name),
        department = COALESCE(?, department),
        salary = COALESCE(?, salary),
        bonuses = COALESCE(?, bonuses),
        shift_start = COALESCE(?, shift_start),
        shift_end = COALESCE(?, shift_end),
        employment_type = COALESCE(?, employment_type),
        contact_info = COALESCE(?, contact_info),
        is_archived = COALESCE(?, is_archived)
       WHERE id = ?`,
      [name, department, salary, bonuses, shift_start, shift_end, employment_type, contact_info, is_archived, id]
    );
    const employee = await get("SELECT * FROM employees WHERE id = ?", [id]);
    await createLog("EMPLOYEE", "UPDATE", req.user?.id, req.user?.name, employee.employee_id, employee.name, employee);
    
    // Emit WebSocket event for employee update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({ type: "EMPLOYEE_UPDATE", payload: { id } });
    }
    
    res.json(employee);
  } catch (error) { next(error); }
};

/*
 * verifyEmployee checks the employee ID and name.
 * It is a public verification endpoint so the cashier terminal does not require a manager token.
 */
const verifyEmployee = async (req, res, next) => {
  try {
    const { employee_id, name } = req.body;
    if (!employee_id || !name) {
      return res.status(400).json({ success: false, message: "Employee ID and Name are required" });
    }

    const employee = await get(
      "SELECT employee_id, name, department FROM employees WHERE UPPER(employee_id) = ? AND LOWER(name) = ? AND is_archived = 0",
      [employee_id.trim().toUpperCase(), name.trim().toLowerCase()]
    );

    if (employee) {
      if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET not configured. Refusing to issue employee auth token.");
        return res.status(500).json({ success: false, message: "Server misconfiguration: missing JWT secret" });
      }

      const role = deriveEmployeeJwtRole(employee.department);
      const sessionId = crypto.randomBytes(16).toString("hex");
      const token = jwt.sign(
        {
          role,
          id: employee.employee_id,
          name: employee.name,
          department: employee.department || null,
          sessionId,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      const sessionPayload = {
        sessionId,
        employee_id: employee.employee_id,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      await run(
        "INSERT INTO restaurant_settings (key, value) VALUES ('payment_counter_session', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [JSON.stringify(sessionPayload)]
      );

      res.json({
        success: true,
        employee: {
          id: employee.employee_id,
          name: employee.name,
          department: employee.department,
          role
        },
        token
      });
    } else {
      res.status(401).json({ success: false, message: "Invalid employee credentials" });
    }
  } catch (error) { next(error); }
};

// ── Inventory & recipes ───────────────────────────────────────────────────────

/* getInventory returns all active (non-archived) inventory items. */
const getInventory = async (req, res, next) => {
  try {
    res.json(await all("SELECT * FROM inventory_items WHERE is_archived = 0 ORDER BY category, name"));
  } catch (error) { next(error); }
};

/* createInventoryItem adds a new ingredient or supply to the stock list. */
const createInventoryItem = async (req, res, next) => {
  try {
    const { name, category, unit, current_stock, max_stock, low_stock_threshold_percent, usage_unit, usage_conversion } = req.body;
    if (!name || !unit) return next(createHttpError(400, "Name and unit are required"));

    const result = await run(
      `INSERT INTO inventory_items (
        name, category, unit, current_stock, max_stock, low_stock_threshold_percent,
        usage_unit, usage_conversion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, category, unit, current_stock || 0, max_stock || 100, low_stock_threshold_percent || 15,
        usage_unit || unit, usage_conversion || 1.0
      ]
    );
    const item = await get("SELECT * FROM inventory_items WHERE id = ?", [result.lastID]);
    await createLog("INVENTORY", "CREATE", req.user?.id, req.user?.name, item.id.toString(), item.name, item);
    res.status(201).json(item);
  } catch (error) { next(error); }
};

/*
 * updateInventoryStock adjusts stock levels and other item fields.
 * Uses COALESCE so only the provided fields are changed.
 */
const updateInventoryStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      name, category, unit, usage_unit, usage_conversion,
      current_stock, max_stock, low_stock_threshold_percent, is_archived 
    } = req.body;
    await run(
      `UPDATE inventory_items SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        unit = COALESCE(?, unit),
        usage_unit = COALESCE(?, usage_unit),
        usage_conversion = COALESCE(?, usage_conversion),
        current_stock = COALESCE(?, current_stock),
        max_stock = COALESCE(?, max_stock),
        low_stock_threshold_percent = COALESCE(?, low_stock_threshold_percent),
        is_archived = COALESCE(?, is_archived)
       WHERE id = ?`,
      [name, category, unit, usage_unit, usage_conversion, current_stock, max_stock, low_stock_threshold_percent, is_archived, id]
    );
    const item = await get("SELECT * FROM inventory_items WHERE id = ?", [id]);
    await createLog("INVENTORY", "UPDATE_STOCK", req.user?.id, req.user?.name, item.id.toString(), item.name, { current_stock });
    res.json(item);
  } catch (error) { next(error); }
};

/*
 * getRecipes returns all menu items with their ingredient lists. The JOIN
 * produces flat rows which I group into nested objects in JavaScript, as
 * SQLite does not support JSON aggregation natively.
 */
const getRecipes = async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT m.id as menu_item_id, m.name as menu_item_name,
             i.id as inventory_item_id, i.name as inventory_item_name, i.unit,
             mi.quantity_required
      FROM menu_items m
      LEFT JOIN menu_item_ingredients mi ON m.id = mi.menu_item_id
      LEFT JOIN inventory_items i ON mi.inventory_item_id = i.id
      ORDER BY m.id
    `);

    const recipes = {};
    rows.forEach((row) => {
      if (!recipes[row.menu_item_id]) {
        recipes[row.menu_item_id] = { id: row.menu_item_id, name: row.menu_item_name, ingredients: [] };
      }
      if (row.inventory_item_id) {
        recipes[row.menu_item_id].ingredients.push({
          id: row.inventory_item_id,
          name: row.inventory_item_name,
          unit: row.unit,
          quantity_required: row.quantity_required
        });
      }
    });

    res.json(Object.values(recipes));
  } catch (error) { next(error); }
};

/*
 * updateRecipe replaces the full ingredient list for a menu item in one
 * transaction: delete all existing ingredient rows, then insert the new ones.
 * A partial failure rolls back so the recipe is never left in a broken state.
 */
const updateRecipe = async (req, res, next) => {
  try {
    const { menu_item_id } = req.params;
    const { ingredients } = req.body;

    await run("BEGIN TRANSACTION");
    try {
      await run("DELETE FROM menu_item_ingredients WHERE menu_item_id = ?", [menu_item_id]);
      for (const ing of ingredients) {
        await run(
          "INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)",
          [menu_item_id, ing.inventory_item_id, ing.quantity_required]
        );
      }
      await run("COMMIT");
      const menuItem = await get("SELECT name FROM menu_items WHERE id = ?", [menu_item_id]);
      await createLog("RECIPE", "UPDATE", req.user?.id, req.user?.name, menu_item_id.toString(), menuItem?.name, { ingredients });
      res.json({ success: true, menu_item_id });
    } catch (err) {
      await run("ROLLBACK");
      throw err;
    }
  } catch (error) { next(error); }
};

// ── Manager auth & profile ────────────────────────────────────────────────────

/*
 * getManagerProfile reads the manager_profile setting and merges it with the
 * DEFAULT_MANAGER so missing fields always have sensible fallback values.
 */
const getManagerProfile = async () => {
  const row = await get("SELECT value FROM restaurant_settings WHERE key = 'manager_profile'");
  if (!row) return { ...DEFAULT_MANAGER };
  try { return { ...DEFAULT_MANAGER, ...JSON.parse(row.value) }; }
  catch { return { ...DEFAULT_MANAGER }; }
};

/* managerAuth validates the submitted ID and password against the stored profile. */
const managerAuth = async (req, res, next) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) return next(createHttpError(400, "ID and password are required"));
    const profile = await getManagerProfile();

    // Support migration from plaintext stored password -> bcrypt-hashed password.
    let passwordMatches = false;
    if (profile.password && profile.password.startsWith("$2")) {
      passwordMatches = await bcrypt.compare(password, profile.password);
    } else {
      // legacy plaintext match; if it matches, migrate to bcrypt
      passwordMatches = id === profile.id && password === profile.password;
      if (passwordMatches) {
        try {
          const hashed = await bcrypt.hash(password, 10);
          const migrated = { ...profile, password: hashed };
          await run(
            "INSERT INTO restaurant_settings (key, value) VALUES ('manager_profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [JSON.stringify(migrated)]
          );
          // update local profile variable so token issuance uses migrated data
          profile.password = hashed;
        } catch (mErr) {
          console.error("Failed to migrate manager password to hashed form:", mErr);
        }
      }
    }

    if (passwordMatches) {
      if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET not configured. Refusing to issue auth token.");
        return res.status(500).json({ success: false, message: "Server misconfiguration: missing JWT secret" });
      }
      const sessionId = crypto.randomBytes(16).toString("hex");
      const token = jwt.sign({ role: "manager", id: profile.id, sessionId }, process.env.JWT_SECRET, { expiresIn: "7d" });
      const sessionPayload = {
        sessionId,
        managerId: profile.id,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      await run(
        "INSERT INTO restaurant_settings (key, value) VALUES ('manager_session', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [JSON.stringify(sessionPayload)]
      );
      res.json({ success: true, name: profile.name, token });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) { next(error); }
};

/*
 * managerResetPassword accepts a reset token (issued by sendResetEmail) and a
 * new password. It verifies the token, hashes the new password, and stores the
 * updated manager_profile value in restaurant_settings.
 */
const managerResetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return next(createHttpError(400, "Token and newPassword are required"));
    if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, message: "Server misconfiguration: missing JWT secret" });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }
    if (!payload || payload.action !== 'reset_manager_password') return res.status(400).json({ success: false, message: "Invalid reset token" });
    const profile = await getManagerProfile();
    if (payload.id !== profile.id) return res.status(400).json({ success: false, message: "Invalid reset token" });
    if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    const hashed = await bcrypt.hash(newPassword, 10);
    const updated = { ...profile, password: hashed };
    await run(
      "INSERT INTO restaurant_settings (key, value) VALUES ('manager_profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [JSON.stringify(updated)]
    );
    await createLog("SYSTEM", "MANAGER_PASSWORD_RESET", "system", "System", "manager", profile.name, {});
    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) { next(error); }
};

/*
 * getManagerProfileRoute returns the profile without the password field.
 * The password must never be sent to the client.
 */
const getManagerProfileRoute = async (req, res, next) => {
  try {
    const profile = await getManagerProfile();
    const { password: _pw, ...safe } = profile;
    res.json(safe);
  } catch (error) { next(error); }
};

/*
 * updateManagerProfile merges only the provided fields into the current
 * profile. An empty string for password is ignored so the manager does not
 * accidentally clear their password by submitting the form with that field blank.
 */
const updateManagerProfile = async (req, res, next) => {
  try {
    const { name, id, password, email, phone } = req.body;
    const current = await getManagerProfile();
    const updated = {
      ...current,
      ...(name !== undefined && { name }),
      ...(id !== undefined && { id }),
      ...(password !== undefined && password !== "" && { password }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
    };
    await run(
      "INSERT INTO restaurant_settings (key, value) VALUES ('manager_profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [JSON.stringify(updated)]
    );
    await createLog("SYSTEM", "UPDATE_MANAGER_PROFILE", updated.id, updated.name, "manager", "Manager Profile", { name: updated.name, email: updated.email });
    const { password: _pw, ...safe } = updated;
    res.json({ success: true, profile: safe });
  } catch (error) { next(error); }
};

// ── Password reset email ──────────────────────────────────────────────────────

/*
 * sendResetEmail sends the manager's credentials to their registered email.
 * It always returns a success-style message regardless of whether the address
 * matches, to prevent an attacker from discovering which email is registered.
 */
const sendResetEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(createHttpError(400, "Email address is required"));

    const profile = await getManagerProfile();
    if (!profile.email || profile.email.toLowerCase() !== email.toLowerCase()) {
      return res.json({ success: true, message: "If that email is registered, a reset message has been sent." });
    }

    const resend = getResend();
    if (!resend) {
      return res.status(503).json({ success: false, message: "Email service not configured. Please set RESEND_API_KEY in the backend .env file." });
    }

    const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
    // Issue a short-lived reset token instead of emailing the password directly.
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not configured. Cannot issue reset token.");
      return res.status(500).json({ success: false, message: "Server misconfiguration: missing JWT secret" });
    }
    const resetToken = jwt.sign({ id: profile.id, action: 'reset_manager_password' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const resetUrl = `${process.env.RESET_BASE_URL || ''}/manager-reset?token=${resetToken}`;
    await resend.emails.send({
      from: `BP DragonFly Garden <${from}>`,
      to: profile.email,
      subject: "Reset your Manager password — BP DragonFly Garden",
      html: `
        <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fdf8f0; border-radius: 16px;">
          <h1 style="font-size: 22px; color: #2d4a22; margin-bottom: 8px;">BP DragonFly Garden 🌿</h1>
          <p style="color: #555; margin-bottom: 24px;">You requested a password reset for the manager dashboard. Click the link below to set a new password. This link expires in 60 minutes.</p>
          <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5ddd0;">
            <p style="margin: 0 0 8px;"><a href="${resetUrl}" style="color:#2d4a22;">Reset Manager Password</a></p>
          </div>
          <p style="margin-top: 24px; font-size: 13px; color: #999;">If you did not request this, please ignore this email.</p>
        </div>
      `
    });

    await createLog("SYSTEM", "PASSWORD_RESET_EMAIL_SENT", "system", "System", "manager", profile.name, { email: profile.email });
    res.json({ success: true, message: "If that email is registered, a reset message has been sent." });
  } catch (error) { next(error); }
};

// ── Backups ───────────────────────────────────────────────────────────────────

const getBackups = async (req, res, next) => {
  try {
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const files = fs.readdirSync(backupsDir)
      .filter(f => {
        // Only expose full archive backups (tar.gz or tar.gz.enc)
        return f.startsWith("full_backup_") || f.endsWith(".tar.gz") || f.endsWith(".tar.gz.enc");
      })
      .map(f => {
        const stats = fs.statSync(path.join(backupsDir, f));
        return {
          filename: f,
          size: stats.size,
          created_at: stats.mtime
        };
      })
      .sort((a, b) => b.created_at - a.created_at);
    res.json(files);
  } catch (error) { next(error); }
};

const createBackup = async (req, res, next) => {
  try {
    const { filename, overwrite } = req.body || {};
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

    // Create a comprehensive full backup archive (same as nightly/cloud backups)
    const { createLocalBackupOnly } = require("../services/cloudBackupService");

    // Ensure writes are checkpointed
    try { await run("PRAGMA wal_checkpoint(TRUNCATE)"); } catch (e) { /* continue */ }

    await createLocalBackupOnly(backupsDir);

    // Find the most recent full backup (could be .tar.gz or .tar.gz.enc)
    const candidates = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith("full_backup_") || f.endsWith(".tar.gz") || f.endsWith(".tar.gz.enc"))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (candidates.length === 0) {
      return next(createHttpError(500, "Failed to create backup"));
    }

    let created = candidates[0].name;

    // If user supplied a filename, rename the created archive to that name (preserve .enc suffix if present)
    if (filename && filename.trim()) {
      let base = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
      if (!base) base = `manual_${Date.now()}`;

      const src = path.join(backupsDir, created);
      const hasEnc = created.endsWith('.enc');
      const ext = hasEnc ? '.tar.gz.enc' : '.tar.gz';
      let finalName = base;
      if (!finalName.endsWith(ext)) finalName = `${finalName}${ext}`;
      const dest = path.join(backupsDir, finalName);

      if (fs.existsSync(dest) && !overwrite) {
        return res.status(409).json({ success: false, message: "A backup with this name already exists." });
      }

      fs.renameSync(src, dest);
      created = finalName;
    }

    await createLog("SYSTEM", "CREATE_BACKUP", req.user?.id, req.user?.name, "system", "Backup Archive", { filename: created });
    res.json({ success: true, message: "Full backup archive created successfully", filename: created });
  } catch (error) { next(error); }
};

const extractAndRestoreTar = async (tarPath) => {
  const { spawnSync } = require("child_process");
  const targetExtractDir = path.join(tmpDir, `restore-extract-${Date.now()}`);
  if (!fs.existsSync(targetExtractDir)) {
    fs.mkdirSync(targetExtractDir, { recursive: true });
  }

  const tarArgs = ["-xzf", tarPath, "-C", targetExtractDir];
  const tarResult = spawnSync("tar", tarArgs);
  if (tarResult.error) {
    throw tarResult.error;
  }
  if (tarResult.status !== 0) {
    throw new Error(`tar extraction failed with code ${tarResult.status}`);
  }

  const findInDir = (dir, nameToFind, isDirGoal = false) => {
    if (!fs.existsSync(dir)) return null;
    const queue = [dir];
    while (queue.length > 0) {
      const current = queue.shift();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.name === nameToFind) {
          if (isDirGoal && entry.isDirectory()) return fullPath;
          if (!isDirGoal && entry.isFile()) return fullPath;
        }
        if (entry.isDirectory()) {
          queue.push(fullPath);
        }
      }
    }
    return null;
  };

  const globCopy = (srcDir, destDir) => {
    if (!fs.existsSync(srcDir)) return;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        globCopy(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };

  const extDbPath = findInDir(targetExtractDir, "database.sqlite", false);
  if (extDbPath) {
    fs.copyFileSync(extDbPath, dbPath);
    console.log(`[Restore] Successfully restored database.sqlite`);
  }

  const extEnv = findInDir(targetExtractDir, ".env", false);
  if (extEnv) {
    const destEnv = path.join(__dirname, "../../.env");
    fs.copyFileSync(extEnv, destEnv);
    console.log(`[Restore] Successfully restored .env`);
  }
  const extEnvLocal = findInDir(targetExtractDir, ".env.local", false);
  if (extEnvLocal) {
    const destEnvLocal = path.join(__dirname, "../../.env.local");
    fs.copyFileSync(extEnvLocal, destEnvLocal);
    console.log(`[Restore] Successfully restored .env.local`);
  }

  const extMenuImages = findInDir(targetExtractDir, "menu-images", true);
  if (extMenuImages) {
    const destMenuImages = path.resolve(__dirname, "../../../frontend/public/menu-images");
    globCopy(extMenuImages, destMenuImages);
    console.log(`[Restore] Successfully restored menu-images`);
  }

  const extFeedbackImages = findInDir(targetExtractDir, "feedback-images", true);
  if (extFeedbackImages) {
    const destFeedbackImages = path.resolve(__dirname, "../../../frontend/public/feedback-images");
    globCopy(extFeedbackImages, destFeedbackImages);
    console.log(`[Restore] Successfully restored feedback-images`);
  }

  const extUploads = findInDir(targetExtractDir, "uploads", true);
  if (extUploads) {
    const destUploads = path.resolve(__dirname, "../../uploads");
    globCopy(extUploads, destUploads);
    console.log(`[Restore] Successfully restored uploads`);
  }

  try {
    fs.rmSync(targetExtractDir, { recursive: true, force: true });
  } catch (e) {}
};

const performRestore = async (filePath, originalFilename) => {
  // Ensure pending writes are checkpointed before closing
  await run("PRAGMA wal_checkpoint(TRUNCATE)");

  // Make a safe backup of the current DB in case we need to roll back
  const timestamp = Date.now();
  const backupPath = `${dbPath}.bak.${timestamp}`;
  try {
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
  } catch (e) {
    console.warn("[Restore] Failed to create DB backup, continuing:", e);
  }

  // Close the shared DB connection before replacing the file
  try {
    const dbModule = require("../database/db");
    if (dbModule && typeof dbModule.close === "function") {
      await dbModule.close();
      console.log("[Restore] Closed DB connection for safe restore");
    }
  } catch (e) {
    console.warn("[Restore] Error closing DB module:", e);
  }

  let restoredDb = false;
  try {
    if (originalFilename.endsWith(".tar.gz.enc") || originalFilename.endsWith(".enc")) {
      const encKey = process.env.BACKUP_ENC_KEY || null;
      if (!encKey) {
        throw new Error("BACKUP_ENC_KEY not configured; cannot decrypt backup.");
      }
      const decTarPath = path.join(tmpDir, `decrypted-tar-${Date.now()}.tar.gz`);
      const { decryptFile } = require("../services/cloudBackupService");
      decryptFile(filePath, decTarPath, encKey);
      await extractAndRestoreTar(decTarPath);
      try { fs.unlinkSync(decTarPath); } catch (e) {}
      restoredDb = true;
    } else if (originalFilename.endsWith(".tar.gz")) {
      await extractAndRestoreTar(filePath);
      restoredDb = true;
    } else {
      // For a plain .sqlite file, atomically copy into place
      const tmpTarget = `${dbPath}.tmp.${timestamp}`;
      fs.copyFileSync(filePath, tmpTarget);
      fs.renameSync(tmpTarget, dbPath);
      restoredDb = true;
    }

    // If DB restored, validate integrity before continuing
    if (restoredDb) {
      // Open a temporary connection to run integrity_check
      const sqlite3 = require("sqlite3").verbose();
      await new Promise((resolve, reject) => {
        const tempDb = new sqlite3.Database(dbPath, (err) => {
          if (err) return reject(err);
          tempDb.get("PRAGMA integrity_check;", (pcErr, row) => {
            if (pcErr) {
              tempDb.close(() => {});
              return reject(pcErr);
            }
            const res = row ? Object.values(row)[0] : null;
            tempDb.close(() => {
              if (res !== "ok") return reject(new Error(`Integrity check failed: ${res}`));
              return resolve(true);
            });
          });
        });
      });

      console.log("[Restore] Restored DB integrity_check OK");
    }
  } catch (e) {
    // Attempt rollback
    console.error("[Restore] Error during restore, attempting rollback:", e);
    try {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, dbPath);
        console.log("[Restore] Rolled back to previous DB from backup");
      }
    } catch (rbErr) {
      console.error("[Restore] Failed to rollback DB:", rbErr);
    }
    // Reopen DB so application continues running with original DB
    try {
      const dbModule = require("../database/db");
      if (dbModule && typeof dbModule.open === "function") await dbModule.open();
    } catch (openErr) {
      console.error("[Restore] Failed to reopen DB after rollback:", openErr);
    }
    throw e;
  }

  // Remove WAL/SHM from restored DB if present
  if (fs.existsSync(dbWalPath)) {
    try { fs.unlinkSync(dbWalPath); } catch (e) {}
  }
  if (fs.existsSync(dbShmPath)) {
    try { fs.unlinkSync(dbShmPath); } catch (e) {}
  }

  // Reopen main DB connection for the running app
  try {
    const dbModule = require("../database/db");
    if (dbModule && typeof dbModule.open === "function") await dbModule.open();
    console.log("[Restore] Reopened DB connection after restore");
  } catch (e) {
    console.error("[Restore] Failed to reopen DB after restore:", e);
    throw e;
  }
};

const restoreBackup = async (req, res, next) => {
  try {
    const { filename } = req.body;
    if (!filename) return next(createHttpError(400, "Filename is required"));
    
    const finalName = sanitizeFilename(filename);
    const sourcePath = path.join(backupsDir, finalName);
    
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, message: "Backup file not found" });
    }
    
    await performRestore(sourcePath, finalName);
    
    await createLog("SYSTEM", "RESTORE_BACKUP", req.user?.id, req.user?.name, "system", "Database", { filename: finalName });
    res.json({ success: true, message: "System restored successfully from backup" });
  } catch (error) { next(error); }
};

const getCloudBackups = async (req, res, next) => {
  try {
    const backups = await listCloudBackups();
    res.json(backups);
  } catch (error) {
    next(error);
  }
};

const restoreCloudBackup = async (req, res, next) => {
  try {
    const { filename } = req.body;
    if (!filename) return next(createHttpError(400, "Filename is required"));

    const finalName = sanitizeFilename(filename);
    if (!finalName) return next(createHttpError(400, "Invalid filename"));

    const tempPath = path.join(tmpDir, `cloud-restore-${Date.now()}-${finalName}`);
    await downloadCloudBackup(finalName, tempPath);

    await performRestore(tempPath, finalName);
    
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    await createLog("SYSTEM", "RESTORE_CLOUD_BACKUP", req.user?.id, req.user?.name, "system", "Database", { filename: finalName });
    res.json({ success: true, message: "System restored successfully from cloud backup" });
  } catch (error) { next(error); }
};

const restoreUploadedBackup = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return next(createHttpError(400, "Backup file is required"));
    
    // Only accept full archive backups via upload (.tar.gz, .tar.gz.enc, .enc)
    const isSupported = file.originalname.endsWith(".tar.gz") || file.originalname.endsWith(".tar.gz.enc") || file.originalname.endsWith(".enc");
    if (!isSupported) {
      fs.unlinkSync(file.path);
      return next(createHttpError(400, "Uploaded file must be a full backup archive (.tar.gz or .tar.gz.enc)"));
    }

    await performRestore(file.path, file.originalname);
    
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    await createLog("SYSTEM", "RESTORE_UPLOADED_BACKUP", req.user?.id, req.user?.name, "system", "Database", { filename: file.originalname });
    res.json({ success: true, message: "System restored successfully from uploaded backup" });
  } catch (error) { next(error); }
};

const downloadBackup = async (req, res, next) => {
  try {
    const { filename } = req.query;
    if (!filename) return next(createHttpError(400, "Filename is required"));
    const finalName = sanitizeFilename(String(filename));
    const sourcePath = path.join(backupsDir, finalName);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, message: "Backup file not found" });
    }
    res.download(sourcePath, finalName);
  } catch (error) { next(error); }
};

// ── System Updates ────────────────────────────────────────────────────────────

/**
 * Read version from version.json file
 */
const readVersion = () => {
  try {
    if (fs.existsSync(versionFile)) {
      const data = fs.readFileSync(versionFile, "utf8");
      return JSON.parse(data);
    }
    // Return default version if file doesn't exist
    return { major: 1, minor: 0, patch: 0, build: 0, beta: true };
  } catch (error) {
    console.error("Error reading version file:", error);
    return { major: 1, minor: 0, patch: 0, build: 0, beta: true };
  }
};

/**
 * Write version to version.json file
 */
const writeVersion = (version) => {
  try {
    fs.writeFileSync(versionFile, JSON.stringify(version, null, 2));
  } catch (error) {
    console.error("Error writing version file:", error);
    throw error;
  }
};

/**
 * Format version object to string (e.g., "v1.2.3.4 Beta")
 */
const formatVersion = (version) => {
  const versionStr = `v${version.major}.${version.minor}.${version.patch}.${version.build}`;
  return version.beta ? `${versionStr} Beta` : versionStr;
};

/**
 * Increment version based on update impact
 * impact: 'major' | 'minor' | 'patch' | 'build'
 */
const incrementVersion = (impact = 'build') => {
  const version = readVersion();
  switch (impact) {
    case 'major':
      version.major++;
      version.minor = 0;
      version.patch = 0;
      version.build = 0;
      break;
    case 'minor':
      version.minor++;
      version.patch = 0;
      version.build = 0;
      break;
    case 'patch':
      version.patch++;
      version.build = 0;
      break;
    case 'build':
    default:
      version.build++;
      break;
  }
  writeVersion(version);
  return version;
};

/**
 * GET current version from version.json
 * Returns formatted version string and update status
 */
const checkSystemVersion = async (req, res, next) => {
  try {
    const version = readVersion();
    const formattedVersion = formatVersion(version);

    // Fetch latest from remote to check if update is available
    let needs_update = false;
    try {
      await exec("git fetch origin", { cwd: repoRoot });

      // Get current HEAD
      const { stdout: currentOutput } = await exec("git rev-parse HEAD", { cwd: repoRoot });
      const current_commit = currentOutput.toString().trim();

      // Get latest from origin/main
      const { stdout: latestOutput } = await exec("git rev-parse origin/main", { cwd: repoRoot });
      const latest_commit = latestOutput.toString().trim();

      needs_update = current_commit !== latest_commit;
    } catch (e) {
      // Git operations failed, but we can still return current version
      console.error("Git check failed:", e);
    }

    // Log the check
    await createLog("SYSTEM", "VERSION_CHECK", "admin", "manager", null, null, {
      version: formattedVersion,
      needs_update,
    });

    res.json({
      version: formattedVersion,
      version_details: version,
      needs_update,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Perform system update:
 * 1. Pull latest from GitHub
 * 2. Install/update backend dependencies
 * 3. Build frontend
 * 4. Increment version
 * 5. Optionally restart services
 */
const performSystemUpdate = async (req, res, next) => {
  try {
    const logs = [];
    const logFn = (msg) => {
      logs.push(msg);
      console.log(`[UPDATE] ${msg}`);
    };

    try {
      // Get update impact from request body (default to 'build')
      const { impact = 'build' } = req.body;

      // Step 1: Fetch and pull
      logFn("Fetching latest from GitHub...");
      await exec("git fetch origin", { cwd: repoRoot });

      logFn("Resetting to latest main...");
      await exec("git reset --hard origin/main", { cwd: repoRoot });

      // Step 2: Install backend deps
      logFn("Installing backend dependencies...");
      const backendPackageJson = path.join(repoRoot, "restaurant-system/backend/package.json");
      if (fs.existsSync(backendPackageJson)) {
        await exec("npm install", { cwd: path.join(repoRoot, "restaurant-system/backend"), timeout: 300000 });
      }

      // Step 3: Build frontend
      logFn("Installing frontend dependencies...");
      const frontendPackageJson = path.join(repoRoot, "frontend/package.json");
      if (fs.existsSync(frontendPackageJson)) {
        await exec("npm install", { cwd: frontendDir, timeout: 300000 });

        logFn("Building frontend...");
        const buildResult = await exec("npx vite build", { cwd: frontendDir, timeout: 600000 });

        // Check if build succeeded
        if (buildResult.stderr && buildResult.stderr.includes("error")) {
          throw new Error(`Frontend build had errors: ${buildResult.stderr}`);
        }
      }

      // Step 4: Increment version
      logFn("Incrementing version...");
      const newVersion = incrementVersion(impact);
      const formattedVersion = formatVersion(newVersion);
      logFn(`New version: ${formattedVersion}`);

      logFn("Update completed successfully!");

      // Log the successful update
      await createLog("SYSTEM", "UPDATE_SUCCESS", "admin", "manager", null, null, {
        version: formattedVersion,
        impact,
        logs: logs.join("\n"),
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "System updated successfully! Please reload the page.",
        version: formattedVersion,
        logs: logs.join("\n"),
      });
    } catch (error) {
      logFn(`ERROR: ${error.message}`);

      // Log the failed update
      await createLog("SYSTEM", "UPDATE_FAILED", "admin", "manager", null, null, {
        error: error.message,
        logs: logs.join("\n"),
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        message: `Update failed: ${error.message}`,
        logs: logs.join("\n"),
      });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createLog,
  getLogs,
  getFinanceData,
  getSettings,
  getPublicSettings,
  updateSetting,
  getEmployees,
  createEmployee,
  updateEmployee,
  verifyEmployee,
  getInventory,
  createInventoryItem,
  updateInventoryStock,
  getRecipes,
  updateRecipe,
  managerAuth,
  getManagerProfileRoute,
  updateManagerProfile,
  managerResetPassword,
  sendResetEmail,
  getDataResetOptions,
  performDataReset,
  getBackups,
  createBackup,
  restoreBackup,
  getCloudBackups,
  restoreCloudBackup,
  restoreUploadedBackup,
  downloadBackup,
  checkSystemVersion,
  performSystemUpdate,
  setBroadcast,
};
