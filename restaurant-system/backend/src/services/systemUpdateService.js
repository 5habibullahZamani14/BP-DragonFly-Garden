const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const execFileAsync = promisify(execFile);
const COMMIT_PATTERN = /^[a-f0-9]{40,64}$/i;
const BACKEND_DEPENDENCY_FILES = [
  "restaurant-system/backend/package.json",
  "restaurant-system/backend/package-lock.json",
];
const ENV_FILE_PATTERN = /(^|\/)\.env(?:\.|\/|$)/i;
const NPM_CONFIG_FILES = [".npmrc", "frontend/.npmrc", "restaurant-system/backend/.npmrc"];
const GIT_TIMEOUT_MS = 60_000;
const NPM_TIMEOUT_MS = 15 * 60_000;
const SAFE_UPDATE_ENVIRONMENT_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "PROCESSOR_ARCHITECTURE",
];

const validateBranch = (branch) => {
  if (
    typeof branch !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)
    || branch.includes("..")
    || branch.includes("//")
    || branch.endsWith("/")
    || branch.endsWith(".")
  ) {
    throw new Error("UPDATE_BRANCH must be a valid Git branch name.");
  }
  return branch;
};

const runCommand = async (command, args, options = {}) => {
  const commandName = process.platform === "win32" && command === "npm"
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const commandArgs = process.platform === "win32" && command === "npm"
    ? ["/d", "/s", "/c", "npm.cmd", ...args]
    : args;
  return execFileAsync(commandName, commandArgs, {
    cwd: options.cwd,
    timeout: options.timeout || GIT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    shell: false,
    env: options.env,
  });
};

