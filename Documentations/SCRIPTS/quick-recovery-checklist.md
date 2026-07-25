# Quick Recovery Checklist

> **Print this page and keep it near the Pi. Follow these steps in an emergency.**

---

## 🚨 IF SD CARD DIES

- [ ] Get backup SD card
- [ ] Get USB drive with backup files
- [ ] Insert backup SD card into Pi
- [ ] Power on the Pi
- [ ] Wait 2 minutes
- [ ] Connect to "DragonflyHotspot" WiFi
- [ ] Open browser to `http://10.42.0.1:5000`
- [ ] Login to manager dashboard
- [ ] Test the printer
- [ ] System is running!

---

## 💻 IF PI HARDWARE DIES

- [ ] Get the laptop
- [ ] Connect YHD-8390 printer to laptop
- [ ] Turn on the printer
- [ ] Open Command Prompt
- [ ] Type: `cd C:\BP-DragonFly-Garden\restaurant-system\backend`
- [ ] Type: `npm run start`
- [ ] Wait for "Server running on port 5000"
- [ ] Open browser to `http://localhost:5000`
- [ ] Login to manager dashboard
- [ ] Test the printer
- [ ] System is running!

---

## 🔧 IF SYSTEM WON'T START

- [ ] Check .env file exists
- [ ] Check JWT_SECRET is set
- [ ] Check database exists
- [ ] Type: `sudo systemctl status dragonfly-garden`
- [ ] If "inactive", type: `sudo systemctl start dragonfly-garden`
- [ ] If "failed", check logs

---

## 🖨️ IF PRINTER WON'T WORK

- [ ] Check USB cable connection
- [ ] Check printer is turned on
- [ ] Check printer has paper
- [ ] On Pi: Type `lpstat -p`
- [ ] In dashboard: Go to Settings → Printer Management
- [ ] Click "Discover Printers"
- [ ] Select "YHD-8390"
- [ ] Set Width to `48`
- [ ] Set Print Delay to `0`
- [ ] Check "Has Auto Cutter"
- [ ] Click "Save Printer Settings"
- [ ] Click "Test Print"

---

## 📞 CONTACT

- Manager: [Phone number]
- Technical Support: [Phone number]
- Backup USB location: [Location]