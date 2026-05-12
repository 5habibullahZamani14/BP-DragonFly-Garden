/*
 * db.js — SQLite database connection.
 *
 * This module opens a single connection to the SQLite database file and
 * exports that connection so every other module in the backend can share it.
 * Using one shared connection is the right approach for SQLite because the
 * database is a single file — there is no connection pooling benefit, and
 * sharing avoids "database is locked" errors that can happen when multiple
 * connections try to write at the same time.
 */

/*
 * sqlite3 is the Node.js driver for SQLite. I enable "verbose" mode so that
 * any internal sqlite3 errors are reported with full stack traces, which makes
 * debugging much easier during development.
 */
const sqlite3 = require("sqlite3").verbose();

/* The built-in path module helps construct the absolute path to the database file. */
const path = require("path");

/*
 * Build the full path to the database file. __dirname is the directory where
 * this file (db.js) lives, so the database file ends up in the same folder:
 * restaurant-system/backend/src/database/database.sqlite
 */
const dbPath = path.resolve(__dirname, "database.sqlite");

/*
 * Open the database. SQLite creates the file automatically if it does not
 * already exist, so no manual setup is needed before the first run.
 * The callback runs once the connection is established (or has failed).
 */
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    /* Something went wrong — log it so the problem is visible on startup. */
    console.error("Database error:", err);
  } else {
    console.log("Connected to SQLite database");
  }
});

/*
 * Enable Write-Ahead Logging (WAL) mode. By default, SQLite uses a rollback
 * journal, which means only one connection can access the file at a time.
 * WAL mode allows readers and one writer to operate concurrently, which
 * improves performance noticeably when the kitchen, payment counter, and
 * customer views are all querying the database at the same time.
 */
db.run("PRAGMA journal_mode = WAL;");

/*
 * Export the connection object. Every controller and utility that needs to
 * run a query imports this module and uses the same db instance.
 */
module.exports = db;