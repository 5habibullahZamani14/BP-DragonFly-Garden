# 06 - UPDATE GUIDE

Update application code only during a maintenance window, after a verified backup. Keep
the production database and machine-specific `.env` separate from code updates.

## Choose a procedure

- [06.1-GITHUB_UPDATES.md](06.1-GITHUB_UPDATES.md): update from the Git repository.
- [06.2-MANUAL_UPDATES.md](06.2-MANUAL_UPDATES.md): update from a complete, trusted
  offline release.
- [06.3-VERSION_CHECK.md](06.3-VERSION_CHECK.md): compare local and remote code versions.

## Safe update option

The manager dashboard provides **Settings → System Updates** for eligible Git updates.
It fetches the configured `origin` branch (`UPDATE_BRANCH`, or `main` when unset), checks
that the installation is clean and can fast-forward, and requires the candidate commit to
have a valid GPG signature from a fingerprint explicitly listed in
`UPDATE_TRUSTED_COMMIT_SIGNERS` in the backend `.env`. If no trusted fingerprint is
configured, automatic updates are disabled. The candidate is staged in a temporary Git
worktree; staged backend tests and the frontend production build must both pass before
the update is applied. The updater does not run database migrations, replace restaurant
data, modify `.env`, or install changed backend dependencies.

The updater refuses dirty or diverged installations and updates that change backend
dependency manifests, project `.npmrc` files, or `.env` files. It runs staging commands
without inheriting the backend's runtime environment variables, but it is not an operating
system sandbox: signed build/test code still runs with the application account's filesystem
and network permissions. Trust only a signing key controlled by the project maintainer.
Preserve local changes and use the controlled procedure in
[06.1-GITHUB_UPDATES.md](06.1-GITHUB_UPDATES.md) for those cases. A successful update
requires a backend restart before the new server code is active.

Only update during a maintenance window, after a verified backup. After restarting,
verify the health endpoint, manager login, saved data, and physical printer output. A
successful build alone does not prove that the restaurant is ready for service.
