# 🥧 RASPBERRY PI 5 COMPLETE SETUP GUIDE

> **This guide is for COMPLETE BEGINNERS. If you know nothing about computers, this is for you. We will explain EVERYTHING.**

---

## 📖 WHAT THIS GUIDE COVERS

This guide will teach you how to set up a Raspberry Pi 5 from scratch to run the restaurant system.

### What you will learn:
1. How to install the operating system
2. How to set up the WiFi hotspot
3. How to connect the printer
4. How to make the system start automatically
5. How to back up the configuration

---

## 📚 TABLE OF CONTENTS

- [02.1-OS_INSTALLATION.md](02.1-OS_INSTALLATION.md) - Install the OS
- [02.2-NETWORK_HOTSPOT.md](02.2-NETWORK_HOTSPOT.md) - Set up WiFi hotspot
- [02.3-PRINTER_SETUP.md](02.3-PRINTER_SETUP.md) - Connect the YHD-8390 printer
- [02.4-SYSTEMD_SERVICES.md](02.4-SYSTEMD_SERVICES.md) - Auto-start the system
- [02.5-PI_CONFIG_BACKUP.md](02.5-PI_CONFIG_BACKUP.md) - Back up configuration

---

## 🎯 QUICK REFERENCE

### Important IP Address:
- **The Pi's IP address is: `10.42.0.1`**
- **The system runs on port: `5000`**
- **Full address: `http://10.42.0.1:5000`**

### Important Files:
- **Database location:** `/home/pi/BP-DragonFly-Garden/restaurant-system/backend/src/database/database.sqlite`
- **Environment file:** `/home/pi/BP-DragonFly-Garden/restaurant-system/backend/.env`
- **Frontend build:** `/home/pi/BP-DragonFly-Garden/frontend/dist/`

### Important Commands:
```bash
# See if the system is running
sudo systemctl status dragonfly-garden

# Start the system
sudo systemctl start dragonfly-garden

# Stop the system
sudo systemctl stop dragonfly-garden

# Restart the system
sudo systemctl restart dragonfly-garden
```

---

## 🔧 TROUBLESHOOTING QUICK REFERENCE

| Problem | Command to try |
|---------|--------------|
| System not starting | `sudo systemctl start dragonfly-garden` |
| Can't connect to WiFi | `sudo systemctl restart NetworkManager` |
| Printer not working | `lpstat -p` |
| Need to see logs | `tail -f /home/pi/BP-DragonFly-Garden/restaurant-system/backend/server.log` |
| System crashed | `sudo systemctl restart dragonfly-garden` |