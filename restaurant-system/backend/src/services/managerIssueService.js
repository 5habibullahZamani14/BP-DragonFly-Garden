const { redactText } = require("../middleware/secretRedaction");

const createManagerIssueService = (db) => {
  let broadcast = () => {};

  const setBroadcast = (broadcastFn) => {
    broadcast = typeof broadcastFn === "function" ? broadcastFn : () => {};
  };

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve(this);
      });
    });

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
    });

  const mapIssue = (row) => ({
    id: row.id,
    source: row.source,
    message: row.message,
    actionTab: row.action_tab,
    occurrenceCount: row.occurrence_count,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  });

  const reportManagerIssue = async ({ fingerprint, source, message, actionTab }) => {
    const safeFingerprint = redactText(String(fingerprint)).slice(0, 200);
    const safeSource = redactText(String(source)).slice(0, 200);
    const safeMessage = redactText(String(message)).slice(0, 1000);
    const safeActionTab = ["overview", "settings", "employees", "inventory", "logs", "tables", "finance", "menu", "feedback"].includes(actionTab)
      ? actionTab
      : "logs";
    const previous = await get(
      "SELECT acknowledged_at FROM manager_system_issues WHERE fingerprint = ?",
      [safeFingerprint]
    );
    const shouldBroadcast = !previous || previous.acknowledged_at !== null;

    await run(
      `INSERT INTO manager_system_issues
       (fingerprint, source, message, action_tab)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(fingerprint) DO UPDATE SET
       source = excluded.source,
       message = excluded.message,
       action_tab = excluded.action_tab,
       occurrence_count = manager_system_issues.occurrence_count + 1,
       created_at = CASE
         WHEN manager_system_issues.acknowledged_at IS NOT NULL THEN CURRENT_TIMESTAMP
         ELSE manager_system_issues.created_at
       END,
       last_seen_at = CURRENT_TIMESTAMP,
       acknowledged_at = NULL`,
      [safeFingerprint, safeSource, safeMessage, safeActionTab]
    );

    const row = await get(
      `SELECT id, source, message, action_tab, occurrence_count, created_at, last_seen_at
     FROM manager_system_issues
     WHERE fingerprint = ?`,
      [safeFingerprint]
    );
    if (!row) throw new Error("The manager issue was saved but could not be loaded.");

    const issue = mapIssue(row);
    if (shouldBroadcast) broadcast({ type: "MANAGER_ISSUE_UPDATED", payload: issue });
    return issue;
  };

  const listManagerIssues = async () => {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, source, message, action_tab, occurrence_count, created_at, last_seen_at
       FROM manager_system_issues
       WHERE acknowledged_at IS NULL
       ORDER BY last_seen_at DESC
       LIMIT 100`,
        (error, result) => error ? reject(error) : resolve(result)
      );
    });
    return rows.map(mapIssue);
  };

  const acknowledgeManagerIssue = async (id) => {
    const result = await run(
      `UPDATE manager_system_issues
     SET acknowledged_at = CURRENT_TIMESTAMP
     WHERE id = ? AND acknowledged_at IS NULL`,
      [id]
    );
    if (!result.changes) return false;
    broadcast({ type: "MANAGER_ISSUE_UPDATED", payload: { id, acknowledged: true } });
    return true;
  };

  return { acknowledgeManagerIssue, listManagerIssues, reportManagerIssue, setBroadcast };
};

let defaultService;
const getDefaultService = () => {
  if (!defaultService) defaultService = createManagerIssueService(require("../database/db"));
  return defaultService;
};

module.exports = {
  acknowledgeManagerIssue: (...args) => getDefaultService().acknowledgeManagerIssue(...args),
  createManagerIssueService,
  listManagerIssues: (...args) => getDefaultService().listManagerIssues(...args),
  reportManagerIssue: (...args) => getDefaultService().reportManagerIssue(...args),
  setBroadcast: (...args) => getDefaultService().setBroadcast(...args),
};
