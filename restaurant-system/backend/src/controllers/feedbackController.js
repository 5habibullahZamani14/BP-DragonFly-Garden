/*
 * feedbackController.js — Customer feedback submission and manager review.
 */

const crypto = require("crypto");
const db = require("../database/db");
const { createHttpError } = require("../middleware/validation");
const { validateFeedbackText } = require("../utils/profanityFilter");
const { analyzeFeedback, RATING_DIMS } = require("../services/feedbackAnalyzer");
const { generateAIAnalysis, generateAIFindings, generateChatResponse } = require("../services/aiFeedbackAnalyzer");

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCb(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

// Broadcast function for WebSocket events
let broadcastFn = null;
const setBroadcast = (fn) => { broadcastFn = fn; };
const getBroadcast = () => broadcastFn;

const clampRating = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.max(-5, Math.min(5, Math.round(n)));
};

const parseTags = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
};

const mapFeedbackRow = async (row) => {
  if (!row) return null;
  const images = await all(
    `SELECT id, image_url, display_order FROM customer_feedback_images WHERE feedback_id = ? ORDER BY display_order, id`,
    [row.id],
  );
  let suggestion_tags = [];
  try {
    suggestion_tags = row.suggestion_tags ? JSON.parse(row.suggestion_tags) : [];
  } catch {
    suggestion_tags = [];
  }
  return {
    ...row,
    suggestion_tags,
    images,
    ratings: {
      staff: row.rating_staff,
      app: row.rating_app,
      cleanliness: row.rating_cleanliness,
      food: row.rating_food,
      atmosphere: row.rating_atmosphere,
      value: row.rating_value,
    },
  };
};

const stripTokenForManager = (row) => {
  if (!row) return row;
  const { view_token, ...rest } = row;
  return rest;
};

exports.submitFeedback = async (req, res) => {
  const {
    table_id,
    order_id,
    sender_name,
    sender_email,
    comment,
    rating_staff,
    rating_app,
    rating_cleanliness,
    rating_food,
    rating_atmosphere,
    rating_value,
    suggestion_tags,
  } = req.body;

  const name = String(sender_name || "").trim();
  const text = String(comment || "").trim();
  if (!name || name.length < 2) {
    throw createHttpError(400, "Name is required (at least 2 characters).");
  }
  if (!text || text.length < 8) {
    throw createHttpError(400, "Please write a bit more detail in your feedback (at least 8 characters).");
  }

  const badWords = validateFeedbackText([name, text, sender_email || ""]);
  if (badWords.length) {
    return res.status(400).json({
      error: "profanity",
      message: "Please remove offensive language before sending your feedback.",
      words: badWords,
    });
  }

  let tableNumber = null;
  if (table_id) {
    const table = await get("SELECT table_number FROM tables WHERE id = ?", [table_id]);
    tableNumber = table?.table_number || null;
  }

  const viewToken = crypto.randomBytes(24).toString("hex");
  const tags = parseTags(suggestion_tags);

  const result = await run(
    `INSERT INTO customer_feedback (
      view_token, table_id, table_number, order_id, sender_name, sender_email, comment,
      rating_staff, rating_app, rating_cleanliness, rating_food, rating_atmosphere, rating_value,
      suggestion_tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      viewToken,
      table_id || null,
      tableNumber,
      order_id || null,
      name,
      String(sender_email || "").trim() || null,
      text,
      clampRating(rating_staff),
      clampRating(rating_app),
      clampRating(rating_cleanliness),
      clampRating(rating_food),
      clampRating(rating_atmosphere),
      clampRating(rating_value),
      JSON.stringify(tags),
    ],
  );

  const files = req.files || [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imageUrl = `/feedback-images/${file.filename}`;
    await run(
      `INSERT INTO customer_feedback_images (feedback_id, image_url, display_order) VALUES (?, ?, ?)`,
      [result.id, imageUrl, i],
    );
  }

  const row = await mapFeedbackRow(
    await get("SELECT * FROM customer_feedback WHERE id = ?", [result.id]),
  );

  // Emit WebSocket event for new feedback
  const broadcast = getBroadcast();
  if (broadcast) {
    broadcast({ type: "NEW_FEEDBACK", payload: { id: result.id } });
  }

  res.status(201).json({
    id: row.id,
    view_token: viewToken,
    feedback: row,
  });
};

exports.fetchMyFeedback = async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (!entries.length) return res.json([]);

  const results = [];
  for (const entry of entries.slice(0, 50)) {
    const id = Number(entry?.id);
    const token = String(entry?.view_token || "");
    if (!id || !token) continue;
    const row = await get(
      `SELECT * FROM customer_feedback WHERE id = ? AND view_token = ?`,
      [id, token],
    );
    if (row) {
      const mapped = await mapFeedbackRow(row);
      results.push({
        ...mapped,
        view_token: token,
      });
    }
  }
  res.json(results);
};

exports.getFeedbackByToken = async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.query.view_token || "");
  if (!id || !token) throw createHttpError(400, "Invalid feedback access.");

  const row = await get(
    `SELECT * FROM customer_feedback WHERE id = ? AND view_token = ?`,
    [id, token],
  );
  if (!row) throw createHttpError(404, "Feedback not found.");

  const mapped = await mapFeedbackRow(row);
  res.json({ ...mapped, view_token: token });
};

exports.listFeedbackForManager = async (req, res) => {
  const status = req.query.status || "active";
  const from = req.query.from || null;
  const to = req.query.to || null;

  let sql = `SELECT * FROM customer_feedback WHERE 1=1`;
  const params = [];

  if (status === "archived") {
    sql += ` AND status = 'archived'`;
  } else if (status === "all") {
    /* no filter */
  } else {
    sql += ` AND status = 'active'`;
  }

  if (from) {
    sql += ` AND date(created_at) >= date(?)`;
    params.push(from);
  }
  if (to) {
    sql += ` AND date(created_at) <= date(?)`;
    params.push(to);
  }

  sql += ` ORDER BY created_at DESC, id DESC LIMIT 500`;

  const rows = await all(sql, params);
  const list = [];
  for (const row of rows) {
    list.push(stripTokenForManager(await mapFeedbackRow(row)));
  }
  res.json(list);
};

exports.getFeedbackDetailForManager = async (req, res) => {
  const id = Number(req.params.id);
  const row = await get("SELECT * FROM customer_feedback WHERE id = ?", [id]);
  if (!row) throw createHttpError(404, "Feedback not found.");
  res.json(stripTokenForManager(await mapFeedbackRow(row)));
};

exports.respondToFeedback = async (req, res) => {
  const id = Number(req.params.id);
  const response = String(req.body?.response || "").trim();
  if (!response) throw createHttpError(400, "Response text is required.");

  const badWords = validateFeedbackText([response]);
  if (badWords.length) {
    return res.status(400).json({
      error: "profanity",
      message: "Please remove offensive language from your response.",
      words: badWords,
    });
  }

  await run(
    `UPDATE customer_feedback SET manager_response = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [response, id],
  );
  const row = await get("SELECT * FROM customer_feedback WHERE id = ?", [id]);
  if (!row) throw createHttpError(404, "Feedback not found.");
  res.json(stripTokenForManager(await mapFeedbackRow(row)));
};

