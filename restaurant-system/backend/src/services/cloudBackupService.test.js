const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createLocalBackupOnly, pruneExpiredCloudBackups } = require("./cloudBackupService");

const originalRetentionDays = process.env.B2_BACKUP_RETENTION_DAYS;
const originalBucket = process.env.B2_BUCKET_NAME;
const originalEncryptionKey = process.env.BACKUP_ENC_KEY;

test.afterEach(() => {
  if (originalRetentionDays === undefined) delete process.env.B2_BACKUP_RETENTION_DAYS;
  else process.env.B2_BACKUP_RETENTION_DAYS = originalRetentionDays;
  if (originalBucket === undefined) delete process.env.B2_BUCKET_NAME;
  else process.env.B2_BUCKET_NAME = originalBucket;
  if (originalEncryptionKey === undefined) delete process.env.BACKUP_ENC_KEY;
  else process.env.BACKUP_ENC_KEY = originalEncryptionKey;
});

test("cloud retention is disabled unless an explicit period is configured", async () => {
  delete process.env.B2_BACKUP_RETENTION_DAYS;
  let listCalls = 0;
  const s3 = {
    listObjectsV2() {
      listCalls += 1;
      return { promise: async () => ({ Contents: [] }) };
    },
  };

  assert.equal(await pruneExpiredCloudBackups(s3), 0);
  assert.equal(listCalls, 0);
});

test("cloud retention deletes expired backups but preserves the newest backup", async () => {
  process.env.B2_BACKUP_RETENTION_DAYS = "7";
  process.env.B2_BUCKET_NAME = "test-backups";
  const now = Date.parse("2026-11-26T00:00:00.000Z");
  const deletedRequests = [];
  const s3 = {
    listObjectsV2() {
      return {
        promise: async () => ({
          Contents: [
            { Key: "full_backup_old.tar.gz.enc", LastModified: new Date(now - 20 * 86400000) },
            { Key: "full_backup_latest.tar.gz.enc", LastModified: new Date(now - 2 * 86400000) },
            { Key: "notes.tar.gz.enc", LastModified: new Date(now - 30 * 86400000) },
          ],
        }),
      };
    },
    deleteObjects(request) {
      deletedRequests.push(request);
      return { promise: async () => ({ Errors: [] }) };
    },
  };

  assert.equal(await pruneExpiredCloudBackups(s3, now), 1);
  assert.deepEqual(deletedRequests, [{
    Bucket: "test-backups",
    Delete: {
      Objects: [{ Key: "full_backup_old.tar.gz.enc" }],
      Quiet: true,
    },
  }]);
});

test("cloud retention rejects invalid policy values before listing objects", async () => {
  process.env.B2_BACKUP_RETENTION_DAYS = "0";
  let listCalls = 0;
  const s3 = {
    listObjectsV2() {
      listCalls += 1;
      return { promise: async () => ({ Contents: [] }) };
    },
  };

  await assert.rejects(pruneExpiredCloudBackups(s3), /between 1 and 3650/);
  assert.equal(listCalls, 0);
});

test("local backups are not created in plaintext when encryption is unconfigured", async () => {
  delete process.env.BACKUP_ENC_KEY;
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "dfg-backup-test-"));
  try {
    await assert.rejects(createLocalBackupOnly(backupDir), /BACKUP_ENC_KEY not configured/);
    assert.deepEqual(fs.readdirSync(backupDir), []);
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
});
