# 06 - UPDATE GUIDE

Update application code only during a maintenance window, after a verified backup. Keep
the production database and machine-specific `.env` separate from code updates.

## Choose a procedure

- [06.1-GITHUB_UPDATES.md](06.1-GITHUB_UPDATES.md): update from the Git repository.
- [06.2-MANUAL_UPDATES.md](06.2-MANUAL_UPDATES.md): update from a complete, trusted
  offline release.
- [06.3-VERSION_CHECK.md](06.3-VERSION_CHECK.md): compare local and remote code versions.

## Important

The dashboard's **Check for Updates** feature can check the remote version. Do not use
**Update Now** on a production installation: the current updater uses `git reset --hard
origin/main`, which can discard local changes, and does not reliably restart the backend.

After an update, verify the health endpoint, manager login, saved data, and physical
printer output. A successful build alone does not prove that the restaurant is ready for
service.
