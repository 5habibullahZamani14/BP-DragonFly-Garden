const fs = require("fs");
const path = require("path");

const DATASETS = {
  feedback: {
    label: "Feedback",
    impact: "Deletes selected feedback entries and their attached photos. Feedback analysis reports are retained.",
    from: "customer_feedback f",
    select: "CAST(f.id AS TEXT) AS id, f.sender_name AS label, f.created_at AS created_at, f.status AS type, SUBSTR(f.comment, 1, 180) AS details",
    dateColumn: "f.created_at",
    searchColumns: ["f.sender_name", "f.sender_email", "f.comment", "f.table_number"],
    filterColumns: { status: "f.status", rating: "f.rating_app" },
    filters: {
      status: ["active", "archived"],
      rating: ["1", "2", "3", "4", "5"],
    },
  },
  archived_orders: {
    label: "Archived orders",
    impact: "Deletes selected archived order snapshots. Current orders and payment records are not changed.",
    from: "archived_orders a",
    select: "CAST(a.id AS TEXT) AS id, 'Order #' || a.original_order_id AS label, a.archived_at AS created_at, a.status AS type, 'Table ' || a.table_id || ' · ' || a.payment_status || ' · RM ' || a.total_price AS details",
    dateColumn: "a.archived_at",
    searchColumns: ["CAST(a.original_order_id AS TEXT)", "CAST(a.table_id AS TEXT)", "a.order_data"],
    filterColumns: { status: "a.status", paymentStatus: "a.payment_status", tableId: "a.table_id" },
    filters: {},
  },
  activity_logs: {
    label: "Grand Archive activity",
    impact: "Deletes selected audit-history entries. The cleanup itself is recorded as a new audit entry.",
    from: "grand_archive_logs l",
    select: "CAST(l.id AS TEXT) AS id, COALESCE(l.target_name, l.action) AS label, l.timestamp AS created_at, l.category AS type, l.action || CASE WHEN l.actor_name IS NULL THEN '' ELSE ' · ' || l.actor_name END AS details",
    dateColumn: "l.timestamp",
    searchColumns: ["l.category", "l.action", "l.actor_id", "l.actor_name", "l.target_id", "l.target_name", "l.details"],
    filterColumns: { category: "l.category", action: "l.action" },
    filters: {},
  },
  orders: {
    label: "Current orders",
    impact: "Deletes selected orders, their items, payments, payment logs, status history, and linked print-job records. Archived order snapshots remain.",
    from: "orders o LEFT JOIN tables t ON t.id = o.table_id",
    select: "CAST(o.id AS TEXT) AS id, 'Order #' || o.id AS label, o.created_at AS created_at, o.status AS type, COALESCE(t.table_number, 'Unknown table') || ' · ' || o.payment_status || ' · RM ' || o.total_price AS details",
    dateColumn: "o.created_at",
    searchColumns: ["CAST(o.id AS TEXT)", "o.customer_name", "o.customer_phone", "o.order_remarks", "t.table_number"],
    filterColumns: { status: "o.status", paymentStatus: "o.payment_status", type: "o.order_type", tableId: "o.table_id" },
    filters: {},
  },
  menu_items: {
    label: "Menu items",
    impact: "Deletes selected menu items, their recipes, options, and modifier assignments. Items referenced by order history cannot be deleted.",
    from: "menu_items m LEFT JOIN categories c ON c.id = m.category_id",
    select: "CAST(m.id AS TEXT) AS id, m.name AS label, NULL AS created_at, m.type AS type, COALESCE(c.name, 'Uncategorised') || CASE WHEN m.image_url IS NULL OR TRIM(m.image_url) = '' THEN '' ELSE ' · has photo' END AS details",
    dateColumn: null,
    searchColumns: ["m.name", "m.description", "c.name"],
    filterColumns: { type: "m.type", category: "c.name", availability: "m.is_available" },
    filters: { type: ["food", "drink", "merchandise"], availability: ["0", "1"] },
  },
  categories: {
    label: "Menu categories",
    impact: "Deletes selected empty categories. Categories that still contain menu items must be emptied first.",
    from: "categories c",
    select: "CAST(c.id AS TEXT) AS id, c.name AS label, NULL AS created_at, 'Category' AS type, 'Display order ' || c.display_order || ' · ' || (SELECT COUNT(*) FROM menu_items m WHERE m.category_id = c.id) || ' menu items' AS details",
    dateColumn: null,
    searchColumns: ["c.name"],
    filterColumns: {},
    filters: {},
  },
  employees: {
    label: "Employees",
    impact: "Deletes selected employee profiles. Historical transactions retain their recorded employee names.",
    from: "employees e",
    select: "CAST(e.id AS TEXT) AS id, e.name AS label, e.hire_date AS created_at, CASE WHEN e.is_archived = 1 THEN 'Archived' ELSE 'Active' END AS type, COALESCE(e.department, 'No department') || ' · ' || e.employee_id AS details",
    dateColumn: "e.hire_date",
    searchColumns: ["e.name", "e.employee_id", "e.department", "e.contact_info"],
    filterColumns: { status: "e.is_archived", department: "e.department" },
    filters: { status: ["0", "1"] },
  },
  inventory: {
    label: "Inventory items",
    impact: "Deletes selected inventory items and their recipe-ingredient links.",
    from: "inventory_items i",
    select: "CAST(i.id AS TEXT) AS id, i.name AS label, NULL AS created_at, CASE WHEN i.is_archived = 1 THEN 'Archived' ELSE 'Active' END AS type, COALESCE(i.category, 'Uncategorised') || ' · ' || i.current_stock || ' ' || i.unit AS details",
    dateColumn: null,
    searchColumns: ["i.name", "i.category"],
    filterColumns: { status: "i.is_archived", category: "i.category" },
    filters: { status: ["0", "1"] },
  },
  tables: {
    label: "Restaurant tables",
    impact: "Deletes selected physical tables that have no current orders. The system Counter Order table is protected.",
    from: "tables t",
    select: "CAST(t.id AS TEXT) AS id, t.table_number AS label, NULL AS created_at, 'Table' AS type, CASE WHEN t.id = 999 THEN 'Protected system table' ELSE (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id) || ' current orders' END AS details",
    dateColumn: null,
    searchColumns: ["t.table_number"],
    filterColumns: {},
    filters: {},
  },
  staff_assistance: {
    label: "Staff assistance requests",
    impact: "Deletes selected call-staff requests.",
    from: "staff_assistance_requests s",
    select: "CAST(s.id AS TEXT) AS id, 'Table ' || s.table_number AS label, s.requested_at AS created_at, CASE WHEN s.archived_at IS NOT NULL THEN 'Archived' WHEN s.acknowledged_at IS NOT NULL THEN 'Acknowledged' ELSE 'Pending' END AS type, COALESCE(s.acknowledged_by_name, 'Not acknowledged') AS details",
    dateColumn: "s.requested_at",
    searchColumns: ["s.table_number", "s.acknowledged_by_name"],
    filterColumns: {},
    statusExpression: "CASE WHEN s.archived_at IS NOT NULL THEN 'archived' WHEN s.acknowledged_at IS NOT NULL THEN 'acknowledged' ELSE 'pending' END",
    filters: { status: ["pending", "acknowledged", "archived"] },
  },
  printer_jobs: {
    label: "Printer job history",
    impact: "Deletes selected printer job history. It does not undo or repeat any physical print.",
    from: "printer_jobs p",
    select: "CAST(p.id AS TEXT) AS id, p.job_type AS label, p.created_at AS created_at, p.status AS type, p.printer_name || CASE WHEN p.error_message IS NULL THEN '' ELSE ' · ' || p.error_message END AS details",
    dateColumn: "p.created_at",
    searchColumns: ["p.job_type", "p.printer_name", "p.error_message"],
    filterColumns: { status: "p.status", jobType: "p.job_type" },
    filters: { status: ["submitting", "submitted", "uncertain", "reviewed"] },
  },
  promotions: {
    label: "Promotion templates",
    impact: "Deletes selected reusable promotion templates. Existing menu-item promotion settings are not changed.",
    from: "promotion_templates p",
    select: "CAST(p.id AS TEXT) AS id, p.promo_label AS label, p.created_at AS created_at, CASE WHEN p.promo_affects_price = 1 THEN 'Price discount' ELSE 'Label only' END AS type, CASE WHEN p.promo_discount_percent IS NULL THEN 'No discount percent' ELSE p.promo_discount_percent || '% discount' END AS details",
    dateColumn: "p.created_at",
    searchColumns: ["p.promo_label"],
    filterColumns: { affectsPrice: "p.promo_affects_price" },
    filters: { affectsPrice: ["0", "1"] },
  },
  patterns: {
    label: "Menu patterns",
    impact: "Deletes selected pattern assets and unlinks them from menu items. Uploaded image files are removed only when no longer referenced.",
    from: "patterns p",
    select: "CAST(p.id AS TEXT) AS id, p.name AS label, p.created_at AS created_at, 'Pattern' AS type, p.image_url AS details",
    dateColumn: "p.created_at",
    searchColumns: ["p.name"],
    filterColumns: {},
    filters: {},
  },
  repository_images: {
    label: "Repository images",
    impact: "Deletes selected reusable images and unlinks them from menu items. Files are removed only when no longer referenced.",
    from: "repo_images r JOIN image_repository_sections s ON s.id = r.section_id",
    select: "CAST(r.id AS TEXT) AS id, r.name AS label, r.created_at AS created_at, s.name AS type, r.image_url AS details",
    dateColumn: "r.created_at",
    searchColumns: ["r.name", "s.name"],
    filterColumns: { section: "s.name" },
    filters: {},
  },
  repository_sections: {
    label: "Image repository sections",
    impact: "Deletes selected empty image-repository sections. Remove their images first.",
    from: "image_repository_sections s",
    select: "CAST(s.id AS TEXT) AS id, s.name AS label, s.created_at AS created_at, 'Repository section' AS type, (SELECT COUNT(*) FROM repo_images r WHERE r.section_id = s.id) || ' images' AS details",
    dateColumn: "s.created_at",
    searchColumns: ["s.name"],
    filterColumns: {},
    filters: {},
  },
  item_option_groups: {
    label: "Menu item option groups",
    impact: "Deletes selected option groups and their choices from the linked menu items.",
    from: "item_option_groups g JOIN menu_items m ON m.id = g.menu_item_id",
    select: "CAST(g.id AS TEXT) AS id, g.name || ' · ' || m.name AS label, NULL AS created_at, 'Item options' AS type, (SELECT COUNT(*) FROM item_options o WHERE o.group_id = g.id) || ' choices' AS details",
    dateColumn: null,
    searchColumns: ["g.name", "m.name"],
    filterColumns: { item: "m.name" },
    filters: {},
  },
  modifier_groups: {
    label: "Shared modifier groups",
    impact: "Deletes selected shared modifier groups, their choices, and menu-item assignments.",
    from: "modifier_groups g",
    select: "CAST(g.id AS TEXT) AS id, g.name AS label, g.created_at AS created_at, 'Modifier group' AS type, (SELECT COUNT(*) FROM modifier_options o WHERE o.group_id = g.id) || ' choices · ' || (SELECT COUNT(*) FROM item_modifier_assignments a WHERE a.modifier_group_id = g.id) || ' menu assignments' AS details",
    dateColumn: "g.created_at",
    searchColumns: ["g.name"],
    filterColumns: { required: "g.is_required", multiSelect: "g.is_multi_select" },
    filters: { required: ["0", "1"], multiSelect: ["0", "1"] },
  },
  modifier_options: {
    label: "Shared modifier choices",
    impact: "Deletes selected choices from shared modifier groups. Any menu-item default using a removed choice is cleared.",
    from: "modifier_options o JOIN modifier_groups g ON g.id = o.group_id",
    select: "CAST(o.id AS TEXT) AS id, o.label AS label, NULL AS created_at, 'Modifier choice' AS type, g.name || ' · RM ' || o.price_delta AS details",
    dateColumn: null,
    searchColumns: ["o.label", "g.name"],
    filterColumns: { group: "g.name" },
    filters: {},
  },
  feedback_images: {
    label: "Feedback photos",
    impact: "Deletes selected feedback photos while keeping their feedback entries.",
    from: "customer_feedback_images i JOIN customer_feedback f ON f.id = i.feedback_id",
    select: "CAST(i.id AS TEXT) AS id, 'Feedback #' || f.id || ' photo' AS label, f.created_at AS created_at, 'Feedback photo' AS type, i.image_url AS details",
    dateColumn: "f.created_at",
    searchColumns: ["f.sender_name", "f.comment"],
    filterColumns: {},
    filters: {},
  },
  menu_images: {
    label: "Uploaded menu images",
    impact: "Clears selected menu-item photos. Pattern and repository images are removed with their asset records and unlinked from menu items.",
    from: `(
      SELECT 'item:' || m.id AS id, m.name AS label, 'Menu item photo' AS source, m.image_url AS image_url
      FROM menu_items m WHERE m.image_url LIKE '/menu-images/menu-%'
      UNION ALL
      SELECT 'pattern:' || p.id AS id, p.name AS label, 'Pattern photo' AS source, p.image_url AS image_url
      FROM patterns p WHERE p.image_url LIKE '/menu-images/menu-%'
      UNION ALL
      SELECT 'repo:' || r.id AS id, r.name AS label, 'Repository photo' AS source, r.image_url AS image_url
      FROM repo_images r WHERE r.image_url LIKE '/menu-images/menu-%'
    ) images`,
    select: "images.id AS id, images.label AS label, NULL AS created_at, images.source AS type, images.image_url AS details",
    dateColumn: null,
    searchColumns: ["images.label", "images.image_url"],
    filterColumns: { source: "images.source" },
    filters: { source: ["Menu item photo", "Pattern photo", "Repository photo"] },
  },
  payment_methods: {
    label: "Payment methods",
    impact: "Deletes selected payment methods that are not referenced by any payment record.",
    from: "payment_methods p",
    select: "CAST(p.id AS TEXT) AS id, p.name AS label, NULL AS created_at, 'Payment method' AS type, CASE WHEN p.name IN ('Cash', 'Visa Card', 'Mastercard', 'eWallet') THEN 'Protected default' ELSE (SELECT COUNT(*) FROM payments x WHERE x.payment_method_id = p.id) || ' payment records' END AS details",
    dateColumn: null,
    searchColumns: ["p.name"],
    filterColumns: {},
    filters: {},
  },
  feedback_analysis_runs: {
    label: "Feedback analysis reports",
    impact: "Deletes selected reports and their generated findings.",
    from: "feedback_analysis_runs r",
    select: "CAST(r.id AS TEXT) AS id, 'Analysis report #' || r.id AS label, r.created_at AS created_at, r.analysis_method AS type, r.feedback_count || ' feedback entries analyzed' AS details",
    dateColumn: "r.created_at",
    searchColumns: ["r.analysis_method", "r.report_json"],
    filterColumns: {},
    filters: {},
  },
  feedback_findings: {
    label: "Feedback analysis findings",
    impact: "Deletes selected generated findings. The source analysis report remains.",
    from: "feedback_analysis_findings f JOIN feedback_analysis_runs r ON r.id = f.run_id",
    select: "CAST(f.id AS TEXT) AS id, f.title AS label, r.created_at AS created_at, f.priority AS type, f.category || ' · ' || f.status AS details",
    dateColumn: "r.created_at",
    searchColumns: ["f.title", "f.description", "f.category"],
    filterColumns: { status: "f.status", priority: "f.priority", category: "f.category" },
    filters: { status: ["pending", "accepted", "dismissed"], priority: ["low", "medium", "high"] },
  },
};

