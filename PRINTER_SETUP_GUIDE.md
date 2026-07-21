# Printer Setup Guide

This guide explains how to set up and manage printers for the BP DragonFly Garden restaurant system. The system supports multiple printers with individual profiles, making it easy to switch between different printer configurations without code changes.

## Printer Profile System

The restaurant system uses a **printer profile system** that stores individual settings for each printer. This means:

- Each printer has its own saved configuration
- Settings are stored in the database, not in code
- You can switch between printers without manual configuration
- Adding new printers is straightforward and doesn't require code changes

## Printer Profile Settings

Each printer profile includes:

- **Width**: Character width for receipt formattingtypically 48 for 80mm printers, 28 for 58mm printers
- **Print Delay (seconds)**: Delay between receipts (0 = no delay for auto-cutter printers)
- **Empty Lines Before**: Number of blank lines before printing starts
- **Empty Lines After**: Number of blank lines after printing completes
- **Has Auto Cutter**: Whether the printer has automatic paper cutting
- **Connection Type**: USB, LAN, Bluetooth, etc.
- **Notes**: Description of the printer

## Setting Up a New Printer

### Step 1: Install the Printer Driver

**Windows:**
1. Connect the printer to your computer via USB
2. Download the appropriate driver from the manufacturer's website
3. Run the installer and select the connection type (USB for direct connection)
4. Complete the installation and test the printer

**Linux/Raspberry Pi:**
1. Connect the printer to your Pi via USB
2. Install CUPS if not already installed:
   ```bash
   sudo apt update
   sudo apt install cups
   ```
3. Add your user to the lpadmin group:
   ```bash
   sudo usermod -a -G lpadmin $USER
   ```
4. Access the CUPS web interface at `http://localhost:631`
5. Add the printer through the web interface

### Step 2: Discover the Printer in the System

1. Log in to the manager dashboard
2. Navigate to **Settings** → **Printer Management**
3. Click the **"Discover Printers"** button
4. The system will scan for available printers on your system
5. Your new printer should appear in the discovered printers list

### Step 3: Configure Printer Settings

1. Select your new printer from the **"Selected Printer (Active)"** dropdown
2. Configure the printer settings:
   - **Print Delay**: Set to 0 for auto-cutter printers, or higher for manual cutting
   - **Empty Lines Before**: Set spacing before printing (typically 2-3 lines)
   - **Empty Lines After**: Set spacing after printing (typically 2-3 lines)
3. Click **"Save Printer Settings"** to save the profile

### Step 4: Test the Printer

1. Click the **"Test Print"** button next to your printer
2. Verify that the test receipt prints correctly
3. Check the formatting, spacing, and cutting behavior
4. Adjust settings if needed and test again

## Switching Between Printers

To switch between different printers:

1. Go to **Settings** → **Printer Management**
2. Select the desired printer from the **"Selected Printer (Active)"** dropdown
3. The system will automatically load that printer's saved profile
4. Click **"Save Printer Settings"** to confirm the switch
5. Test print to verify the new printer works correctly

## Common Printer Configurations

### 80mm Thermal Printer with Auto-Cutter (Recommended)
- **Width**: 48 characters
- **Print Delay**: 0 seconds
- **Empty Lines Before**: 2
- **Empty Lines After**: 3
- **Has Auto Cutter**: Yes

### 58mm Thermal Printer without Auto-Cutter
- **Width**: 28 characters
- **Print Delay**: 2-3 seconds
- **Empty Lines Before**: 2
- **Empty Lines After**: 3
- **Has Auto Cutter**: No

### Legacy Impact Printer
- **Width**: 40 characters
- **Print Delay**: 1-2 seconds
- **Empty Lines Before**: 1
- **Empty Lines After**: 2
- **Has Auto Cutter**: No

## Troubleshooting

### Printer Not Discovered
- Ensure the printer is properly connected
- Verify the printer driver is installed
- Check that the printer is powered on
- Try restarting the system and rediscovering printers

### Test Print Fails
- Verify the printer is selected as active
- Check printer connection and power
- Ensure the printer driver is working
- Check system logs for error messages

### Receipt Formatting Issues
- Adjust the width setting in the printer profile
- Check empty lines before/after settings
- Verify the printer paper width matches the profile
- Test with different width values

### Auto-Cutter Not Working
- Ensure "Print Delay" is set to 0
- Verify the printer profile has "Has Auto Cutter" set to Yes
- Check printer manual for cutter configuration
- Test the cutter with the printer's own test function

## Printer Profile Management

The system stores printer profiles in the database under the `printer_preferences` key. The structure is:

```json
{
  "printer_profiles": {
    "Printer Name 1": {
      "width": 48,
      "print_delay_seconds": 0,
      "empty_lines_before": 2,
      "empty_lines_after": 3,
      "has_auto_cutter": true,
      "connection_type": "USB",
      "notes": "80mm thermal printer with auto-cutter"
    },
    "Printer Name 2": {
      "width": 28,
      "print_delay_seconds": 3,
      "empty_lines_before": 2,
      "empty_lines_after": 3,
      "has_auto_cutter": false,
      "connection_type": "USB",
      "notes": "58mm thermal printer without auto-cutter"
    }
  }
}
```

## Network Printers

For network printers (LAN/Wi-Fi):

1. Install the printer driver on your system
2. Configure the printer with a static IP address
3. Add the printer to your system using its IP address
4. Discover and configure it through the manager dashboard
5. Set the connection type to "LAN" in the printer profile

## Raspberry Pi Specific Notes

When deploying on Raspberry Pi:

- Use CUPS for printer management
- Ensure proper USB permissions
- Test printer connectivity before deployment
- Consider using network printers for flexibility
- Monitor CUPS logs for troubleshooting

## Backup and Recovery

Printer profiles are stored in the database and are included in regular database backups. To restore printer profiles:

1. Restore the database from backup
2. All printer profiles will be restored automatically
3. No manual reconfiguration needed

## Security Considerations

- Printer settings are protected by manager authentication
- Only logged-in managers can modify printer configurations
- Printer profiles are stored securely in the database
- Regular backups ensure configuration persistence

## Support

For issues not covered in this guide:

1. Check the system logs in the backend logs directory
2. Verify printer driver compatibility
3. Consult the printer manufacturer's documentation
4. Test the printer with other applications to isolate the issue

## Best Practices

1. **Always test** new printers with a test print before production use
2. **Save profiles** for each printer configuration you use
3. **Document** any special requirements for specific printers
4. **Regular backups** ensure you don't lose printer configurations
5. **Monitor** print jobs for errors or formatting issues
6. **Keep drivers updated** for optimal performance and compatibility
