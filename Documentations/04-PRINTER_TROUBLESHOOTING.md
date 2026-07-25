# 04 - PRINTER TROUBLESHOOTING GUIDE (YHD-8390)

> **This guide is for COMPLETE BEGINNERS. We will explain EVERYTHING step by step. This fixes the YHD-8390 printer problems.**

---

## 🤔 THE PROBLEM YOU'RE FACING

You have a YHD-8390 thermal printer (80mm with auto cutter). Two problems:

### Problem 1: Generic driver = full width but no auto-cut
- When you use the generic/text-only driver
- The printer uses the FULL width of the paper
- But it does NOT cut the paper automatically

### Problem 2: POS-80C driver = auto-cut but huge margins
- When you use the POS-80C driver
- The printer cuts the paper automatically
- But it has HUGE margins (wastes 2/3 of the paper)

---

## ✅ THE SOLUTION

The restaurant system has a built-in solution! It uses **ESC/POS raw commands**.

### What is ESC/POS?
- It's a language that thermal printers understand
- It sends commands directly to the printer
- It bypasses Windows margins
- It can send the auto-cut command

### How it works:
1. The system converts your receipt to ESC/POS commands
2. It sends these commands directly to the printer
3. The printer prints with full width
4. The printer cuts the paper automatically

---

## ⚙️ STEP 1: CONFIGURE THE PRINTER PROFILE

### What to do:
1. **Open the restaurant system**
   - On Pi: `http://10.42.0.1:5000`
   - On Laptop: `http://localhost:5000`

2. **Login as manager**
   - Click "Manager Login"
   - Enter username and password

3. **Go to Settings → Printer Management**
   - Click "Settings" in the menu
   - Click "Printer Management"

4. **Select your printer**
   - Click the dropdown
   - Select "YHD-8390"

5. **Set these EXACT values:**

| Setting | Value | Why |
|---------|-------|-----|
| **Width** | `48` | 48 characters = 80mm paper width |
| **Print Delay** | `0` | 0 seconds = no delay, auto-cutter works |
| **Empty Lines Before** | `2` | 2 blank lines before printing |
| **Empty Lines After** | `3` | 3 blank lines after printing |
| **Has Auto Cutter** | `Yes` (checked) | Tells system to send cut command |

6. **Click "Save Printer Settings"**
   - This saves the configuration

---

## 🔧 STEP 2: UNDERSTAND THE SETTINGS

### Width (48)
- **What it means:** 48 characters per line
- **Why 48:** 80mm paper can fit 48 characters
- **If wrong:** Text will be cut off or have margins

### Print Delay (0)
- **What it means:** Wait time after printing
- **Why 0:** Auto-cutter printers don't need to wait
- **If wrong (like 2 or 3):** Paper won't cut automatically

### Empty Lines Before (2)
- **What it means:** Blank lines at the top
- **Why 2:** Gives space at the top of receipt

### Empty Lines After (3)
- **What it means:** Blank lines at the bottom
- **Why 3:** Gives space before cutting

### Has Auto Cutter (Yes)
- **What it means:** Printer can cut paper
- **Why important:** System sends cut command
- **If No:** Paper won't cut automatically

---

## 🖨️ STEP 3: DRIVER SETUP

### For Raspberry Pi (Linux):
1. **Use CUPS "Raw" driver**
   - Open `http://localhost:631`
   - Add printer
   - Choose "Raw" as the driver
   - Do NOT use POS-80C driver

2. **Why Raw driver:**
   - It doesn't add margins
   - The system sends ESC/POS commands
   - Works perfectly with YHD-8390

### For Windows Laptop:
1. **Use generic/text-only driver**
   - Let Windows auto-install
   - Or choose "Generic" in driver selection

2. **Enable printer sharing**
   - Settings → Bluetooth & devices → Printers
   - Right-click printer → Printer properties
   - Sharing tab → Check "Share this printer"

3. **Make sure print_gdi.exe exists**
   - It should be at:
   ```
   C:\BP-DragonFly-Garden\print_gdi.exe
   ```

---

## 🧪 STEP 4: TEST THE PRINTER

### What to do:
1. **In the restaurant system**
   - Go to Settings → Printer Management

2. **Click "Test Print"**
   - The printer should print a test ticket

3. **What to check:**
   - ✅ Text uses FULL width (no huge margins)
   - ✅ Paper cuts automatically
   - ✅ Text is clear and readable

---

## ❌ STEP 5: TROUBLESHOOTING

### Problem: Still has huge margins
**Solution:**
1. Check the driver:
   - **On Pi:** Make sure it's "Raw" driver
   - **On Windows:** Make sure it's "Generic" driver
2. Check Width setting:
   - Make sure it's `48`
3. Check Has Auto Cutter:
   - Make sure it's checked

### Problem: Paper doesn't cut
**Solution:**
1. Check Print Delay:
   - Make sure it's `0`
2. Check Has Auto Cutter:
   - Make sure it's checked
3. Check if printer supports auto-cut:
   - YHD-8390 should support it

### Problem: Test print fails
**Solution:**
1. Check USB cable connection
2. Check if printer is turned on
3. Check if printer is shared (Windows)
4. Check CUPS status (Pi):
   ```bash
   lpstat -p
   ```

### Problem: "print_gdi.exe not found"
**Solution:**
1. Make sure the file exists at:
   ```
   C:\BP-DragonFly-Garden\print_gdi.exe
   ```
2. If missing, copy it from the Pi
3. Or ask the manager for a copy

---

## 📋 STEP 6: QUICK CHECKLIST

- [ ] Printer connected via USB
- [ ] Printer turned on
- [ ] Driver is "Raw" (Pi) or "Generic" (Windows)
- [ ] Printer sharing enabled (Windows)
- [ ] `print_gdi.exe` exists (Windows)
- [ ] Width set to `48`
- [ ] Print Delay set to `0`
- [ ] Has Auto Cutter checked
- [ ] Test print works
- [ ] Paper cuts automatically

---

## 📞 NEED MORE HELP?

Read these guides:
- [02.3-PRINTER_SETUP.md](02.3-PRINTER_SETUP.md) - Full Pi printer setup
- [03.2-PRINTER_SETUP.md](03.2-PRINTER_SETUP.md) - Full Windows printer setup
- [05-DISASTER_RECOVERY.md](05-DISASTER_RECOVERY.md) - Backup and restore