const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'src', 'database', 'database.sqlite');
const backupDir = path.join(__dirname, 'backups');

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
const backupPath = path.join(backupDir, 'test_backup.sqlite');

try {
  // Test backup
  fs.copyFileSync(dbPath, backupPath);
  console.log("Backup successful");
  
  // Test restore (overwrite db while running)
  const db = require('./src/database/db'); // opens connection
  
  setTimeout(() => {
    try {
      fs.copyFileSync(backupPath, dbPath);
      console.log("Restore successful");
      process.exit(0);
    } catch(err) {
      console.error("Restore failed:", err);
      process.exit(1);
    }
  }, 1000);
  
} catch(err) {
  console.error("Failed:", err);
}
