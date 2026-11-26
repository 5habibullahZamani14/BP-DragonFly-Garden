# 01 - QUICK START

This is a checklist, not a five-minute installation. It assumes the Raspberry Pi has
already been installed, configured, and tested. For a new installation, use
[02-PI_SETUP_GUIDE.md](02-PI_SETUP_GUIDE.md) or
[03-LAPTOP_SETUP_GUIDE.md](03-LAPTOP_SETUP_GUIDE.md).

## What you need

- A configured Raspberry Pi or Windows computer with the project installed.
- Node.js 20 or newer on Windows; use the version and systemd setup described in the
  relevant installation guide on Linux.
- A valid machine-specific backend `.env` containing a non-placeholder `JWT_SECRET`.
- A receipt printer installed and tested by the operating system.
- Manager login credentials. Do not put credentials in this document.

The actual printer model, paper width, cutter capability, Wi-Fi name/password, server
address, and manager credentials must be confirmed on the installed equipment. Do not
assume a model, width, or cutter based on an example in an old guide.

## Start and verify the configured system

1. Start the server:
   - Raspberry Pi with systemd: `sudo systemctl start dragonfly-garden`
   - Windows: double-click the Manager or Employee desktop shortcut, or run
     [`START_DRAGONFLY_GARDEN.bat`](../Start%20the%20app%20in%20deployment%20form/Pc/START_DRAGONFLY_GARDEN.bat)
     for the manager view. The backend starts in the background; no command window
     needs to stay open.
2. From the server, check `http://127.0.0.1:5000/health`.
3. Connect a phone/computer to the same trusted network. Open the published app address
   in a browser; do not assume the device will open it automatically.
4. Sign in with the manager's credentials.
5. In **Settings → Printer Management**, select the installed printer and submit a test
   print. Confirm the paper physically prints and check cutter behavior separately.
6. Confirm the menu and existing data before accepting orders.

## If something fails

- Network setup: [02.2-NETWORK_HOTSPOT.md](02.2-NETWORK_HOTSPOT.md)
- Printer setup/troubleshooting: [04-PRINTER_TROUBLESHOOTING.md](04-PRINTER_TROUBLESHOOTING.md)
- Backups/recovery: [05-DISASTER_RECOVERY.md](05-DISASTER_RECOVERY.md)
- Updates: [06-UPDATE_GUIDE.md](06-UPDATE_GUIDE.md)

The system can perform core local-network operations without internet after setup.
Optional email/cloud integrations and downloading updates require internet access. This
guide does not certify the physical printer, Wi-Fi coverage, or production readiness;
test those on site.