const DATASET_KEYS = Object.keys(DATASETS);
const MAX_PAGE_SIZE = 100;
const MAX_DELETE_COUNT = 2000;

class DataCleanupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const validateDate = (value, label) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DataCleanupError(`${label} must use YYYY-MM-DD format.`);
  }
  return value;
};

const normalizeFilters = (dataset, filters = {}) => {
  const definition = DATASETS[dataset];
  if (!definition) throw new DataCleanupError("Unknown data category.");
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    throw new DataCleanupError("Filters must be an object.");
  }

  const normalized = {
    from: validateDate(filters.from, "Start date"),
    to: validateDate(filters.to, "End date"),
    search: typeof filters.search === "string" ? filters.search.trim().slice(0, 100) : "",
  };
  if (normalized.from && normalized.to && normalized.from > normalized.to) {
    throw new DataCleanupError("Start date must be on or before end date.");
  }
  if ((normalized.from || normalized.to) && !definition.dateColumn) {
    throw new DataCleanupError("Date filters are not available for this data category.");
  }

  for (const [filterKey, column] of Object.entries(definition.filterColumns)) {
    const rawValue = filters[filterKey];
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const value = String(rawValue).trim();
    const allowed = definition.filters[filterKey];
    if (allowed && !allowed.includes(value)) {
      throw new DataCleanupError(`Invalid ${filterKey} filter.`);
    }
    if (!allowed && (value.length > 80 || /[\u0000-\u001f]/.test(value))) {
      throw new DataCleanupError(`Invalid ${filterKey} filter.`);
    }
    normalized[filterKey] = { column, value };
  }
  if (definition.statusExpression && filters.status !== undefined && filters.status !== "") {
    const value = String(filters.status).trim();
    if (!definition.filters.status.includes(value)) throw new DataCleanupError("Invalid status filter.");
    normalized.status = value;
  }
  return normalized;
};

