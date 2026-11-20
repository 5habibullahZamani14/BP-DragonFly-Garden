const assert = require("node:assert/strict");
const test = require("node:test");
const sqlite3 = require("sqlite3").verbose();

const memoryDb = new sqlite3.Database(":memory:");
const databaseModule = require.resolve("../database/db");
require.cache[databaseModule] = {
  id: databaseModule,
  filename: databaseModule,
  loaded: true,
  exports: {
    run: (...args) => memoryDb.run(...args),
    get: (...args) => memoryDb.get(...args),
    all: (...args) => memoryDb.all(...args),
  },
};

const feedbackController = require("./feedbackController");

const initializeSchema = () =>
  new Promise((resolve, reject) => {
    memoryDb.exec(
      `CREATE TABLE customer_feedback (
         id INTEGER PRIMARY KEY,
         view_token TEXT NOT NULL,
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
         status TEXT NOT NULL,
         manager_response TEXT,
         responded_at TEXT,
         created_at TEXT,
         archived_at TEXT
       );
       CREATE TABLE customer_feedback_images (
         id INTEGER PRIMARY KEY,
         feedback_id INTEGER,
         image_url TEXT,
         display_order INTEGER
       );
       CREATE TABLE customer_feedback_access_sessions (
         id TEXT PRIMARY KEY,
         expires_at INTEGER NOT NULL
       );
       CREATE TABLE customer_feedback_access_entries (
         session_id TEXT NOT NULL,
         feedback_id INTEGER NOT NULL,
         PRIMARY KEY (session_id, feedback_id)
       );
       INSERT INTO customer_feedback
         (id, view_token, sender_name, comment, suggestion_tags, status, created_at)
       VALUES
         (1, 'legacy-feedback-secret', 'Guest', 'Good service', '[]', 'active', CURRENT_TIMESTAMP);`,
      (error) => error ? reject(error) : resolve(),
    );
  });

const createResponse = () => {
  const headers = {};
  return {
    headers,
    body: undefined,
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    set(name, value) {
      headers[name] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
};

test("legacy feedback references migrate to HttpOnly sessions and no longer return tokens", async () => {
  await initializeSchema();

  const migrationResponse = createResponse();
  await feedbackController.fetchMyFeedback(
    { headers: {}, body: { entries: [{ id: 1, view_token: "legacy-feedback-secret" }] } },
    migrationResponse,
  );

  assert.equal(migrationResponse.body.length, 1);
  assert.equal("view_token" in migrationResponse.body[0], false);
  assert.match(migrationResponse.headers["Set-Cookie"], /^dfg_feedback_session=/);
  assert.match(migrationResponse.headers["Set-Cookie"], /HttpOnly/);

  const cookie = migrationResponse.headers["Set-Cookie"].split(";")[0];
  const sessionResponse = createResponse();
  await feedbackController.fetchMyFeedback(
    { headers: { cookie }, body: { entries: [{ id: 1 }] } },
    sessionResponse,
  );

  assert.equal(sessionResponse.body.length, 1);
  assert.equal("view_token" in sessionResponse.body[0], false);
  assert.equal(sessionResponse.headers["Cache-Control"], "no-store");
});

test("feedback sessions cannot access feedback that was not linked to the session", async () => {
  const response = createResponse();
  await feedbackController.fetchMyFeedback(
    { headers: { cookie: "dfg_feedback_session=unrelated-session" }, body: { entries: [{ id: 1 }] } },
    response,
  );

  assert.deepEqual(response.body, []);
});
