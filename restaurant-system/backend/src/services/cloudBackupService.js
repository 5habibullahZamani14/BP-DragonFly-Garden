const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

/*
 * cloudBackupService.js
 * 
 * Handles the secure upload of the SQLite database to a cloud storage provider
 * (like AWS S3 or Google Cloud Storage) at 3:00 AM.
 * 
 * To fully activate this, the restaurant manager must provide their AWS/GCP
 * credentials in the .env file. If credentials are missing, this service gracefully
 * logs a warning and skips the upload.
 * 
 * Updated with circuit breaker pattern for resilience.
 */

const AWS = require("aws-sdk");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { withCircuitBreaker } = require("./circuitBreaker");

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

const ensurePrivateDirectory = (directoryPath) => {
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(directoryPath, 0o700);
};

const validateBackupEncryptionKey = (base64Key) => {
  if (!base64Key) throw new Error("BACKUP_ENC_KEY not configured; cannot create backups");
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENC_KEY must be 32 bytes (base64-encoded)");
  return key;
};

/**
 * Internal upload function (not wrapped with circuit breaker).
 * This is the actual implementation that gets wrapped.
 */
const _uploadToCloud = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found at ${filePath}`);
  }

  const s3 = createS3Client();
  console.log(`[Cloud Backup] Authenticating with secure cloud provider...`);
  await s3.upload({
    Bucket: process.env.B2_BUCKET_NAME,
    Key: path.basename(filePath),
    Body: fs.createReadStream(filePath),
  }).promise();
  console.log(`[Cloud Backup] Successfully uploaded ${path.basename(filePath)} to secure cloud storage.`);
  return true;
};

/**
 * uploadToCloud - Wrapped with circuit breaker for resilience.
 * The circuit breaker prevents repeated failed upload attempts and
 * allows the service to recover gracefully.
 */
const uploadToCloud = async (filePath) => {
  const breaker = withCircuitBreaker('cloudBackup', _uploadToCloud, {
    failureThreshold: 3,
    timeoutMs: 120000,
    successThreshold: 2
  });
  
  try {
    return await breaker(filePath);
  } catch (error) {
    if (error.message.includes('Circuit is OPEN')) {
      console.error("[Cloud Backup] Circuit breaker is OPEN - upload temporarily unavailable");
      return {
        success: false,
        message: 'Cloud backup service temporarily unavailable. Please try again later.',
        error: error.message,
        circuitState: 'OPEN'
      };
    }
    throw error;
  }
};

// Encrypt a file using AES-256-GCM. The provided key must be a base64-encoded 32-byte key.
const encryptFile = (inputPath, outputPath, base64Key) => {
  const key = validateBackupEncryptionKey(base64Key);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const input = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Output format: [iv (12)][authTag (16)][ciphertext]
  const out = Buffer.concat([iv, authTag, encrypted]);
  fs.writeFileSync(outputPath, out, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(outputPath, 0o600);
};

const decryptFile = (inputPath, outputPath, base64Key) => {
  const key = validateBackupEncryptionKey(base64Key);

  const data = fs.readFileSync(inputPath);
  const iv = data.slice(0, 12);
  const authTag = data.slice(12, 28);
  const ciphertext = data.slice(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(outputPath, decrypted, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(outputPath, 0o600);
};

const listCloudBackups = async () => {
  const s3 = createS3Client();
  const data = await s3
    .listObjectsV2({ Bucket: process.env.B2_BUCKET_NAME, Prefix: "" })
    .promise();

  if (!data.Contents) return [];

  return data.Contents
    .filter((item) => item.Key && (item.Key.endsWith(".sqlite") || item.Key.endsWith(".tar.gz") || item.Key.endsWith(".tar.gz.enc")))
    .map((item) => ({
      filename: item.Key,
      size: item.Size || 0,
      created_at: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const downloadCloudBackup = async (key, destinationPath) => {
  const s3 = createS3Client();
  ensurePrivateDirectory(path.dirname(destinationPath));
  return new Promise((resolve, reject) => {
    const readStream = s3.getObject({ Bucket: process.env.B2_BUCKET_NAME, Key: key }).createReadStream();
    const writeStream = fs.createWriteStream(destinationPath, { mode: 0o600 });

    readStream.on("error", reject);
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);

    readStream.pipe(writeStream);
  });
};

const createLocalBackupOnly = async (backupDir) => {
  const encKey = process.env.BACKUP_ENC_KEY || null;
  validateBackupEncryptionKey(encKey);
  ensurePrivateDirectory(backupDir);

  const dbPath = path.join(__dirname, "../database/database.sqlite");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tarName = `full_backup_${timestamp}.tar.gz`;
  const tarPath = path.join(backupDir, tarName);

  const toInclude = [];
  if (fs.existsSync(dbPath)) toInclude.push(dbPath);

  const frontendMenuImages = path.resolve(__dirname, "../../../frontend/public/menu-images");
  const frontendFeedbackImages = path.resolve(__dirname, "../../../frontend/public/feedback-images");
  if (fs.existsSync(frontendMenuImages)) toInclude.push(frontendMenuImages);
  if (fs.existsSync(frontendFeedbackImages)) toInclude.push(frontendFeedbackImages);

  const uploadsDir = path.resolve(__dirname, "../../uploads");
  if (fs.existsSync(uploadsDir)) toInclude.push(uploadsDir);

  if (toInclude.length === 0) {
    console.warn("[Cloud Backup] Nothing found to include in local backup. Aborting.");
    return;
  }

  try {
    const args = ["-czf", tarPath, ...toInclude];
    const tar = spawnSync("tar", args, { stdio: "inherit" });
    if (tar.error) throw tar.error;
    if (tar.status !== 0) throw new Error(`tar exited with code ${tar.status}`);

    if (process.platform !== "win32") fs.chmodSync(tarPath, 0o600);
    const encPath = `${tarPath}.enc`;
    encryptFile(tarPath, encPath, encKey);
    cleanupOldBackups(backupDir);
  } finally {
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
  }
};

const uploadLatestLocalBackupToCloud = async (backupDir) => {
  const latestLocal = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith(".tar.gz.enc") || f.endsWith(".tar.gz"))
    .map((f) => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time)[0];

  if (!latestLocal) {
    console.log("[Cloud Backup] No local backup archive was found to upload to Backblaze.");
    return;
  }

  const filePath = path.join(backupDir, latestLocal.name);
  if (!fs.existsSync(filePath)) return;

  const encKey = process.env.BACKUP_ENC_KEY || null;
  if (filePath.endsWith(".tar.gz") && process.platform !== "win32") {
    fs.chmodSync(filePath, 0o600);
  }
  if (!encKey && filePath.endsWith(".tar.gz")) {
    console.error("[Cloud Backup] BACKUP_ENC_KEY not configured; refusing to upload an unencrypted backup.");
    return;
  }

  if (filePath.endsWith(".tar.gz")) {
    const encPath = `${filePath}.enc`;
    encryptFile(filePath, encPath, encKey);
    const uploaded = await uploadToCloud(encPath);
    if (uploaded === true) await pruneExpiredCloudBackups();
    try { fs.unlinkSync(encPath); } catch (e) {}
    return;
  }

  const uploaded = await uploadToCloud(filePath);
  if (uploaded === true) await pruneExpiredCloudBackups();
};

const pruneExpiredCloudBackups = async (s3Client, now = Date.now()) => {
  const configuredDays = process.env.B2_BACKUP_RETENTION_DAYS?.trim();
  if (!configuredDays) return 0;
  if (!/^\d+$/.test(configuredDays) || Number(configuredDays) < 1 || Number(configuredDays) > 3650) {
    throw new Error("B2_BACKUP_RETENTION_DAYS must be a whole number between 1 and 3650.");
  }

  const bucket = process.env.B2_BUCKET_NAME;
  const s3 = s3Client || createS3Client();
  const backups = [];
  let continuationToken;
  do {
    const page = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: "full_backup_",
      ContinuationToken: continuationToken,
    }).promise();
    backups.push(...(page.Contents || []).filter((item) =>
      item.Key &&
      item.Key.startsWith("full_backup_") &&
      (item.Key.endsWith(".tar.gz.enc") || item.Key.endsWith(".tar.gz")) &&
      item.LastModified
    ));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  if (backups.length < 2) return 0;

  const newest = backups.reduce((latest, item) =>
    new Date(item.LastModified).getTime() > new Date(latest.LastModified).getTime() ? item : latest
  );
  const cutoff = now - Number(configuredDays) * 24 * 60 * 60 * 1000;
  const expiredKeys = backups
    .filter((item) => item.Key !== newest.Key && new Date(item.LastModified).getTime() < cutoff)
    .map((item) => ({ Key: item.Key }));

  for (let index = 0; index < expiredKeys.length; index += 1000) {
    const response = await s3.deleteObjects({
      Bucket: bucket,
      Delete: { Objects: expiredKeys.slice(index, index + 1000), Quiet: true },
    }).promise();
    if (response.Errors?.length) {
      throw new Error(`Cloud backup retention failed to delete ${response.Errors.length} expired object(s).`);
    }
  }

  if (expiredKeys.length) {
    console.log(`[Cloud Backup] Removed ${expiredKeys.length} remote backup(s) older than ${configuredDays} days.`);
  }
  return expiredKeys.length;
};

const executeNightlyCloudBackup = async () => {
  const encKey = process.env.BACKUP_ENC_KEY || null;
  if (!encKey) {
    console.error("[Cloud Backup] BACKUP_ENC_KEY not configured; refusing to create an unencrypted backup.");
    return;
  }
  validateBackupEncryptionKey(encKey);

  const dbPath = path.join(__dirname, "../database/database.sqlite");
  const backupDir = path.join(__dirname, "../../../full-auto-backup");

  ensurePrivateDirectory(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tarName = `full_backup_${timestamp}.tar.gz`;
  const tarPath = path.join(backupDir, tarName);
  const encPath = `${tarPath}.enc`;

  // Directories and files to include in a full backup (data only, not source code)
  const toInclude = [];
  // SQLite DB
  if (fs.existsSync(dbPath)) toInclude.push(dbPath);

  // Uploaded images used by the app (frontend public directories)
  const frontendMenuImages = path.resolve(__dirname, "../../../frontend/public/menu-images");
  const frontendFeedbackImages = path.resolve(__dirname, "../../../frontend/public/feedback-images");
  if (fs.existsSync(frontendMenuImages)) toInclude.push(frontendMenuImages);
  if (fs.existsSync(frontendFeedbackImages)) toInclude.push(frontendFeedbackImages);

  // Any additional data directories that look relevant
  const uploadsDir = path.resolve(__dirname, "../../uploads");
  if (fs.existsSync(uploadsDir)) toInclude.push(uploadsDir);

  try {
    console.log("[Cloud Backup] Creating comprehensive tar.gz snapshot for cloud upload...");

    if (toInclude.length === 0) {
      console.warn("[Cloud Backup] Nothing found to include in backup. Aborting.");
      return;
    }

    // Use system tar command (available on Linux/Raspberry Pi)
    const args = ["-czf", tarPath, ...toInclude];
    const tar = spawnSync("tar", args, { stdio: "inherit" });
    if (tar.error) {
      throw tar.error;
    }
    if (tar.status !== 0) {
      throw new Error(`tar exited with code ${tar.status}`);
    }
    if (process.platform !== "win32") fs.chmodSync(tarPath, 0o600);

    // Never leave an unencrypted backup on disk.
    encryptFile(tarPath, encPath, encKey);

    // Upload encrypted archive
    const uploaded = await uploadToCloud(encPath);
    if (uploaded === true) await pruneExpiredCloudBackups();

    // Clean up old local backups (both .tar.gz.enc and older patterns)
    cleanupOldBackups(backupDir);
  } catch (error) {
    console.error("[Cloud Backup] Failed to execute nightly cloud backup:", error);
  } finally {
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
  }
};

const cleanupOldBackups = (backupDir) => {
  try {
    const files = fs.readdirSync(backupDir).filter((f) => f.startsWith("db_backup_") || f.startsWith("full_backup_") || f.endsWith(".tar.gz.enc"));
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
const getLatestRemoteBackupTime = async () => {
  try {
    const s3 = createS3Client();
    const res = await s3.listObjectsV2({ Bucket: process.env.B2_BUCKET_NAME, Prefix: "full_backup_" }).promise();
    if (!res.Contents || res.Contents.length === 0) return 0;
    const latest = res.Contents.reduce((acc, cur) => {
      const t = cur.LastModified ? new Date(cur.LastModified).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);
    return latest;
  } catch (err) {
    console.warn('[Cloud Backup] Could not query remote backups:', err && err.message ? err.message : err);
    return 0;
  }
};

const getLatestLocalBackupTime = (backupDir) => {
  if (!fs.existsSync(backupDir)) return 0;
  const files = fs.readdirSync(backupDir).filter((f) => f.startsWith("full_backup_") || f.startsWith("db_backup_") || f.endsWith(".tar.gz.enc")).map((f) => ({
    name: f,
    time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
  })).sort((a, b) => b.time - a.time);
  return files.length > 0 ? files[0].time : 0;
};

const ensureCloudBackupUpToDate = async () => {
  const backupDir = path.join(__dirname, "../../../full-auto-backup");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (process.env.FORCE_BACKUP_ON_STARTUP === "1" || process.env.FORCE_BACKUP_ON_STARTUP === "true") {
    console.log("[Cloud Backup] FORCE_BACKUP_ON_STARTUP is enabled. Creating a fresh local backup and syncing it to Backblaze immediately.");
    await createLocalBackupOnly(backupDir);
    await uploadLatestLocalBackupToCloud(backupDir);
    return;
  }

  const now = new Date();
  const threeAM = new Date(now);
  threeAM.setHours(3, 0, 0, 0);
  if (now < threeAM) {
    threeAM.setDate(threeAM.getDate() - 1);
  }

  const localLatest = getLatestLocalBackupTime(backupDir);
  const remoteLatest = await getLatestRemoteBackupTime();

  const localIsCurrent = localLatest > 0 && localLatest >= threeAM.getTime();
  const remoteIsCurrent = remoteLatest > 0 && remoteLatest >= threeAM.getTime();

  if (!localIsCurrent && !remoteIsCurrent) {
    console.log("[Cloud Backup] No up-to-date backup found locally or in Backblaze. Creating a local backup and uploading it to Backblaze.");
    await createLocalBackupOnly(backupDir);
    await uploadLatestLocalBackupToCloud(backupDir);
    return;
  }

  if (!localIsCurrent && remoteIsCurrent) {
    console.log("[Cloud Backup] Backblaze has an up-to-date backup, but local copy is missing. Creating a local backup only.");
    await createLocalBackupOnly(backupDir);
    return;
  }

  if (localIsCurrent && !remoteIsCurrent) {
    console.log("[Cloud Backup] Local copy is up to date, but Backblaze copy is missing or stale. Uploading to Backblaze only.");
    await uploadLatestLocalBackupToCloud(backupDir);
    return;
  }

  console.log("[Cloud Backup] Up-to-date local and cloud backups already exist.");
};

module.exports = { 
  executeNightlyCloudBackup, 
  uploadToCloud, 
  ensureCloudBackupUpToDate, 
  listCloudBackups, 
  downloadCloudBackup, 
  decryptFile, 
  encryptFile,
  createLocalBackupOnly,
  uploadLatestLocalBackupToCloud,
  pruneExpiredCloudBackups,
  downloadAndDecryptBackup: async (keyName, destinationPath) => {
    const tmpDir = path.join(__dirname, "../../../full-auto-backup");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const encLocalPath = path.join(tmpDir, path.basename(keyName));
    await downloadCloudBackup(keyName, encLocalPath);
    const decTarPath = encLocalPath.replace(/\.enc$/, "");
    decryptFile(encLocalPath, decTarPath, process.env.BACKUP_ENC_KEY);
    // Caller may extract the returned tar.gz path
    return decTarPath;
  }
};
