const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");
const { createSystemUpdateService } = require("./systemUpdateService");

const execFileAsync = promisify(execFile);
let testRoot;
let repository;
let remote;
let remotePublishCount;
const TEST_SIGNER = "A".repeat(40);

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const commandRunner = (command, args, options) => {
  if (command === "git" && args[0] === "verify-commit") {
    return Promise.resolve({ stdout: "", stderr: `[GNUPG:] VALIDSIG ${TEST_SIGNER} 20260101 0 4 0 1 10 00 ${TEST_SIGNER}` });
  }
  const commandName = process.platform === "win32" && command === "npm"
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const commandArgs = process.platform === "win32" && command === "npm"
    ? ["/d", "/s", "/c", "npm.cmd", ...args]
    : args;
  return execFileAsync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout,
    env: options.env,
  });
};

const writeFile = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
};

const publishRemoteUpdate = (files, message) => {
  const publisher = path.join(testRoot, `publisher-${remotePublishCount++}`);
  git(testRoot, ["clone", remote, publisher]);
  git(publisher, ["config", "user.name", "Updater Tests"]);
  git(publisher, ["config", "user.email", "updater-tests@example.invalid"]);
  Object.entries(files).forEach(([relativePath, contents]) => writeFile(path.join(publisher, relativePath), contents));
  git(publisher, ["add", "-A"]);
  git(publisher, ["commit", "-m", message]);
  git(publisher, ["push", "origin", "main"]);
  return git(publisher, ["rev-parse", "HEAD"]);
};

const createService = (options = {}) => createSystemUpdateService({
  repoRoot: repository,
  branch: "main",
  tempDirectory: path.join(testRoot, "staging"),
  trustedCommitSigners: [TEST_SIGNER],
  commandRunner,
  ...options,
});

const validateRelease = async (stagingRoot) => {
  writeFile(path.join(stagingRoot, "frontend", "dist", "index.html"), "new validated frontend");
};

test.beforeEach(() => {
  remotePublishCount = 0;
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-update-test-"));
  repository = path.join(testRoot, "repository");
  remote = path.join(testRoot, "remote.git");
  fs.mkdirSync(path.join(testRoot, "staging"));
  git(testRoot, ["init", "--bare", remote]);
  git(testRoot, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  git(testRoot, ["-c", "init.defaultBranch=main", "init", repository]);
  git(repository, ["config", "user.name", "Updater Tests"]);
  git(repository, ["config", "user.email", "updater-tests@example.invalid"]);
  writeFile(path.join(repository, ".gitignore"), ".env\nfrontend/dist/\n");
  writeFile(path.join(repository, ".env"), "LOCAL_ONLY=test\n");
  writeFile(path.join(repository, "app.txt"), "initial application");
  writeFile(
    path.join(repository, "restaurant-system", "backend", "package.json"),
    '{"name":"backend","version":"1.0.0","scripts":{"test":"node scripts/test.cjs"}}\n'
  );
  writeFile(
    path.join(repository, "restaurant-system", "backend", "package-lock.json"),
    '{"name":"backend","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"backend","version":"1.0.0"}}}\n'
  );
  writeFile(
    path.join(repository, "frontend", "package.json"),
    '{"name":"frontend","version":"1.0.0","scripts":{"build":"node scripts/build.cjs"}}\n'
  );
  writeFile(
    path.join(repository, "frontend", "package-lock.json"),
    '{"name":"frontend","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"frontend","version":"1.0.0"}}}\n'
  );
  git(repository, ["add", "-A"]);
  git(repository, ["commit", "-m", "Initial application"]);
  git(repository, ["remote", "add", "origin", remote]);
  git(repository, ["push", "--set-upstream", "origin", "main"]);
  writeFile(path.join(repository, "frontend", "dist", "index.html"), "previous frontend");
});

test.afterEach(() => {
  if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
});

test("rejects invalid update branch configuration", () => {
  assert.throws(() => createService({ branch: "main; unexpected-command" }), /UPDATE_BRANCH must be a valid Git branch name/);
});

test("applies only the reviewed fast-forward after staged validation and preserves local configuration", async () => {
  const expectedCommit = publishRemoteUpdate({ "app.txt": "updated application" }, "Publish update");
  const service = createService({ validateStagedRelease: validateRelease });

  const result = await service.applyUpdate(expectedCommit);

  assert.equal(result.success, true);
  assert.equal(result.commit, expectedCommit);
  assert.equal(git(repository, ["rev-parse", "HEAD"]), expectedCommit);
  assert.equal(fs.readFileSync(path.join(repository, "frontend", "dist", "index.html"), "utf8"), "new validated frontend");
  assert.equal(fs.readFileSync(path.join(repository, ".env"), "utf8"), "LOCAL_ONLY=test\n");
  assert.equal(git(repository, ["status", "--porcelain"]), "");
  assert.deepEqual(fs.readdirSync(path.join(testRoot, "staging")), []);
});

test("runs npm installation, backend tests, and the frontend build in the staged worktree", async () => {
  const expectedCommit = publishRemoteUpdate({
    "restaurant-system/backend/scripts/test.cjs": [
      'if (process.env.JWT_SECRET || process.env.RESEND_API_KEY) throw new Error("secret environment leaked");',
      'process.stdout.write("backend tests passed\\n");',
      "",
    ].join("\n"),
    "frontend/scripts/build.cjs": [
      'const fs = require("node:fs");',
      'if (process.env.JWT_SECRET || process.env.RESEND_API_KEY) throw new Error("secret environment leaked");',
      'fs.mkdirSync("dist", { recursive: true });',
      'fs.writeFileSync("dist/index.html", "built by staged npm script");',
      "",
    ].join("\n"),
  }, "Add isolated release checks");

  const originalJwtSecret = process.env.JWT_SECRET;
  const originalResendKey = process.env.RESEND_API_KEY;
  process.env.JWT_SECRET = "test-only-secret";
  process.env.RESEND_API_KEY = "test-only-email-key";
  let result;
  try {
    result = await createService().applyUpdate(expectedCommit);
  } finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendKey;
  }

  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(path.join(repository, "frontend", "dist", "index.html"), "utf8"), "built by staged npm script");
  assert.deepEqual(fs.readdirSync(path.join(testRoot, "staging")), []);
});