exports.archiveFeedback = async (req, res) => {
  const id = Number(req.params.id);
  await run(
    `UPDATE customer_feedback SET status = 'archived', archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id],
  );
  const row = await get("SELECT * FROM customer_feedback WHERE id = ?", [id]);
  if (!row) throw createHttpError(404, "Feedback not found.");
  res.json(stripTokenForManager(await mapFeedbackRow(row)));
};

exports.deleteFeedback = async (req, res) => {
  const id = Number(req.params.id);
  await run(`DELETE FROM customer_feedback_images WHERE feedback_id = ?`, [id]);
  await run(`DELETE FROM customer_feedback WHERE id = ?`, [id]);
  res.json({ success: true });
};

const fetchFeedbackInRange = async (from, to) => {
  let sql = `SELECT * FROM customer_feedback WHERE 1=1`;
  const params = [];
  if (from) {
    sql += ` AND date(created_at) >= date(?)`;
    params.push(from);
  }
  if (to) {
    sql += ` AND date(created_at) <= date(?)`;
    params.push(to);
  }
  sql += ` ORDER BY created_at ASC`;
  return all(sql, params);
};

exports.runAnalysis = async (req, res) => {
  const periodFrom = req.body?.from || req.query?.from || null;
  const periodTo = req.body?.to || req.query?.to || null;
  const useAI = req.body?.use_ai !== false; // Default to true unless explicitly disabled

  const current = await fetchFeedbackInRange(periodFrom, periodTo);

  let previous = [];
  if (periodFrom) {
    const prevEnd = new Date(periodFrom);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevEndStr = prevEnd.toISOString().slice(0, 10);
    const windowDays = periodTo
      ? Math.max(
          1,
          Math.ceil(
            (new Date(periodTo).getTime() - new Date(periodFrom).getTime()) / 86400000,
          ) + 1,
        )
      : 30;
    const prevStart = new Date(periodFrom);
    prevStart.setDate(prevStart.getDate() - windowDays);
    previous = await fetchFeedbackInRange(
      prevStart.toISOString().slice(0, 10),
      prevEndStr,
    );
  }

  let summary, findings;
  let analysisMethod = "rule_based";

  // Try AI analysis first if enabled
  if (useAI) {
    const aiAnalysisResult = await generateAIAnalysis(current, previous, periodFrom, periodTo);
    const aiFindingsResult = await generateAIFindings(current, previous);

    if (aiAnalysisResult.success && aiFindingsResult.success) {
      // Use AI-generated analysis
      summary = {
        period_from: periodFrom || null,
        period_to: periodTo || null,
        feedback_count: current.length,
        previous_period_count: previous.length,
        ai_analysis: aiAnalysisResult.analysis,
        overall_sentiment: "ai_generated",
      };

      findings = aiFindingsResult.findings.map((f, i) => ({
        id: i + 1, // Temporary ID, will be replaced by database ID
        category: "ai_generated",
        title: f.title,
        description: f.description,
        priority: f.priority,
        evidence: { method: "ai" },
      }));

      analysisMethod = "ai";
    } else {
      // Fall back to rule-based analysis
      console.log("AI analysis failed, falling back to rule-based:", aiAnalysisResult.reason);
      const ruleBased = analyzeFeedback(current, previous, periodFrom, periodTo);
      summary = ruleBased.summary;
      findings = ruleBased.findings;
    }
  } else {
    // Use rule-based analysis explicitly
    const ruleBased = analyzeFeedback(current, previous, periodFrom, periodTo);
    summary = ruleBased.summary;
    findings = ruleBased.findings;
  }

  const runResult = await run(
    `INSERT INTO feedback_analysis_runs (period_from, period_to, feedback_count, report_json, analysis_method) VALUES (?, ?, ?, ?, ?)`,
    [periodFrom, periodTo, current.length, JSON.stringify(summary), analysisMethod],
  );

  const insertedFindings = [];
  for (const f of findings) {
    const fr = await run(
      `INSERT INTO feedback_analysis_findings (run_id, category, title, description, priority, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        runResult.id,
        f.category,
        f.title,
        f.description,
        f.priority,
        JSON.stringify(f.evidence || {}),
      ],
    );
    insertedFindings.push({
      id: fr.id,
      run_id: runResult.id,
      ...f,
      status: "pending",
    });
  }

  res.status(201).json({
    run_id: runResult.id,
    summary,
    findings: insertedFindings,
    rating_dimensions: RATING_DIMS,
    analysis_method: analysisMethod,
  });

  // Emit WebSocket event for feedback analysis update
  const broadcast = getBroadcast();
  if (broadcast) {
    broadcast({ type: "FEEDBACK_ANALYSIS_UPDATE", payload: { run_id: runResult.id } });
  }
};

