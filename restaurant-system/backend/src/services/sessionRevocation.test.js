const assert = require("node:assert/strict");
const test = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const { revokeStoredSession } = require("./sessionRevocation");

const createDatabase = () =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(":memory:", (error) => {
      if (error) return reject(error);
      db.run(
        "CREATE TABLE restaurant_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        (createError) => createError ? reject(createError) : resolve(db),
      );
    });
  });

const readStoredValue = (db, key) =>
  new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = ?", [key], (error, row) => {
      if (error) reject(error);
      else resolve(row?.value || null);
    });
  });

test("a stale logout cannot revoke a newer manager login session", async () => {
  const db = await createDatabase();
  await new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO restaurant_settings (key, value) VALUES (?, ?)",
      ["manager_session", JSON.stringify({ sessionId: "new-session" })],
      (error) => error ? reject(error) : resolve(),
    );
  });

  const revoked = await revokeStoredSession(db, "manager_session", "old-session");

  assert.equal(revoked, false);
  assert.equal(await readStoredValue(db, "manager_session"), JSON.stringify({ sessionId: "new-session" }));
  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
});

test("logout revokes and reports only its matching session", async () => {
  const db = await createDatabase();
  await new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO restaurant_settings (key, value) VALUES (?, ?)",
      ["payment_counter_session", JSON.stringify({ sessionId: "current-session" })],
      (error) => error ? reject(error) : resolve(),
    );
  });

  assert.equal(await revokeStoredSession(db, "payment_counter_session", "current-session"), true);
  assert.equal(await readStoredValue(db, "payment_counter_session"), null);
  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
});
