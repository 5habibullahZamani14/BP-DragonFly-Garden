/*
 * db.js — SQLite database connection wrapper with reopen/close support.
 *
 * This module exposes a small wrapper around an internal sqlite3.Database
 * instance so callers can continue to call `db.run(...)`, `db.all(...)` and
 * `db.get(...)` while also allowing the application to close and reopen the
 * underlying connection during operations like a full restore.
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");

let _db = null;

const open = () => {
  return new Promise((resolve, reject) => {
    try {
      _db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error("Database open error:", err);
          return reject(err);
        }
        // Ensure WAL mode is set on open
        _db.run("PRAGMA journal_mode = WAL;", (pragErr) => {
          if (pragErr) {
            console.error("Failed to set journal_mode WAL:", pragErr);
            // Not fatal — resolve anyway with warning
          }
          console.log("Connected to SQLite database");
          resolve(true);
        });
      });
    } catch (err) {
      reject(err);
    }
  });
};

const close = () => {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve(true);
    _db.close((err) => {
      if (err) {
        console.error("Database close error:", err);
        return reject(err);
      }
      _db = null;
      console.log("Closed SQLite database connection");
      resolve(true);
    });
  });
};

// Immediately open on module load
open().catch((err) => {
  console.error("Failed to open database on startup:", err);
});

// Proxy methods to mimic sqlite3.Database API so existing code continues to work
const run = function (sql, params, cb) {
  if (typeof params === "function") {
    cb = params;
    params = [];
  }
  if (!_db) return cb ? cb(new Error("Database not open")) : null;
  return _db.run(sql, params || [], cb);
};

const all = function (sql, params, cb) {
  if (typeof params === "function") {
    cb = params;
    params = [];
  }
  if (!_db) return cb ? cb(new Error("Database not open")) : null;
  return _db.all(sql, params || [], cb);
};

const get = function (sql, params, cb) {
  if (typeof params === "function") {
    cb = params;
    params = [];
  }
  if (!_db) return cb ? cb(new Error("Database not open")) : null;
  return _db.get(sql, params || [], cb);
};

module.exports = {
  // low-level proxy methods compatible with sqlite3.Database usage
  run,
  all,
  get,
  // lifecycle
  open,
  close,
  // expose path for callers that need it
  dbPath,
};