exports.getLatestAnalysis = async (req, res) => {
  const latestRun = await get(
    `SELECT * FROM feedback_analysis_runs ORDER BY created_at DESC, id DESC LIMIT 1`,
  );
  if (!latestRun) return res.json({ run: null, findings: [], summary: null });

  const findings = await all(
    `SELECT * FROM feedback_analysis_findings WHERE run_id = ? ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id`,
    [latestRun.id],
  );

  let summary = null;
  try {
    summary = JSON.parse(latestRun.report_json);
  } catch {
    summary = null;
  }

  res.json({
    run: {
      id: latestRun.id,
      period_from: latestRun.period_from,
      period_to: latestRun.period_to,
      feedback_count: latestRun.feedback_count,
      created_at: latestRun.created_at,
    },
    summary,
    findings: findings.map((f) => ({
      ...f,
      evidence: (() => {
        try {
          return JSON.parse(f.evidence_json || "{}");
        } catch {
          return {};
        }
      })(),
    })),
  });
};

exports.updateFindingStatus = async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!["accepted", "declined", "pending"].includes(status)) {
    throw createHttpError(400, "Status must be accepted, declined, or pending.");
  }
  await run(
    `UPDATE feedback_analysis_findings SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id],
  );
  const row = await get("SELECT * FROM feedback_analysis_findings WHERE id = ?", [id]);
  if (!row) throw createHttpError(404, "Finding not found.");
  res.json(row);
};

exports.deleteFinding = async (req, res) => {
  const id = Number(req.params.id);
  await run(`DELETE FROM feedback_analysis_findings WHERE id = ?`, [id]);
  res.json({ success: true });
};

exports.aiChat = async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: "Message is required" });
  }

  try {
    const contextData = {
      menu: await all("SELECT mi.id, mi.name, mi.price, c.name as category_name, mi.is_available, mi.is_popular FROM menu_items mi LEFT JOIN categories c ON mi.category_id = c.id ORDER BY c.name, mi.name"),
      orders_today: await all("SELECT id, status, payment_status, total_price FROM orders WHERE date(created_at) = date('now','localtime')"),
      orders_recent: await all("SELECT id, status, payment_status, total_price, created_at FROM orders WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 50"),
      feedback_summary: await all("SELECT id, comment, rating_staff, rating_app, rating_cleanliness, rating_food, rating_atmosphere, rating_value, status, created_at FROM customer_feedback ORDER BY created_at DESC LIMIT 30"),
      employees: await all("SELECT id, employee_id, name, department, employment_type FROM employees WHERE is_archived = 0"),
      inventory: await all("SELECT id, name, category, unit, current_stock, max_stock, low_stock_threshold_percent FROM inventory_items WHERE is_archived = 0"),
      tables: await all("SELECT id, table_number FROM tables"),
      settings: await get("SELECT value FROM restaurant_settings WHERE key = 'work_hours'"),
    };

    const messages = [{ role: "user", content: message }];
    const result = await generateChatResponse(messages, contextData);

    if (!result.success) {
      return res.status(503).json({ success: false, error: result.reason });
    }

    res.json({ success: true, response: result.response });
  } catch (error) {
    console.error("AI chat error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.setBroadcast = setBroadcast;
