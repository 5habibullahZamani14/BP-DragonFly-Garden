# Raspberry Pi 5 Printer Setup Guide

## Overview
This guide explains how to set up printers on the Raspberry Pi 5 for the DragonFly Garden restaurant system. The system supports automatic printer discovery and management through the manager dashboard.

## Prerequisites

### 1. Install CUPS (Common Unix Printing System)
CUPS is required for printer management on Linux/Raspberry Pi.

```bash
sudo apt update
sudo apt install cups cups-client
```

### 2. Add User to CUPS Group
Add the user running the Node.js backend to the `lpadmin` group to manage printers:

```bash
sudo usermod -a -G lpadmin $USER
```

### 3. Start and Enable CUPS Service
```bash
sudo systemctl start cups
sudo systemctl enable cups
```

## Printer Connection Types

### WiFi/Network Printers
1. Ensure printer is connected to the same network as the Raspberry Pi
2. Get printer's IP address from printer's network settings
3. Add printer via CUPS web interface or command line

### USB/Wired Printers
1. Connect printer to Raspberry Pi via USB
2. System should auto-detect the printer
3. Configure via CUPS if needed

### Bluetooth Printers
**Note:** Bluetooth printing is not recommended for thermal printers due to reliability issues. Use WiFi or USB instead.

If you must use Bluetooth:
```bash
sudo apt install bluetooth bluez bluez-tools
sudo systemctl start bluetooth
sudo systemctl enable bluetooth
```

## Adding Printers via CUPS Web Interface

1. Access CUPS web interface:
   ```
   http://localhost:631
   ```

2. Navigate to `Administration` → `Add Printer`

3. Select your printer from the discovered list

4. Choose the appropriate driver (for thermal printers, select generic text or receipt printer driver)

5. Set printer name (e.g., `BP_DragonFly_Garden_Confirmed`)

6. Complete the setup

## Adding Printers via Command Line

### Network Printer Example
```bash
lpadmin -p BP_DragonFly_Garden_Confirmed -v socket://192.168.
1.100:9100 -m generic
cupsenable BP_DragonFly_Garden_Confirmed
cupsaccept BP_DragonFly_Garden_Confirmed
```

### USB Printer Example
```bash
lpadmin -p BP_DragonFly_Garden_Confirmed -v usb://HP/DeskJet%202600%20series?serial=XXXX -m generic
cupsenable BP_DragonFly_Garden_Confirmed
cupsaccept BP_DragonFly_Garden_Confirmed
```

## Testing Printer Setup

### Test Print via Command Line
```bash
echo "Test Print" | lp -d BP_DragonFly_Garden_Confirmed
```

### Check Printer Status
```bash
lpstat -p
lpstat -d  # Shows default printer
```

## System Integration

### Automatic Discovery
The DragonFly Garden system automatically discovers printers using CUPS via the `lpstat` command. No additional configuration is needed.

### Manager Dashboard
1. Log into the manager dashboard
2. Navigate to Settings → Printer Management
3. Click "Discover Printers" to see all available printers
4. Each printer shows:
   - Name
   - Connection type (WiFi, USB, etc.)
   - Status (online/offline)
   - Driver information
   - Port/URI

### Printer Selection
1. Select your preferred printer as "Selected Printer (Active)"
2. Set a fallback printer as "Default Printer (Fallback)"
3. Click "Test Print" to verify each printer works
4. Save settings

## Troubleshooting

### Printer Not Discovered
- Ensure CUPS is running: `sudo systemctl status cups`
- Check if printer is added to CUPS: `lpstat -p`
- Restart CUPS: `sudo systemctl restart cups`

### Permission Issues
- Ensure user is in `lpadmin` group: `groups $USER`
- Add user if needed: `sudo usermod -a -G lpadmin $USER`

### Network Printer Issues
- Verify printer is on same network
- Ping printer IP: `ping 192.168.1.100`
- Check firewall settings

### USB Printer Issues
- Check if printer is detected: `lsusb`
- Check CUPS logs: `sudo tail -f /var/log/cups/error_log`

## Thermal Printer Specific Notes

### Recommended Drivers
For thermal receipt printers, use:
- Generic text-only driver (most reliable)
- ESC/POS compatible driver if available
- Manufacturer-specific driver if provided

### Paper Size Configuration
Set paper size to 80mm or 58mm depending on your printer:
```bash
lpadmin -p BP_DragonFly_Garden_Confirmed -o media=80mm
```

### Print Quality Settings
For better thermal print quality:
```bash
lpadmin -p BP_DragonFly_Garden_Confirmed -o print-quality=3
```

## Cross-Platform Compatibility

The printer management system automatically detects the platform:
- **Windows**: Uses PowerShell `Get-Printer` for discovery
- **Linux/Raspberry Pi**: Uses CUPS `lpstat` for discovery
- **Settings**: Stored in database and work on both platforms

## Security Considerations

1. **Network Printers**: Use secure WiFi networks
2. **CUPS Access**: Restrict CUPS web interface to local network only
3. **Firewall**: Ensure port 631 (CUPS) is accessible locally only

## Maintenance

### Regular Checks
- Monitor printer status in manager dashboard
- Test print regularly to ensure connectivity
- Check CUPS logs for errors

### Updates
- Keep CUPS updated: `sudo apt upgrade cups`
- Update printer drivers if manufacturer releases updates

## Support

For issues specific to:
- **CUPS**: https://www.cups.org/documentation.html
- **Raspberry Pi**: https://www.raspberrypi.com/documentation/
- **DragonFly Garden**: Check manager dashboard logs and backend console output
