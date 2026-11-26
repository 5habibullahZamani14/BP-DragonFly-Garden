const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();
const { createManagerIssueService } = require("./managerIssueService");

test("persists, deduplicates, acknowledges, and reopens manager issues", async () => {
  const db = new sqlite3.Database(":memory:");
  const service = createManagerIssueService(db);
  const events = [];
  service.setBroadcast((event) => events.push(event));

  try {
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE manager_system_issues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fingerprint TEXT NOT NULL UNIQUE,
          source TEXT NOT NULL,
          message TEXT NOT NULL,
          action_tab TEXT NOT NULL DEFAULT 'logs',
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          acknowledged_at DATETIME
        )`,
        (error) => error ? reject(error) : resolve()
      );
    });

    const first = await service.reportManagerIssue({
      fingerprint: "http:POST:/printers/test:503",
      source: "HTTP POST /management/printers/test",
      message: "Printer is offline",
      actionTab: "settings",
    });
    await service.reportManagerIssue({
      fingerprint: "http:POST:/printers/test:503",
      source: "HTTP POST /management/printers/test",
      message: "Printer is offline",
      actionTab: "settings",
    });
    assert.equal(events.length, 1);

    let activeIssues = await service.listManagerIssues();
    assert.equal(activeIssues.length, 1);
    assert.equal(activeIssues[0].id, first.id);
    assert.equal(activeIssues[0].occurrenceCount, 2);
    assert.equal(activeIssues[0].actionTab, "settings");

    assert.equal(await service.acknowledgeManagerIssue(first.id), true);
    assert.equal((await service.listManagerIssues()).length, 0);

    await service.reportManagerIssue({
      fingerprint: "http:POST:/printers/test:503",
      source: "HTTP POST /management/printers/test",
      message: "Printer is offline",
      actionTab: "settings",
    });
    activeIssues = await service.listManagerIssues();
    assert.equal(activeIssues.length, 1);
    assert.equal(activeIssues[0].occurrenceCount, 3);
    assert.equal(events.length, 3);
  } finally {
    await new Promise((resolve, reject) => {
      db.close((error) => error ? reject(error) : resolve());
    });
  }
});
