const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");

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

const generateEmployeeId = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id;
  let isUnique = false;
  while (!isUnique) {
    id = '';
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await get("SELECT id FROM employees WHERE employee_id = ?", [id]);
    if (!existing) isUnique = true;
  }
  return id;
};

// ==========================================
// LOGS
// ==========================================
const createLog = async (category, action, actorId, actorName, targetId, targetName, detailsObj) => {
  const details = detailsObj ? JSON.stringify(detailsObj) : null;
  await run(
    `INSERT INTO grand_archive_logs (category, action, actor_id, actor_name, target_id, target_name, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [category, action, actorId, actorName, targetId, targetName, details]
  );
};

const getLogs = async (req, res, next) => {
  try {
    const { category, limit = 100 } = req.query;
    let query = "SELECT * FROM grand_archive_logs";
    let params = [];
    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }
    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(parseInt(limit));
    
    const logs = await all(query, params);
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// SETTINGS
// ==========================================
const getSettings = async (req, res, next) => {
  try {
    const settings = await all("SELECT * FROM restaurant_settings");
    const result = {};
    settings.forEach(s => {
      try { result[s.key] = JSON.parse(s.value); } 
      catch (e) { result[s.key] = s.value; }
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    await run(
      "INSERT INTO restaurant_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, stringValue]
    );
    
    await createLog('SYSTEM', 'UPDATE_SETTING', req.user?.id, req.user?.name, key, key, { value });
    res.json({ success: true, key, value });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// EMPLOYEES
// ==========================================
const getEmployees = async (req, res, next) => {
  try {
    const { include_archived } = req.query;
    let query = "SELECT * FROM employees";
    if (include_archived !== 'true') query += " WHERE is_archived = 0";
    query += " ORDER BY department, name";
    const employees = await all(query);
    res.json(employees);
  } catch (error) {
    next(error);
  }
};

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
    await createLog('EMPLOYEE', 'CREATE', req.user?.id, req.user?.name, employee.employee_id, employee.name, employee);
    
    res.status(201).json(employee);
  } catch (error) {
    next(error);
  }
};

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
    await createLog('EMPLOYEE', 'UPDATE', req.user?.id, req.user?.name, employee.employee_id, employee.name, employee);
    res.json(employee);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// INVENTORY & RECIPES
// ==========================================
const getInventory = async (req, res, next) => {
  try {
    const items = await all("SELECT * FROM inventory_items WHERE is_archived = 0 ORDER BY category, name");
    res.json(items);
  } catch (error) {
    next(error);
  }
};

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
    await createLog('INVENTORY', 'CREATE', req.user?.id, req.user?.name, item.id.toString(), item.name, item);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

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
    await createLog('INVENTORY', 'UPDATE_STOCK', req.user?.id, req.user?.name, item.id.toString(), item.name, { current_stock });
    res.json(item);
  } catch (error) {
    next(error);
  }
};

const getRecipes = async (req, res, next) => {
  try {
    // Get all menu items and their ingredients
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
    rows.forEach(row => {
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
  } catch (error) {
    next(error);
  }
};

const updateRecipe = async (req, res, next) => {
  try {
    const { menu_item_id } = req.params;
    const { ingredients } = req.body; // Array of { inventory_item_id, quantity_required }
    
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
      await createLog('RECIPE', 'UPDATE', req.user?.id, req.user?.name, menu_item_id.toString(), menuItem?.name, { ingredients });
      res.json({ success: true, menu_item_id });
    } catch (err) {
      await run("ROLLBACK");
      throw err;
    }
  } catch (error) {
    next(error);
  }
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
  updateRecipe
};
