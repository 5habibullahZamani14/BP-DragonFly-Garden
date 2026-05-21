require("dotenv").config();
const fs = require("fs");
const path = require("path");
const AWS = require("aws-sdk");

/*
 * restoreBackup.js
 * 
 * Run this script from the terminal to manually restore the latest database 
 * backup from your Backblaze B2 bucket.
 * 
 * Usage: node src/restoreBackup.js
 */

const restoreLatestBackup = async () => {
  if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY || !process.env.B2_ENDPOINT || !process.env.B2_BUCKET_NAME) {
    console.error("❌ Error: Missing Backblaze credentials in .env file.");
    process.exit(1);
  }

  console.log("🔄 Connecting to Backblaze B2...");
  const ep = new AWS.Endpoint(process.env.B2_ENDPOINT);
  const s3 = new AWS.S3({
    endpoint: ep,
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  });

  try {
    // 1. Fetch list of backups from the bucket
    console.log(`📂 Scanning bucket '${process.env.B2_BUCKET_NAME}' for backups...`);
    const data = await s3.listObjectsV2({ Bucket: process.env.B2_BUCKET_NAME }).promise();
    
    if (!data.Contents || data.Contents.length === 0) {
      console.error("❌ No backup files found in the bucket.");
      process.exit(1);
    }

    // 2. Sort to find the latest backup by LastModified date
    const backups = data.Contents.sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime());
    const latestBackupKey = backups[0].Key;
    
    console.log(`✅ Found latest backup: ${latestBackupKey} (Uploaded on ${backups[0].LastModified.toLocaleString()})`);

    // 3. Download the backup
    const dbPath = path.join(__dirname, "database", "database.sqlite");
    
    // Optional: Backup the current local corrupted DB just in case
    if (fs.existsSync(dbPath)) {
      const corruptBackupPath = path.join(__dirname, "database", `corrupt_backup_${Date.now()}.sqlite`);
      fs.copyFileSync(dbPath, corruptBackupPath);
      console.log(`⚠️  Backed up current local database to: ${path.basename(corruptBackupPath)}`);
    }

    console.log(`⬇️  Downloading database from cloud...`);
    const file = fs.createWriteStream(dbPath);
    
    const stream = s3.getObject({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: latestBackupKey
    }).createReadStream();
    
    stream.pipe(file);
    
    file.on('finish', () => {
      console.log("🎉 Restore complete! You can now restart your Node.js server.");
      process.exit(0);
    });

    stream.on('error', (err) => {
      console.error("❌ Failed to download backup:", err.message);
      process.exit(1);
    });

  } catch (error) {
    console.error("❌ Error connecting to Backblaze:", error.message);
    process.exit(1);
  }
};

restoreLatestBackup();
