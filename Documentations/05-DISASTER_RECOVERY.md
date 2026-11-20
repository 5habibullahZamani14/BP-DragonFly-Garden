# 05 - DISASTER RECOVERY

This section explains how to preserve data and recover service after a hardware or
software failure. The system does not automatically keep the Pi, laptop, and spare SD card
in sync. Use one active server and treat other devices as standby.

## Guides

- [05.1-BACKUP_PROCEDURES.md](05.1-BACKUP_PROCEDURES.md): create and verify backups.
- [05.2-RESTORE_PROCEDURES.md](05.2-RESTORE_PROCEDURES.md): restore selected data safely.
- [05.3-SYNC_BETWEEN_DEVICES.md](05.3-SYNC_BETWEEN_DEVICES.md): use a standby device
  without creating conflicting databases.
- [05.4-QUICK_RECOVERY.md](05.4-QUICK_RECOVERY.md): initial troubleshooting checklist.

## Data locations

- SQLite database: `restaurant-system/backend/src/database/database.sqlite`
- Menu/feedback images: `frontend/public/menu-images/` and
  `frontend/public/feedback-images/`
- Runtime settings/secrets: `restaurant-system/backend/.env` and, if present,
  `.env.local`
- Backend logs: `restaurant-system/backend/logs/`

The `.env` files contain secrets and may be host-specific. Keep them private and do not
blindly restore one machine's configuration onto another. The project does not use a
configurable `DATABASE_PATH`; SQLite uses the fixed path above.

## Cloud backup limitations

Cloud backup is conditional on the backend running, valid B2 settings, and a configured
`BACKUP_ENC_KEY`. Scheduled backup attempts are logged; verify that an archive exists and
test a restore rather than assuming every nightly backup succeeded. Do not use the legacy
`node src/restoreBackup.js` tool: it is incompatible with encrypted archive backups.

For first-time laptop setup, see [03-LAPTOP_SETUP_GUIDE.md](03-LAPTOP_SETUP_GUIDE.md).