const buildWhere = (definition, filters) => {
  const clauses = [];
  const params = [];
  if (filters.from && definition.dateColumn) {
    clauses.push(`date(${definition.dateColumn}) >= date(?)`);
    params.push(filters.from);
  }
  if (filters.to && definition.dateColumn) {
    clauses.push(`date(${definition.dateColumn}) <= date(?)`);
    params.push(filters.to);
  }
  if (filters.search && definition.searchColumns.length) {
    clauses.push(`(${definition.searchColumns.map((column) => `CAST(${column} AS TEXT) LIKE ?`).join(" OR ")})`);
    for (let index = 0; index < definition.searchColumns.length; index += 1) {
      params.push(`%${filters.search}%`);
    }
  }
  for (const [key, filter] of Object.entries(filters)) {
    if (filter && typeof filter === "object" && filter.column) {
      clauses.push(`${filter.column} = ?`);
      params.push(filter.value);
    }
  }
  if (filters.status && typeof filters.status === "string" && definition.statusExpression) {
    clauses.push(`${definition.statusExpression} = ?`);
    params.push(filters.status);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
};

const buildQuery = (definition, where) =>
  `SELECT ${definition.select} FROM ${definition.from} ${where.sql}`;

const parseNumericIds = (ids) => {
  const numbers = ids.map((id) => {
    const value = Number(id);
    if (!Number.isSafeInteger(value) || value < 1) throw new DataCleanupError("Record selection contains an invalid ID.");
    return value;
  });
  return [...new Set(numbers)];
};

const createDataCleanupService = ({ all, get, run, fileSystem = fs, publicDir }) => {
  const removeManagedImageIfUnused = async (imageUrl, imageType) => {
    const expectedPrefix = imageType === "feedback" ? "/feedback-images/fb-" : "/menu-images/menu-";
    if (typeof imageUrl !== "string" || !imageUrl.startsWith(expectedPrefix)) return null;
    const relative = imageUrl.replace(/^\/+/, "");
    const baseDir = path.resolve(publicDir, imageType === "feedback" ? "feedback-images" : "menu-images");
    const filePath = path.resolve(publicDir, relative);
    if (!filePath.startsWith(`${baseDir}${path.sep}`)) {
      throw new DataCleanupError("An uploaded image path failed safety validation.", 500);
    }

    const used = await get(
      `SELECT
         (SELECT COUNT(*) FROM menu_items WHERE image_url = ?) +
         (SELECT COUNT(*) FROM patterns WHERE image_url = ?) +
         (SELECT COUNT(*) FROM repo_images WHERE image_url = ?) +
         (SELECT COUNT(*) FROM customer_feedback_images WHERE image_url = ?) AS count`,
      [imageUrl, imageUrl, imageUrl, imageUrl]
    );
    if (used?.count) return null;
    if (!fileSystem.existsSync(filePath)) return null;
    try {
      fileSystem.unlinkSync(filePath);
      return null;
    } catch (error) {
      return `Could not remove uploaded image ${path.basename(filePath)}: ${error.message}`;
    }
  };

  const getRows = async (dataset, rawFilters = {}, page = 1, pageSize = 50) => {
    const definition = DATASETS[dataset];
    if (!definition) throw new DataCleanupError("Unknown data category.");
    const filters = normalizeFilters(dataset, rawFilters);
    const where = buildWhere(definition, filters);
    const countRow = await get(`SELECT COUNT(*) AS count FROM ${definition.from} ${where.sql}`, where.params);
    const safePage = Number.isSafeInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const safePageSize = Number.isSafeInteger(Number(pageSize)) ? Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize))) : 50;
    const offset = (safePage - 1) * safePageSize;
    const orderBy = definition.dateColumn ? `${definition.dateColumn} DESC, 1 DESC` : "1 DESC";
    const rows = await all(`${buildQuery(definition, where)} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...where.params,
      safePageSize,
      offset,
    ]);
    return {
      dataset,
      label: definition.label,
      impact: definition.impact,
      filters: definition.filters,
      rows,
      total: countRow?.count || 0,
      page: safePage,
      pageSize: safePageSize,
    };
  };

  const getIdsForDelete = async (dataset, ids, filters, allMatching, expectedCount) => {
    const definition = DATASETS[dataset];
    const normalized = normalizeFilters(dataset, filters);
    const where = buildWhere(definition, normalized);
    let rows;
    if (allMatching) {
      const countRow = await get(`SELECT COUNT(*) AS count FROM (${buildQuery(definition, where)}) AS matching_records`, where.params);
      if (!Number.isSafeInteger(expectedCount) || expectedCount < 0 || countRow?.count !== expectedCount) {
        throw new DataCleanupError("The matching data changed after review. Refresh the preview before deleting.", 409);
      }
      if (countRow.count > MAX_DELETE_COUNT) {
        throw new DataCleanupError(`This selection has ${countRow.count} records. Delete up to ${MAX_DELETE_COUNT} at a time, or use Reset Everything.`, 413);
      }
      rows = await all(`SELECT id FROM (${buildQuery(definition, where)}) AS matching_records`, where.params);
    } else {
      if (!Array.isArray(ids) || ids.length === 0) throw new DataCleanupError("Select at least one record.");
      if (ids.length > MAX_DELETE_COUNT) throw new DataCleanupError(`Select no more than ${MAX_DELETE_COUNT} records per deletion.`);
      if (dataset === "menu_images") {
        const valid = ids.every((id) => /^(item|pattern|repo):[1-9]\d*$/.test(String(id)));
        if (!valid) throw new DataCleanupError("Image selection contains an invalid ID.");
        const selected = new Set(ids.map(String));
        rows = (await all(`SELECT id FROM (${buildQuery(definition, where)}) AS matching_records`, where.params))
          .filter((row) => selected.has(row.id));
      } else {
        const numericIds = parseNumericIds(ids);
        rows = await all(
          `SELECT id FROM (${buildQuery(definition, where)}) AS selected_records WHERE CAST(id AS INTEGER) IN (${numericIds.map(() => "?").join(",")})`,
          [...where.params, ...numericIds]
        );
      }
      if (rows.length !== new Set(ids.map(String)).size) {
        throw new DataCleanupError("Some selected records are no longer available or do not match the current filters. Refresh the list.", 409);
      }
    }
    if (rows.length > MAX_DELETE_COUNT) {
      throw new DataCleanupError(`This selection has ${rows.length} records. Delete up to ${MAX_DELETE_COUNT} at a time, or use Reset Everything.`, 413);
    }
    return rows;
  };

  const deleteRows = async (dataset, rows) => {
    const fileUrls = [];
    const numericIds = dataset === "menu_images" ? [] : parseNumericIds(rows.map((row) => row.id));
    const placeholders = numericIds.map(() => "?").join(",");

    if (dataset === "menu_items") {
      const references = await get(
        `SELECT COUNT(*) AS count FROM order_items WHERE menu_item_id IN (${placeholders})`,
        numericIds
      );
      if (references?.count) throw new DataCleanupError("Some selected menu items appear in order history. Remove only items with no historical orders.", 409);
      const images = await all(`SELECT image_url FROM menu_items WHERE id IN (${placeholders})`, numericIds);
      fileUrls.push(...images.map((row) => ({ url: row.image_url, type: "menu" })));
      const groups = await all(`SELECT id FROM item_option_groups WHERE menu_item_id IN (${placeholders})`, numericIds);
      const groupIds = groups.map((row) => row.id);
      if (groupIds.length) {
        await run(`DELETE FROM item_options WHERE group_id IN (${groupIds.map(() => "?").join(",")})`, groupIds);
        await run(`DELETE FROM item_option_groups WHERE id IN (${groupIds.map(() => "?").join(",")})`, groupIds);
      }
      await run(`DELETE FROM item_modifier_assignments WHERE menu_item_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM menu_item_ingredients WHERE menu_item_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM menu_items WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "feedback") {
      const images = await all(`SELECT image_url FROM customer_feedback_images WHERE feedback_id IN (${placeholders})`, numericIds);
      fileUrls.push(...images.map((row) => ({ url: row.image_url, type: "feedback" })));
      await run(`DELETE FROM customer_feedback_images WHERE feedback_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM customer_feedback_access_entries WHERE feedback_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM customer_feedback WHERE id IN (${placeholders})`, numericIds);
      await run("DELETE FROM customer_feedback_access_sessions WHERE NOT EXISTS (SELECT 1 FROM customer_feedback_access_entries e WHERE e.session_id = customer_feedback_access_sessions.id)");
    } else if (dataset === "feedback_images") {
      const images = await all(`SELECT image_url FROM customer_feedback_images WHERE id IN (${placeholders})`, numericIds);
      fileUrls.push(...images.map((row) => ({ url: row.image_url, type: "feedback" })));
      await run(`DELETE FROM customer_feedback_images WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "menu_images") {
      for (const row of rows) {
        const [kind, rawId] = row.id.split(":");
        const id = parseNumericIds([rawId])[0];
        let imageUrl = null;
        if (kind === "item") {
          const current = await get("SELECT image_url FROM menu_items WHERE id = ?", [id]);
          imageUrl = current?.image_url;
          await run("UPDATE menu_items SET image_url = NULL WHERE id = ?", [id]);
        } else if (kind === "pattern") {
          const current = await get("SELECT image_url FROM patterns WHERE id = ?", [id]);
          imageUrl = current?.image_url;
          await run("UPDATE menu_items SET pattern_id = NULL WHERE pattern_id = ?", [id]);
          await run("DELETE FROM patterns WHERE id = ?", [id]);
        } else if (kind === "repo") {
          const current = await get("SELECT image_url FROM repo_images WHERE id = ?", [id]);
          imageUrl = current?.image_url;
          await run("UPDATE menu_items SET repo_image_id = NULL WHERE repo_image_id = ?", [id]);
          await run("DELETE FROM repo_images WHERE id = ?", [id]);
        }
        fileUrls.push({ url: imageUrl, type: "menu" });
      }
    } else if (dataset === "patterns") {
      const images = await all(`SELECT image_url FROM patterns WHERE id IN (${placeholders})`, numericIds);
      fileUrls.push(...images.map((row) => ({ url: row.image_url, type: "menu" })));
      await run(`UPDATE menu_items SET pattern_id = NULL WHERE pattern_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM patterns WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "repository_images") {
      const images = await all(`SELECT image_url FROM repo_images WHERE id IN (${placeholders})`, numericIds);
      fileUrls.push(...images.map((row) => ({ url: row.image_url, type: "menu" })));
      await run(`UPDATE menu_items SET repo_image_id = NULL WHERE repo_image_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM repo_images WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "repository_sections") {
      const imageCount = await get(`SELECT COUNT(*) AS count FROM repo_images WHERE section_id IN (${placeholders})`, numericIds);
      if (imageCount?.count) throw new DataCleanupError("Selected repository sections still contain images. Delete those images first.", 409);
      await run(`DELETE FROM image_repository_sections WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "item_option_groups") {
      await run(`DELETE FROM item_options WHERE group_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM item_option_groups WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "modifier_groups") {
      await run(`DELETE FROM item_modifier_assignments WHERE modifier_group_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM modifier_options WHERE group_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM modifier_groups WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "modifier_options") {
      await run(`UPDATE item_modifier_assignments SET default_option_id = NULL WHERE default_option_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM modifier_options WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "orders") {
      await run(`DELETE FROM printer_jobs WHERE order_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM payment_logs WHERE order_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM payments WHERE order_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM order_status_history WHERE order_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM orders WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "categories") {
      const items = await get(`SELECT COUNT(*) AS count FROM menu_items WHERE category_id IN (${placeholders})`, numericIds);
      if (items?.count) throw new DataCleanupError("Selected categories still contain menu items. Delete or move those items first.", 409);
      await run(`DELETE FROM categories WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "tables") {
      if (numericIds.includes(999)) throw new DataCleanupError("The system Counter Order table cannot be deleted.", 409);
      const orders = await get(`SELECT COUNT(*) AS count FROM orders WHERE table_id IN (${placeholders})`, numericIds);
      if (orders?.count) throw new DataCleanupError("Selected tables still have current orders. Clear those orders first.", 409);
      await run(`DELETE FROM tables WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "inventory") {
      await run(`DELETE FROM menu_item_ingredients WHERE inventory_item_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM inventory_items WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "payment_methods") {
      const protectedMethods = await get(
        `SELECT COUNT(*) AS count FROM payment_methods WHERE id IN (${placeholders}) AND name IN ('Cash', 'Visa Card', 'Mastercard', 'eWallet')`,
        numericIds
      );
      if (protectedMethods?.count) {
        throw new DataCleanupError("Default payment methods are protected so the payment workflow remains usable.", 409);
      }
      const payments = await get(`SELECT COUNT(*) AS count FROM payments WHERE payment_method_id IN (${placeholders})`, numericIds);
      if (payments?.count) throw new DataCleanupError("Selected payment methods are referenced by payment history and cannot be deleted.", 409);
      await run(`DELETE FROM payment_methods WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "feedback_analysis_runs") {
      await run(`DELETE FROM feedback_analysis_findings WHERE run_id IN (${placeholders})`, numericIds);
      await run(`DELETE FROM feedback_analysis_runs WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "activity_logs") {
      await run(`DELETE FROM grand_archive_logs WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "archived_orders") {
      await run(`DELETE FROM archived_orders WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "employees") {
      await run(`DELETE FROM employees WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "staff_assistance") {
      await run(`DELETE FROM staff_assistance_requests WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "printer_jobs") {
      await run(`DELETE FROM printer_jobs WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "promotions") {
      await run(`DELETE FROM promotion_templates WHERE id IN (${placeholders})`, numericIds);
    } else if (dataset === "feedback_findings") {
      await run(`DELETE FROM feedback_analysis_findings WHERE id IN (${placeholders})`, numericIds);
    } else {
      throw new DataCleanupError("This data category cannot be deleted through bulk cleanup.", 400);
    }

    return fileUrls;
  };

  const deleteRecords = async ({ dataset, ids, filters = {}, allMatching = false, expectedCount, audit }) => {
    await run("BEGIN IMMEDIATE");
    let rows;
    let fileUrls;
    try {
      rows = await getIdsForDelete(dataset, ids, filters, allMatching, expectedCount);
      if (rows.length === 0) throw new DataCleanupError("There are no matching records to delete.");
      fileUrls = await deleteRows(dataset, rows);
      await run(
        "INSERT INTO restaurant_settings (key, value) VALUES ('seed_data_locked', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      );
      if (audit) await audit(rows.length);
      await run("COMMIT");
    } catch (error) {
      await run("ROLLBACK");
      throw error;
    }

    const warnings = [];
    for (const file of fileUrls) {
      const warning = await removeManagedImageIfUnused(file.url, file.type);
      if (warning) warnings.push(warning);
    }
    return { deleted: rows.length, warnings };
  };

  return { getRows, deleteRecords };
};

module.exports = {
  DATASETS,
  DATASET_KEYS,
  DataCleanupError,
  createDataCleanupService,
  normalizeFilters,
};
