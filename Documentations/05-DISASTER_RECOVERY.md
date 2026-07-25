# 05 - DISASTER RECOVERY GUIDE

> **This guide is for COMPLETE BEGINNERS. We will explain EVERYTHING step by step. This shows you how to back up, restore, and sync your system.**

---

## 🤔 WHAT IS DISASTER RECOVERY?

Disaster recovery means: "If something breaks, how do I fix it?"

### Scenarios covered:
1. **SD card dies** - Need to restore to new SD card
2. **Pi hardware dies** - Need to use laptop instead
3. **Data gets corrupted** - Need to restore from backup
4. **Need to sync between devices** - Keep all 3 locations updated

---

## 📖 TABLE OF CONTENTS

- [05.1-BACKUP_PROCEDURES.md](05.1-BACKUP_PROCEDURES.md) - How to create backups
- [05.2-RESTORE_PROCEDURES.md](05.2-RESTORE_PROCEDURES.md) - How to restore from backup
- [05.3-SYNC_BETWEEN_DEVICES.md](05.3-SYNC_BETWEEN_DEVICES.md) - How to sync between Pi, backup SD, and laptop
- [05.4-QUICK_RECOVERY.md](05.4-QUICK_RECOVERY.md) - Quick recovery checklist

---

## 🎯 QUICK REFERENCE

### What to back up:
- `.env` file (passwords and settings)
- `database.sqlite` (all your data)
- `menu-images/` (menu pictures)
- `feedback-images/` (feedback pictures)
- `dragonfly-garden.service` (auto-start config)

### Where to find them:
| On Pi | On Laptop |
|-------|---------|
| `/home/pi/BP-DragonFly-Garden/restaurant-system/backend/.env` | `C:\BP-DragonFly-Garden\restaurant-system\backend\.env` |
| `/home/pi/BP-DragonFly-Garden/restaurant-system/backend/src/database/database.sqlite` | `C:\BP-DragonFly-Garden\restaurant-system\backend\src\database\database.sqlite` |
| `/home/pi/BP-DragonFly-Garden/frontend/public/menu-images/` | `C:\BP-DragonFly-Garden\frontend\public\menu-images\` |
| `/home/pi/BP-DragonFly-Garden/frontend/public/feedback-images/` | `C:\BP-DragonFly-Garden\frontend\public\feedback-images\` |

---

## 🔧 QUICK COMMANDS

| Command | What it does |
|---------|-------------|
| `node src/restoreBackup.js` | Restore from cloud backup |
| `npm run start` | Start the backend |
| `npm run build` | Build the frontend |

---

## ✅ YOU'RE DONE!

### What to do next:
- Read [05.1-BACKUP_PROCEDURES.md](05.1-BACKUP_PROCEDURES.md) to learn about backups
- Or read [05.4-QUICK_RECOVERY.md](05.4-QUICK_RECOVERY.md) for emergency steps