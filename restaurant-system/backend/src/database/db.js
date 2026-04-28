/*
 * Import the sqlite3 library with verbose mode enabled
 * This library allows us to interact with SQLite databases
 * Verbose mode provides detailed information about database operations for debugging
 */
const sqlite3 = require("sqlite3").verbose();
/*
 * Import the path module
 * This utility helps us work with file and directory paths
 */
const path = require("path");

/*
 * Construct the full file path to the SQLite database file
 * This creates an absolute path pointing to database.sqlite in the current directory
 */
const dbPath = path.resolve(__dirname, "database.sqlite");

/*
 * Initialize a connection to the SQLite database
 * If the database file doesn't exist, sqlite3 will create it automatically
 * The callback function runs when the connection attempt completes
 * (either successfully or with an error)
 */
const db = new sqlite3.Database(dbPath, (err) => {
  /*
   * Check if an error occurred during connection
   */
  if (err) {
    /*
     * If there was an error, print it to the console for debugging
     */
    console.error("Database error:", err);
  } else {
    /*
     * If the connection was successful, print a confirmation message
     */
    console.log("Connected to SQLite database");
  }
});

/*
 * Enable Write-Ahead Logging (WAL) mode for better database performance
 * WAL mode allows multiple readers to access the database while writing is happening,
 * which improves concurrency and overall performance
 */
db.run("PRAGMA journal_mode = WAL;");

/*
 * Export the database connection object
 * This allows other files to import and use this database connection
 * to perform queries and operations on the SQLite database
 */
module.exports = db;