const createSanitizedUpdateEnvironment = (userConfigPath, globalConfigPath) => {
  const env = {};
  for (const key of SAFE_UPDATE_ENVIRONMENT_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.CI = "true";
  env.NPM_CONFIG_USERCONFIG = userConfigPath;
  env.NPM_CONFIG_GLOBALCONFIG = globalConfigPath;
  env.NPM_CONFIG_AUDIT = "false";
  env.NPM_CONFIG_FUND = "false";
  return env;
};

const parseTrustedSigners = (value) => {
  const signers = Array.isArray(value) ? value : String(value || "").split(",");
  return signers
    .map((signer) => String(signer).trim().toUpperCase())
    .filter((signer) => /^[A-F0-9]{40,64}$/.test(signer));
};

const createSystemUpdateService = ({
  repoRoot,
  branch = "main",
  commandRunner = runCommand,
  validateStagedRelease,
  trustedCommitSigners = process.env.UPDATE_TRUSTED_COMMIT_SIGNERS,
  fileSystem = fs,
  tempDirectory = os.tmpdir(),
}) => {
  const updateBranch = validateBranch(branch);
  const trustedSigners = parseTrustedSigners(trustedCommitSigners);
  let updateInProgress = false;

  const runGit = async (args, cwd = repoRoot, timeout = GIT_TIMEOUT_MS) =>
    commandRunner("git", args, { cwd, timeout });

  const isAncestor = async (ancestor, descendant) => {
    try {
      await runGit(["merge-base", "--is-ancestor", ancestor, descendant]);
      return true;
    } catch (error) {
      if (error.code === 1) return false;
      throw error;
    }
  };

  const verifyTrustedCommit = async (commit) => {
    if (trustedSigners.length === 0) {
      return { verified: false, reason: "No trusted GPG signing fingerprints are configured for automatic updates." };
    }

    let verification;
    try {
      verification = await runGit(["verify-commit", "--raw", commit]);
    } catch (error) {
      return {
        verified: false,
        reason: error.code === "ENOENT"
          ? "Git signature verification is unavailable on this installation."
          : "The latest commit does not have a verifiable GPG signature.",
      };
    }
    const output = `${verification.stdout || ""}\n${verification.stderr || ""}`;
    const fingerprints = [...output.matchAll(/\bVALIDSIG\s+([A-F0-9]{40,64})\b/gi)]
      .map((match) => match[1].toUpperCase());
    const trustedFingerprint = fingerprints.find((fingerprint) => trustedSigners.includes(fingerprint));
    if (!trustedFingerprint) {
      return {
        verified: false,
        reason: "The latest commit is not signed by a configured trusted GPG key.",
      };
    }
    return { verified: true, signer: trustedFingerprint };
  };

  const getUpdateStatus = async ({ allowInProgress = false } = {}) => {
    if (updateInProgress && !allowInProgress) {
      const error = new Error("A system update is already in progress.");
      error.status = 409;
      throw error;
    }
    const rootResult = await runGit(["rev-parse", "--show-toplevel"]);
    const actualRoot = path.resolve(rootResult.stdout.trim());
    if (process.platform === "win32"
      ? actualRoot.toLowerCase() !== path.resolve(repoRoot).toLowerCase()
      : actualRoot !== path.resolve(repoRoot)) {
      throw new Error("The running application directory is not the Git repository root.");
    }

    const [branchResult, headResult, statusResult] = await Promise.all([
      runGit(["branch", "--show-current"]),
      runGit(["rev-parse", "HEAD"]),
      runGit(["status", "--porcelain", "--untracked-files=normal"]),
    ]);
    const currentBranch = branchResult.stdout.trim();
    const currentCommit = headResult.stdout.trim();
    if (!COMMIT_PATTERN.test(currentCommit)) {
      throw new Error("Could not determine the current Git commit.");
    }

    await runGit(["fetch", "--no-tags", "origin", `refs/heads/${updateBranch}`], repoRoot, 120_000);
    const remoteResult = await runGit(["rev-parse", "FETCH_HEAD^{commit}"]);
    const latestCommit = remoteResult.stdout.trim();
    if (!COMMIT_PATTERN.test(latestCommit)) {
      throw new Error(`Could not resolve the latest commit for the configured update branch.`);
    }

    const needsUpdate = currentCommit !== latestCommit;
    const workingTreeDirty = statusResult.stdout.trim().length > 0;
    const reasons = [];
    if (needsUpdate && currentBranch !== updateBranch) {
      reasons.push(`The app is on branch "${currentBranch || "detached HEAD"}", not "${updateBranch}".`);
    }
    if (needsUpdate && workingTreeDirty) {
      reasons.push("Local or untracked project changes are present. They will not be overwritten; update after safely preserving them.");
    }

    let fastForward = false;
    let backendDependenciesChanged = false;
    let environmentFilesChanged = false;
    let trustedCommitSignature = false;
    if (needsUpdate && currentBranch === updateBranch && !workingTreeDirty) {
      fastForward = await isAncestor(currentCommit, latestCommit);
      if (!fastForward) {
        reasons.push("The remote branch is not a fast-forward of this installation. No automatic merge will be attempted.");
      } else {
        const signature = await verifyTrustedCommit(latestCommit);
        trustedCommitSignature = signature.verified;
        if (!signature.verified) reasons.push(signature.reason);
        const changedFilesResult = await runGit(["diff", "--name-only", "-z", currentCommit, latestCommit]);
        const changedFiles = changedFilesResult.stdout.split("\0").filter(Boolean).map((file) => file.replace(/\\/g, "/"));
        backendDependenciesChanged = changedFiles.some((file) => BACKEND_DEPENDENCY_FILES.includes(file));
        environmentFilesChanged = changedFiles.some((file) => ENV_FILE_PATTERN.test(file));
        if (backendDependenciesChanged) {
          reasons.push("Backend dependencies changed. Stop the backend and use the documented maintenance update procedure.");
        }
        if (environmentFilesChanged) {
          reasons.push("The update changes an .env file. Automatic updates will not overwrite machine-specific configuration.");
        }
      }
    }

    return {
      branch: updateBranch,
      current_commit: currentCommit,
      latest_commit: latestCommit,
      needs_update: needsUpdate,
      can_update: needsUpdate && currentBranch === updateBranch && !workingTreeDirty && fastForward
        && !backendDependenciesChanged && !environmentFilesChanged && trustedCommitSignature,
      working_tree_clean: !workingTreeDirty,
      environment_files_unchanged: !environmentFilesChanged,
      trusted_commit_signature: trustedCommitSignature,
      reason: reasons.join(" "),
    };
  };

  const validateRelease = validateStagedRelease || (async (stagingRoot) => {
    const backendDirectory = path.join(stagingRoot, "restaurant-system", "backend");
    const frontendDirectory = path.join(stagingRoot, "frontend");
    const npmrcPaths = NPM_CONFIG_FILES.map((file) => path.join(stagingRoot, ...file.split("/")));
    if (npmrcPaths.some((file) => fileSystem.existsSync(file))) {
      throw new Error("Automatic validation refuses project .npmrc files. Use the documented manual update process.");
    }
    const userNpmConfigPath = path.join(stagingRoot, ".update-npmrc.user");
    const globalNpmConfigPath = path.join(stagingRoot, ".update-npmrc.global");
    fileSystem.writeFileSync(userNpmConfigPath, "audit=false\nfund=false\n");
    fileSystem.writeFileSync(globalNpmConfigPath, "audit=false\nfund=false\n");
    const env = createSanitizedUpdateEnvironment(userNpmConfigPath, globalNpmConfigPath);
    await commandRunner("npm", ["ci"], { cwd: backendDirectory, timeout: NPM_TIMEOUT_MS, env });
    await commandRunner("npm", ["test"], { cwd: backendDirectory, timeout: NPM_TIMEOUT_MS, env });
    await commandRunner("npm", ["ci"], { cwd: frontendDirectory, timeout: NPM_TIMEOUT_MS, env });
    await commandRunner("npm", ["run", "build"], { cwd: frontendDirectory, timeout: NPM_TIMEOUT_MS, env });
  });

  const prepareFrontendBuild = (sourceDirectory, frontendDirectory) => {
    const token = randomUUID();
    const replacementDirectory = path.join(frontendDirectory, `.dist-update-${token}`);
    const currentDirectory = path.join(frontendDirectory, "dist");
    const previousDirectory = path.join(frontendDirectory, `.dist-previous-${token}`);
    let previousMoved = false;
    let replacementPromoted = false;
    const rollback = () => {
      if (replacementPromoted && fileSystem.existsSync(currentDirectory)) {
        fileSystem.rmSync(currentDirectory, { recursive: true, force: true });
      }
      if (previousMoved && fileSystem.existsSync(previousDirectory)) {
        fileSystem.renameSync(previousDirectory, currentDirectory);
      }
      if (fileSystem.existsSync(replacementDirectory)) {
        fileSystem.rmSync(replacementDirectory, { recursive: true, force: true });
      }
    };

    try {
      fileSystem.cpSync(sourceDirectory, replacementDirectory, { recursive: true });
      if (fileSystem.existsSync(currentDirectory)) {
        fileSystem.renameSync(currentDirectory, previousDirectory);
        previousMoved = true;
      }
      fileSystem.renameSync(replacementDirectory, currentDirectory);
      replacementPromoted = true;
    } catch (error) {
      try {
        rollback();
      } catch (rollbackError) {
        throw new Error(`${error.message}; frontend rollback also failed: ${rollbackError.message}`);
      }
      throw error;
    }

    return {
      rollback,
      finalize: () => {
        if (!previousMoved) return null;
        try {
          fileSystem.rmSync(previousDirectory, { recursive: true, force: true });
          return null;
        } catch (error) {
          return `The previous frontend build remains at ${path.basename(previousDirectory)} because cleanup failed: ${error.message}`;
        }
      },
    };
  };

  const applyUpdate = async (expectedCommit) => {
    if (updateInProgress) {
      const error = new Error("A system update is already in progress.");
      error.status = 409;
      throw error;
    }
    if (typeof expectedCommit !== "string" || !COMMIT_PATTERN.test(expectedCommit)) {
      const error = new Error("The reviewed update commit is invalid. Check for updates again.");
      error.status = 400;
      throw error;
    }

    updateInProgress = true;
    const logs = [];
    let stagingRoot = null;
    let worktreeAdded = false;
    try {
      const status = await getUpdateStatus({ allowInProgress: true });
      if (!status.needs_update) {
        const error = new Error("This installation is already up to date.");
        error.status = 409;
        throw error;
      }
      if (status.latest_commit !== expectedCommit) {
        const error = new Error("The remote update changed after review. Check for updates again before applying it.");
        error.status = 409;
        throw error;
      }
      if (!status.can_update) {
        const error = new Error(status.reason || "This installation cannot be updated automatically.");
        error.status = 409;
        throw error;
      }

      stagingRoot = path.join(tempDirectory, `dragonfly-update-${randomUUID()}`);
      logs.push("Preparing an isolated copy of the reviewed update...");
      await runGit(["worktree", "add", "--detach", stagingRoot, status.latest_commit]);
      worktreeAdded = true;

      logs.push("Installing staged dependencies and running backend tests...");
      logs.push("Building the staged frontend...");
      await validateRelease(stagingRoot);
      const stagedDist = path.join(stagingRoot, "frontend", "dist");
      if (!fileSystem.existsSync(stagedDist)) {
        throw new Error("The staged frontend build did not produce frontend/dist.");
      }

      const [currentHeadResult, currentStatusResult, currentBranchResult] = await Promise.all([
        runGit(["rev-parse", "HEAD"]),
        runGit(["status", "--porcelain", "--untracked-files=normal"]),
        runGit(["branch", "--show-current"]),
      ]);
      if (
        currentHeadResult.stdout.trim() !== status.current_commit
        || currentStatusResult.stdout.trim()
        || currentBranchResult.stdout.trim() !== updateBranch
      ) {
        const error = new Error("The installed repository changed during update validation. No update was applied; review the working tree and try again.");
        error.status = 409;
        throw error;
      }

      logs.push("Publishing the validated frontend build...");
      const frontendDeployment = prepareFrontendBuild(stagedDist, path.join(repoRoot, "frontend"));
      try {
        logs.push("Applying the validated update with a fast-forward-only Git merge...");
        await runGit(["merge", "--ff-only", status.latest_commit]);
      } catch (error) {
        try {
          frontendDeployment.rollback();
        } catch (rollbackError) {
          throw new Error(`${error.message}; frontend rollback also failed: ${rollbackError.message}`);
        }
        throw error;
      }
      const cleanupWarning = frontendDeployment.finalize();
      if (cleanupWarning) logs.push(cleanupWarning);
      logs.push("Update installed. Restart the backend before returning to service.");

      return {
        success: true,
        message: "The update passed backend tests and the frontend production build. Restart the backend to activate the new server code.",
        commit: status.latest_commit,
        restart_required: true,
        restart_instructions: process.platform === "win32"
          ? "Use Settings → Server control to stop the backend, then open the Manager shortcut to start it again."
          : "Restart the backend using its normal process manager (for the documented Raspberry Pi service: sudo systemctl restart dragonfly-garden).",
        logs,
      };
    } catch (error) {
      error.updateLogs = logs;
      throw error;
    } finally {
      if (worktreeAdded && stagingRoot) {
        try {
          await runGit(["worktree", "remove", "--force", stagingRoot]);
        } catch (cleanupError) {
          try {
            fileSystem.rmSync(stagingRoot, { recursive: true, force: true });
            await runGit(["worktree", "prune"]);
          } catch {
            const message = `Could not remove temporary update workspace ${path.basename(stagingRoot)}: ${cleanupError.message}`;
            logs.push(message);
          }
        }
      }
      updateInProgress = false;
    }
  };

  return { getUpdateStatus, applyUpdate, get updateInProgress() { return updateInProgress; } };
};

module.exports = {
  BACKEND_DEPENDENCY_FILES,
  COMMIT_PATTERN,
  createSanitizedUpdateEnvironment,
  createSystemUpdateService,
  parseTrustedSigners,
  validateBranch,
};
