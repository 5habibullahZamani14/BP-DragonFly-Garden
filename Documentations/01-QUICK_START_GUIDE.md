# 🚀 QUICK START GUIDE - 5 MINUTE SETUP

> **This guide is for COMPLETE BEGINNERS. If you know nothing about computers, this is for you.**

---

## 📦 WHAT YOU NEED

| Item | What to buy/get |
|------|-----------------|
| 1 | Raspberry Pi 5 (the small computer) |
| 2 | Micro SD card (32GB or larger) |
| 3 | USB-C power adapter (for Pi) |
| 4 | YHD-8390 thermal printer (80mm with auto cutter) |
| 5 | A Windows laptop (for backup) |
| 6 | USB drive or internet (for copying files) |

---

## ⏱️ STEP 1: FLASH THE OPERATING SYSTEM (OS) TO THE SD CARD

### What is an OS?
The OS is like Windows for your Pi. It makes the Pi work.

### What to do:
1. **Download Raspberry Pi Imager**
   - Open your laptop
   - Open Chrome or Edge browser
   - Go to: `https://www.raspberrypi.com/software/`
   - Click the big blue button that says "Download for Windows"
   - Wait for download to finish

2. **Install Raspberry Pi Imager**
   - Find the downloaded file (usually in "Downloads" folder)
   - Double-click it
   - Click "Next" until it installs
   - Click "Finish"

3. **Put the SD card in your laptop**
   - Use the SD card adapter if needed
   - Put it in the slot on your laptop

4. **Open Raspberry Pi Imager**
   - Click the Start button (Windows logo)
   - Type "Raspberry Pi Imager"
   - Click on it

5. **Choose the OS**
   - Click "Choose OS"
   - Click "Raspberry Pi OS (other)"
   - Click "Raspberry Pi OS (64-bit)" ← IMPORTANT!

6. **Choose the SD card**
   - Click "Choose Storage"
   - Click on your SD card
   - Make sure it's the right one! (Check the size)

7. **Write the OS**
   - Click "Write"
   - Click "Yes" if Windows asks
   - Wait 5-10 minutes
   - When done, click "Continue"

8. **Eject the SD card**
   - Right-click the SD card in "This PC"
   - Click "Eject"
   - Remove the SD card

---

## ⏱️ STEP 2: FIRST BOOT THE PI

### What to do:
1. **Put SD card in Pi**
   - Find the SD card slot on the Pi (bottom side)
   - Push the SD card in until it clicks

2. **Connect the printer**
   - Plug the printer USB cable into the Pi
   - Turn on the printer

3. **Power on the Pi**
   - Plug the USB-C cable into the Pi
   - Plug the other end into the power adapter
   - Plug the adapter into the wall
   - The Pi will start (lights will blink)

4. **Wait 2 minutes**
   - The Pi is starting up
   - Be patient!

---

## ⏱️ STEP 3: CONNECT TO THE HOTSPOT

### What to do:
1. **On your phone or laptop**
   - Open WiFi settings
   - Look for WiFi named "DragonflyHotspot"
   - Click on it
   - Password: (ask the manager)

2. **Open a browser**
   - Chrome, Edge, Safari, or Firefox
   - Type in the address bar: `http://10.42.0.1:5000`
   - Press Enter

---

## ⏱️ STEP 4: LOGIN TO THE SYSTEM

### What to do:
1. **You will see a login screen**
   - Click "Manager Login"

2. **Enter username and password**
   - Username: (ask the manager)
   - Password: (ask the manager)
   - Click "Login"

---

## ⏱️ STEP 5: TEST THE PRINTER

### What to do:
1. **Go to Settings**
   - Click "Settings" in the menu

2. **Go to Printer Management**
   - Click "Printer Management"

3. **Click "Test Print"**
   - Click the "Test Print" button
   - The printer should print a test page
   - If it doesn't work, read the PRINTER_TROUBLESHOOTING guide

---

## ⏱️ STEP 6: YOU'RE DONE!

### What to do next:
- The system is now running
- Customers can connect to the WiFi and order
- Kitchen staff can see orders
- Payment counter can process payments

---

## ❓ WHAT IF SOMETHING DOESN'T WORK?

| Problem | Solution |
|---------|----------|
| Can't find WiFi "DragonflyHotspot" | Wait 2 more minutes, check Step 2 |
| Can't open `http://10.42.0.1:5000` | Check Step 3, make sure connected to WiFi |
| Login failed | Ask manager for correct username/password |
| Printer not working | Read PRINTER_TROUBLESHOOTING guide |
| Need to update system | Read UPDATE_GUIDE |
| SD card died, need to restore | Read DISASTER_RECOVERY guide |

---

## 📞 NEED HELP?

Read the other guides in this folder:
- `02-PI_SETUP_GUIDE.md` - Full Pi setup
- `03-LAPTOP_SETUP_GUIDE.md` - Laptop setup
- `04-PRINTER_TROUBLESHOOTING.md` - Fix printer problems
- `05-DISASTER_RECOVERY.md` - Backup and restore
- `06-UPDATE_GUIDE.md` - Update the system