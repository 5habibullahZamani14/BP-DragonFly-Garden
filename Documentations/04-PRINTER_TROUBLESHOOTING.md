# 04 - PRINTER TROUBLESHOOTING

The system submits Windows print jobs to the selected Windows printer queue. On Linux and
Raspberry Pi, printing uses the configured system/CUPS printer path. A message that a job
was accepted by Windows is not proof that paper printed successfully.

## Windows laptop

### Printer is missing from Printer Management

1. Confirm the printer is powered on and listed under Windows **Settings → Bluetooth &
   devices → Printers & scanners**.
2. Print a Windows test page.
3. Restart the backend after installing or changing the printer driver.
4. In **Settings → Printer Management**, discover printers again and select the exact
   Windows queue name.

Windows printer sharing and `print_gdi.exe` are not required for the application's
Windows print-queue path.

### Print job is accepted but no paper comes out

- Check the Windows queue for paused, offline, or failed jobs.
- Check the printer's power, paper, cable/network connection, and status indicators.
- Confirm the same queue can print a Windows test page.
- Check backend output for printer submission errors.

### A print job needs review

- The application did not receive confirmation that submission finished. The job might
  already be in the queue or printed.
- Inspect the operating-system queue and the physical printer before arranging a manual
  reprint. Do not mark the job reviewed until you have checked; marking it reviewed does
  not reprint it.
- The application will not automatically retry uncertain jobs, to avoid duplicate tickets.

### Width, margins, or cutting are wrong

- Check the manufacturer's driver settings and selected paper size.
- Adjust the application printer profile and print a test ticket.
- Cutter operation depends on the driver/printer. The app's Windows queue submission does
  not itself guarantee that a cut command is sent or that paper was cut.

## Raspberry Pi / Linux

- Check that CUPS lists the printer with `lpstat -p`.
- Confirm the printer is enabled, connected, and selected in Printer Management.
- Check CUPS and backend logs for the specific failure.
- Confirm the selected queue/driver is compatible with the printer before using a raw
  thermal-print configuration.

## Before putting a printer into service

- Print a test ticket from the app.
- Confirm the text is readable and fits the paper.
- Verify physical output and, if applicable, the cutter.
- Repeat the test after changing the driver, printer queue, or printer profile.

For platform-specific setup, see
[03.2-PRINTER_SETUP.md](03.2-PRINTER_SETUP.md) (Windows) and
[02.3-PRINTER_SETUP.md](02.3-PRINTER_SETUP.md) (Raspberry Pi).