test("refuses unsigned or untrusted updates and reports the signature gate", async () => {
  const expectedCommit = publishRemoteUpdate({ "app.txt": "unsigned update" }, "Publish unsigned update");
  const unsignedRunner = (command, args, options) => {
    if (command === "git" && args[0] === "verify-commit") {
      return Promise.reject(Object.assign(new Error("unsigned commit"), { code: 1 }));
    }
    return commandRunner(command, args, options);
  };
  const status = await createService({ commandRunner: unsignedRunner }).getUpdateStatus();

  assert.equal(status.latest_commit, expectedCommit);
  assert.equal(status.trusted_commit_signature, false);
  assert.equal(status.can_update, false);
  assert.match(status.reason, /does not have a verifiable GPG signature/);
});

test("refuses to update a dirty installation without changing tracked files", async () => {
  publishRemoteUpdate({ "app.txt": "remote update" }, "Publish update");
  writeFile(path.join(repository, "app.txt"), "local uncommitted change");
  const service = createService({ validateStagedRelease: validateRelease });

  const status = await service.getUpdateStatus();

  assert.equal(status.can_update, false);
  assert.match(status.reason, /Local or untracked project changes/);
  await assert.rejects(service.applyUpdate(status.latest_commit), /Local or untracked project changes/);
  assert.equal(fs.readFileSync(path.join(repository, "app.txt"), "utf8"), "local uncommitted change");
});

test("refuses a remote branch that diverged from the installed commit", async () => {
  writeFile(path.join(repository, "app.txt"), "local-only commit");
  git(repository, ["add", "app.txt"]);
  git(repository, ["commit", "-m", "Local-only change"]);
  const clone = path.join(testRoot, "remote-clone");
  git(testRoot, ["clone", remote, clone]);
  git(clone, ["config", "user.name", "Updater Tests"]);
  git(clone, ["config", "user.email", "updater-tests@example.invalid"]);
  writeFile(path.join(clone, "remote.txt"), "remote-only change");
  git(clone, ["add", "remote.txt"]);
  git(clone, ["commit", "-m", "Remote-only change"]);
  git(clone, ["push", "origin", "main"]);

  const status = await createService().getUpdateStatus();

  assert.equal(status.can_update, false);
  assert.match(status.reason, /not a fast-forward/);
});

test("blocks automatic updates when backend dependency manifests changed", async () => {
  publishRemoteUpdate({
    "app.txt": "remote update",
    "restaurant-system/backend/package-lock.json": '{"lockfileVersion":3,"changed":true}\n',
  }, "Change backend dependencies");

  const status = await createService().getUpdateStatus();

  assert.equal(status.can_update, false);
  assert.match(status.reason, /Backend dependencies changed/);
});

test("does not automatically apply a remote update that changes an environment file", async () => {
  publishRemoteUpdate(
    { "restaurant-system/backend/.env.production": "REMOTE_SECRET=must-not-be-installed\n" },
    "Change environment file"
  );

  const status = await createService().getUpdateStatus();

  assert.equal(status.can_update, false);
  assert.equal(status.environment_files_unchanged, false);
  assert.match(status.reason, /will not overwrite machine-specific configuration/);
});

test("keeps the installation and current frontend intact when staged validation fails", async () => {
  const expectedCommit = publishRemoteUpdate({ "app.txt": "remote update" }, "Publish update");
  const originalHead = git(repository, ["rev-parse", "HEAD"]);
  const service = createService({
    validateStagedRelease: async () => { throw new Error("staged tests failed"); },
  });

  await assert.rejects(service.applyUpdate(expectedCommit), /staged tests failed/);

  assert.equal(git(repository, ["rev-parse", "HEAD"]), originalHead);
  assert.equal(fs.readFileSync(path.join(repository, "frontend", "dist", "index.html"), "utf8"), "previous frontend");
  assert.deepEqual(fs.readdirSync(path.join(testRoot, "staging")), []);
});

test("restores the previous frontend when the fast-forward cannot be applied", async () => {
  const expectedCommit = publishRemoteUpdate({ "app.txt": "remote update" }, "Publish update");
  const runner = (command, args, options) => {
    if (command === "git" && args[0] === "merge") {
      const error = new Error("simulated fast-forward failure");
      error.code = 1;
      return Promise.reject(error);
    }
    return commandRunner(command, args, options);
  };
  const service = createService({
    commandRunner: runner,
    validateStagedRelease: validateRelease,
  });

  await assert.rejects(service.applyUpdate(expectedCommit), /simulated fast-forward failure/);

  assert.notEqual(git(repository, ["rev-parse", "HEAD"]), expectedCommit);
  assert.equal(fs.readFileSync(path.join(repository, "frontend", "dist", "index.html"), "utf8"), "previous frontend");
});

test("rejects a stale reviewed commit before preparing a worktree", async () => {
  const reviewedCommit = publishRemoteUpdate({ "app.txt": "first remote update" }, "First update");
  publishRemoteUpdate({ "app.txt": "second remote update" }, "Second update");

  const service = createService({ validateStagedRelease: validateRelease });

  await assert.rejects(service.applyUpdate(reviewedCommit), /remote update changed after review/);
  assert.deepEqual(fs.readdirSync(path.join(testRoot, "staging")), []);
});
