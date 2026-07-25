# 💻 LAPTOP SETUP GUIDE (WINDOWS)

> **This guide is for COMPLETE BEGINNERS. We will explain EVERYTHING step by step. This sets up your Windows laptop as a backup server.**

---

## 🤔 WHY DO YOU NEED THIS?

Your laptop is a BACKUP. If the Pi breaks, you can use the laptop instead.

- **Pi breaks?** Use laptop
- **SD card dies?** Use laptop
- **Need to update?** Use laptop to test first

---

## 📖 TABLE OF CONTENTS

- [03.1-SOFTWARE_INSTALLATION.md](03.1-SOFTWARE_INSTALLATION.md) - Install Node.js and Git
- [03.2-PRINTER_SETUP.md](03.2-PRINTER_SETUP.md) - Connect YHD-8390 printer
- [03.3-ENVIRONMENT_CONFIG.md](03.3-ENVIRONMENT_CONFIG.md) - Copy .env file

---

## 🎯 QUICK REFERENCE

### Important addresses:
- **System address:** `http://localhost:5000` (when running on laptop)
- **Or if on same network:** `http://YOUR_LAPTOP_IP:5000`

### Important files:
- **Database:** `restaurant-system\backend\src\database\database.sqlite`
- **Environment:** `restaurant-system\backend\.env`
- **Frontend build:** `frontend\dist\`

---

## 🔧 QUICK COMMANDS

| Command | What it does |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run start` | Start the backend |
| `npm run build` | Build the frontend |
| `node src/server.js` | Run the server |

---

## ✅ YOU'RE DONE!

### What to do next:
- Read [03.1-SOFTWARE_INSTALLATION.md](03.1-SOFTWARE_INSTALLATION.md) to install software
- Or read [04-PRINTER_TROUBLESHOOTING.md](../04-PRINTER_TROUBLESHOOTING.md) for printer help