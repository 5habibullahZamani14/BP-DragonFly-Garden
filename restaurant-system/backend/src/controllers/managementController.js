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
const DEFAULT_MANAGER = { id: "admin", password: "manager", name: "Manager", email: "", phone: "" };
const DEFAULT_KITCHEN_PASSCODE = "kitchen2024";

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
    res.json({ success: true, key, value });
  } catch (error) { next(error); }
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
    res.json(employee);
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
    const { name, category, unit, current_stock, max_stock, low_stock_threshold_percent } = req.body;
    if (!name || !unit) return next(createHttpError(400, "Name and unit are required"));

    const result = await run(
      `INSERT INTO inventory_items (name, category, unit, current_stock, max_stock, low_stock_threshold_percent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, category, unit, current_stock || 0, max_stock || 100, low_stock_threshold_percent || 15]
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
    const { current_stock, max_stock, low_stock_threshold_percent, is_archived } = req.body;
    await run(
      `UPDATE inventory_items SET
        current_stock = COALESCE(?, current_stock),
        max_stock = COALESCE(?, max_stock),
        low_stock_threshold_percent = COALESCE(?, low_stock_threshold_percent),
        is_archived = COALESCE(?, is_archived)
       WHERE id = ?`,
      [current_stock, max_stock, low_stock_threshold_percent, is_archived, id]
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
    if (id === profile.id && password === profile.password) {
      res.json({ success: true, name: profile.name });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
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

// ── Kitchen passcode ──────────────────────────────────────────────────────────

/* getKitchenPasscode returns the current kitchen PIN from settings, or the default. */
const getKitchenPasscode = async (req, res, next) => {
  try {
    const row = await get("SELECT value FROM restaurant_settings WHERE key = 'kitchen_passcode'");
    res.json({ passcode: row ? row.value : DEFAULT_KITCHEN_PASSCODE });
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
    await resend.emails.send({
      from: `BP DragonFly Garden <${from}>`,
      to: profile.email,
      subject: "Your Manager Login Credentials — BP DragonFly Garden",
      html: `
        <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fdf8f0; border-radius: 16px;">
          <h1 style="font-size: 22px; color: #2d4a22; margin-bottom: 8px;">BP DragonFly Garden 🌿</h1>
          <p style="color: #555; margin-bottom: 24px;">You requested your manager login credentials. Here they are:</p>
          <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5ddd0;">
            <p style="margin: 0 0 8px;"><strong>Manager ID:</strong> <code style="background:#f4f0ea;padding:2px 8px;border-radius:6px;">${profile.id}</code></p>
            <p style="margin: 0;"><strong>Password:</strong> <code style="background:#f4f0ea;padding:2px 8px;border-radius:6px;">${profile.password}</code></p>
          </div>
          <p style="margin-top: 24px; font-size: 13px; color: #999;">If you did not request this, please ignore this email. Your credentials have not been changed.</p>
        </div>
      `
    });

    await createLog("SYSTEM", "PASSWORD_RESET_EMAIL_SENT", "system", "System", "manager", profile.name, { email: profile.email });
    res.json({ success: true, message: "If that email is registered, a reset message has been sent." });
  } catch (error) { next(error); }
};

module.exports = {
  createLog,
  getLogs,
  getSettings,
  updateSetting,
  getEmployees,
  createEmployee,
  updateEmployee,
  getInventory,
  createInventoryItem,
  updateInventoryStock,
  getRecipes,
  updateRecipe,
  managerAuth,
  getManagerProfileRoute,
  updateManagerProfile,
  getKitchenPasscode,
  sendResetEmail,
};
