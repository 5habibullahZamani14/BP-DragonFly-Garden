const fs = require("fs");
const path = require("path");

/*
 * cloudBackupService.js
 * 
 * Handles the secure upload of the SQLite database to a cloud storage provider
 * (like AWS S3 or Google Cloud Storage) at 3:00 AM.
 * 
 * To fully activate this, the restaurant manager must provide their AWS/GCP
 * credentials in the .env file. If credentials are missing, this service gracefully
 * logs a warning and skips the upload.
 */

const AWS = require("aws-sdk");

const createS3Client = () => {
  if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY || !process.env.B2_ENDPOINT || !process.env.B2_BUCKET_NAME) {
    throw new Error("Backblaze cloud backup is not configured. Missing B2 credentials.");
  }

  const endpoint = new AWS.Endpoint(process.env.B2_ENDPOINT);
  return new AWS.S3({
    endpoint,
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
    s3ForcePathStyle: true,
  });
};

const uploadToCloud = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found at ${filePath}`);
  }

  try {
    const s3 = createS3Client();
    console.log(`[Cloud Backup] Authenticating with secure cloud provider...`);
    await s3.upload({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: path.basename(filePath),
      Body: fs.createReadStream(filePath),
    }).promise();
    console.log(`[Cloud Backup] Successfully uploaded ${path.basename(filePath)} to secure cloud storage.`);
    return true;
  } catch (error) {
    console.error("[Cloud Backup] Cloud upload failed:", error);
    throw error;
  }
};

const listCloudBackups = async () => {
  const s3 = createS3Client();
  const data = await s3
    .listObjectsV2({ Bucket: process.env.B2_BUCKET_NAME, Prefix: "" })
    .promise();

  if (!data.Contents) return [];

  return data.Contents
    .filter((item) => item.Key && item.Key.endsWith(".sqlite"))
    .map((item) => ({
      filename: item.Key,
      size: item.Size || 0,
      created_at: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const downloadCloudBackup = async (key, destinationPath) => {
  const s3 = createS3Client();
  return new Promise((resolve, reject) => {
    const readStream = s3.getObject({ Bucket: process.env.B2_BUCKET_NAME, Key: key }).createReadStream();
    const writeStream = fs.createWriteStream(destinationPath);

    readStream.on("error", reject);
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);

    readStream.pipe(writeStream);
  });
};

const executeNightlyCloudBackup = async () => {
  const dbPath = path.join(__dirname, "../database/database.sqlite");
  const backupDir = path.join(__dirname, "../../../backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `db_backup_${timestamp}.sqlite`);

  try {
    console.log("[Cloud Backup] Creating snapshot for cloud upload...");
    fs.copyFileSync(dbPath, backupFile);
    await uploadToCloud(backupFile);

    // Clean up old local backups to enforce the 7-day rolling window
    cleanupOldBackups(backupDir);
  } catch (error) {
    console.error("[Cloud Backup] Failed to execute nightly cloud backup:", error);
  }
};

const cleanupOldBackups = (backupDir) => {
  try {
    const files = fs.readdirSync(backupDir).filter((f) => f.startsWith("db_backup_"));
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > SEVEN_DAYS_MS) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Cloud Backup] Cleaned up ${deletedCount} old backup(s) to maintain the 7-day rolling window.`);
    }
  } catch (err) {
    console.error("[Cloud Backup] Failed to clean up old backups:", err);
  }
};

/* 
 * This checks if a backup has already run today (since 3:00 AM). 
 * If not, it executes it immediately. This handles the scenario where 
 * the Raspberry Pi or server was turned off overnight.
 */
const ensureCloudBackupUpToDate = async () => {
  const backupDir = path.join(__dirname, "../../../backups");
  if (!fs.existsSync(backupDir)) return executeNightlyCloudBackup();

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("db_backup_"))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  const now = new Date();

  const threeAM = new Date(now);
  threeAM.setHours(3, 0, 0, 0);

  if (now < threeAM) {
    threeAM.setDate(threeAM.getDate() - 1);
  }

  const latestBackupTime = files.length > 0 ? files[0].time : 0;

  if (latestBackupTime < threeAM.getTime()) {
    console.log("[Cloud Backup] System missed the 3:00 AM backup. Running catch-up backup now...");
    await executeNightlyCloudBackup();
  } else {
    console.log("[Cloud Backup] Backup is up to date.");
  }
};

module.exports = { executeNightlyCloudBackup, uploadToCloud, ensureCloudBackupUpToDate, listCloudBackups, downloadCloudBackup };
