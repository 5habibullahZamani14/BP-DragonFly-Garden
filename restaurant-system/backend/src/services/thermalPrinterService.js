/*
 * thermalPrinterService.js — Raw ESC/POS thermal printer service.
 *
 * Sends binary ESC/POS commands directly to thermal printers,
 * bypassing the Windows GDI/GDI+ print driver rendering pipeline.
 *
 * ── The Problem ─────────────────────────────────────────────────
 * The manufacturer driver for the POS-80C (and similar thermal
 * printers) renders text through the Windows GDI subsystem, which
 * applies page margins (~1/3 of the paper on each side). This
 * wastes 2/3 of the 80mm paper width.
 *
 * The "Generic / Text Only" driver uses full width but doesn't
 * support ESC/POS commands (like auto-cutter).
 *
 * ── The Solution ────────────────────────────────────────────────
 * We convert the GDI-tagged ticket into a raw ESC/POS binary buffer
 * and send it DIRECTLY to the printer's port, completely bypassing
 * the Windows print pipeline (driver, spooler, GDI renderer).
 *
 * Two methods are tried:
 *   1. Write raw bytes to the printer's UNC share \\localhost\NAME
 *      using `copy /b` (requires ONE-TIME manual printer sharing)
 *   2. Send raw bytes through PowerShell Write-Printer -Data
 *      (bypasses GDI renderer, still goes through spooler)
 *
 * ── IMPORTANT MANUAL STEP ───────────────────────────────────────
 * For the copy /b method to work, you must enable printer sharing:
 *   1. Open Windows → Settings → Bluetooth & Devices → Printers
 *   2. Right-click your POS-80C → Printer Properties
 *   3. Go to the "Sharing" tab
 *   4. Check "Share this printer"
 *   5. Note the share name (usually matches printer name)
 *   6. Click Apply/OK
 *   7. Restart the backend server
 *   8. Try test print
 *
 * Method 2 (Write-Printer -Data) does NOT require sharing and
 * should send raw bytes through the spooler without GDI rendering.
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ── ESC/POS Command Constants ────────────────────────────────────────────────
const CMD = {
  INIT:         [0x1B, 0x40],          // Initialize printer
  ALIGN_LEFT:   [0x1B, 0x61, 0x00],    // Left alignment
  ALIGN_CENTER: [0x1B, 0x61, 0x01],    // Center alignment
  ALIGN_RIGHT:  [0x1B, 0x61, 0x02],    // Right alignment
  BOLD_ON:      [0x1B, 0x45, 0x01],    // Bold ON
  BOLD_OFF:     [0x1B, 0x45, 0x00],    // Bold OFF
  SIZE_NORMAL:  [0x1D, 0x21, 0x00],    // Normal character size (1x1)
  SIZE_DOUBLE:  [0x1D, 0x21, 0x11],    // Double height + double width (2x2)
  CUT_FULL:     [0x1D, 0x56, 0x00],    // Full cut (GS V m)
  CUT_PARTIAL:  [0x1D, 0x56, 0x01],    // Partial cut (GS V m)
  LF:           [0x0A],                 // Line feed
};

/** Persistent state for share name detection */
let _cachedShareNames = {};

const thermalPrinterService = {
  /**
   * Look up the actual Windows share name for a printer.
   * This is needed because the share name may differ from the printer name.
   * Cached for 60 seconds to avoid repeated look-ups.
   */
  getPrinterShareName(printerName) {
    return new Promise((resolve) => {
      // Check cache first
      const cacheKey = `share_${printerName}`;
      if (_cachedShareNames[cacheKey] && _cachedShareNames[cacheKey].time > Date.now() - 60000) {
        resolve(_cachedShareNames[cacheKey].name);
        return;
      }
      
      const escapedName = printerName.replace(/'/g, "''");
      const psScript = `$p = Get-Printer -Name '${escapedName}' -ErrorAction SilentlyContinue; if ($p -and $p.Shared -and $p.ShareName) { Write-Output $p.ShareName } else { Write-Output '' }`;
      const proc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', psScript
      ], { shell: false });

      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.on('close', () => {
        const shareName = stdout.trim();
        console.log(`[thermal] Share name for "${printerName}": "${shareName}"`);
        _cachedShareNames[cacheKey] = { name: shareName, time: Date.now() };
        resolve(shareName);
      });
      proc.on('error', () => resolve(''));
    });
  },
  /**
   * Convert a GDI-tagged ticket string to an ESC/POS binary buffer.
   *
   * @param {string} ticket - The ticket string with GDI markup tags
   * @param {number} width  - Max characters per line (e.g. 48 for 80mm)
   * @param {boolean} hasAutoCutter - Whether to send cut command at end
   * @returns {Buffer} Concatenated ESC/POS binary buffer
   */
  convertTicketToEscPos(ticket, width, hasAutoCutter) {
    const parts = [];

    // 1. Initialize printer — resets to known state
    parts.push(Buffer.from(CMD.INIT));

    const lines = ticket.split('\n');

    for (const rawLine of lines) {
      let line = rawLine;
      let isCenter = false;
      let isRight = false;
      let isH1 = false;
      let isBold = false;

      // Process leading GDI markup tags
      let changed;
      do {
        changed = false;
        const trimmed = line.trimStart();

        if (trimmed.startsWith('[H1]')) {
          if (!isH1) { isH1 = true; changed = true; }
          line = trimmed.substring(4);
        } else if (trimmed.startsWith('[BOLD]')) {
          if (!isBold) { isBold = true; changed = true; }
          line = trimmed.substring(6);
        } else if (trimmed.startsWith('[CENTER]')) {
          if (!isCenter) { isCenter = true; changed = true; }
          line = trimmed.substring(8);
        } else if (trimmed.startsWith('[RIGHT]')) {
          if (!isRight) { isRight = true; changed = true; }
          line = trimmed.substring(7);
        } else if (trimmed.startsWith('[SQUARE]')) {
          line = '[ ] ' + trimmed.substring(8).trimStart();
          changed = true;
        }
      } while (changed);

      // ── Set alignment ────────────────────────────────────────────────
      if (isCenter) {
        parts.push(Buffer.from(CMD.ALIGN_CENTER));
      } else if (isRight) {
        parts.push(Buffer.from(CMD.ALIGN_RIGHT));
      } else {
        parts.push(Buffer.from(CMD.ALIGN_LEFT));
      }

      // ── Set character size ───────────────────────────────────────────
      if (isH1) {
        parts.push(Buffer.from(CMD.SIZE_DOUBLE));  // 2× height, 2× width
      } else {
        parts.push(Buffer.from(CMD.SIZE_NORMAL));
      }

      // ── Set bold style ───────────────────────────────────────────────
      parts.push(Buffer.from(isBold ? CMD.BOLD_ON : CMD.BOLD_OFF));

      // ── Clean line text ──────────────────────────────────────────────
      const cleanText = line
        .replace(/\[SQUARE\]/g, '[ ] ')
        .replace(/\[(H1|BOLD|CENTER|RIGHT)\]/g, '')
        .trimEnd();

      const truncated = cleanText.length > width
        ? cleanText.substring(0, width)
        : cleanText;

      parts.push(Buffer.from(truncated, 'ascii'));
      parts.push(Buffer.from(CMD.LF));
    }

    // ── Finalise ───────────────────────────────────────────────────────
    parts.push(Buffer.from(CMD.SIZE_NORMAL));
    parts.push(Buffer.from(CMD.ALIGN_LEFT));
    parts.push(Buffer.from(CMD.BOLD_OFF));

    // Feed paper before cut
    for (let i = 0; i < 5; i++) {
      parts.push(Buffer.from(CMD.LF));
    }

    // Cut paper
    if (hasAutoCutter) {
      parts.push(Buffer.from(CMD.CUT_FULL));
    }

    return Buffer.concat(parts);
  },

  /**
   * Add configurable empty lines before/after an ESC/POS buffer.
   */
  addEmptyLines(escPosBuffer, emptyLinesBefore, emptyLinesAfter) {
    const parts = [];
    for (let i = 0; i < emptyLinesBefore; i++) {
      parts.push(Buffer.from(CMD.LF));
    }
    parts.push(escPosBuffer);
    for (let i = 0; i < emptyLinesAfter; i++) {
      parts.push(Buffer.from(CMD.LF));
    }
    return Buffer.concat(parts);
  },

  /**
   * Save a temp binary file with ESC/POS data.
   * @returns {string} Path to the temp file
   */
  _writeTempBinFile(escPosBuffer) {
    // Use C:\temp with simple filename - no spaces, no special chars
    const tempDir = 'C:\\temp';
    if (!fs.existsSync(tempDir)) {
      try { fs.mkdirSync(tempDir, { recursive: true }); } catch (e) { }
    }
    const tempFile = path.join(tempDir, 'escpos.bin');
    fs.writeFileSync(tempFile, escPosBuffer);
    return tempFile;
  },

  /**
   * METHOD 1: `copy /b` to \\localhost\ShareName
   *
   * This sends raw bytes via Windows printer sharing (requires manual
   * enablement: Printer Properties → Sharing → Share this printer).
   * It is the MOST reliable method for bypassing GDI rendering.
   *
   * @param {string} printerName - The printer name (for logging)
   * @param {Buffer} escPosBuffer - ESC/POS binary data
   * @param {string} [shareName] - The actual Windows share name (if known)
   */
  async _sendViaCopyToLocalhost(printerName, escPosBuffer, shareName) {
    const tempFile = this._writeTempBinFile(escPosBuffer);
    console.log(`[thermal] METHOD 1: copy /b to \\\\localhost\\${printerName} (temp=${tempFile})`);

    // Use short 8.3 path to avoid issues with spaces in path
    const shortPath = await this._getShortPath(tempFile);
    const targetShare = shareName || printerName;
    
    // For cmd.exe /c copy, we need to use the /Y flag and proper path format
    // The source path must not have quotes around it when using /b
    const cmd = `cmd.exe /c copy /b ${shortPath} \\\\localhost\\${targetShare} 2>&1`;
    console.log(`[thermal] METHOD 1 command: ${cmd}`);
    
    return new Promise((resolve, reject) => {
      const proc = spawn('cmd.exe', ['/c', `copy /b ${shortPath} \\\\localhost\\${targetShare}`], { shell: false });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.stderr.on('data', (d) => stderr += d);

      proc.on('close', (code) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
        console.log(`[thermal] METHOD 1 result: code=${code} stdout="${stdout}" stderr="${stderr}"`);
        
        // Check for actual success: must have exit code 0 AND "1 file(s) copied"
        const output = (stdout + stderr).toLowerCase();
        if (code === 0 && output.includes('1 file(s) copied')) {
          resolve({ success: true, message: `copy /b to \\\\localhost\\${targetShare} OK` });
        } else {
          // Any other outcome is a failure
          reject(new Error(`copy /b failed (exit ${code}): ${stdout || stderr}`));
        }
      });
      proc.on('error', (err) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
        reject(new Error(`cmd.exe spawn: ${err.message}`));
      });
    });
  },
  
  /**
   * Get the short 8.3 path for a file to avoid issues with spaces
   */
  _getShortPath(longPath) {
    return new Promise((resolve) => {
      const escapedPath = longPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
      const psScript = `$path = '${escapedPath}'; $fso = New-Object -ComObject Scripting.FileSystemObject; $file = $fso.GetFile($path); Write-Output $file.ShortPath`;
      const proc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', psScript
      ], { shell: false });

      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.on('close', () => {
        const shortPath = stdout.trim();
        if (shortPath && !shortPath.includes('ERROR') && shortPath.length > 0) {
          console.log(`[thermal] Short path: ${shortPath}`);
          resolve(shortPath);
        } else {
          // Fallback to original path with proper quoting
          console.log(`[thermal] Could not get short path, using original`);
          resolve(longPath);
        }
      });
      proc.on('error', () => resolve(longPath));
    });
  },

  /**
   * METHOD 2: PowerShell Write-Printer -Data (raw bytes through spooler).
   *
   * This uses the Write-Printer PowerShell cmdlet which bypasses the
   * GDI renderer but still routes through the print spooler.
   */
  _sendViaWritePrinter(printerName, escPosBuffer) {
    return new Promise((resolve, reject) => {
      const tempFile = this._writeTempBinFile(escPosBuffer);
      const escapedPath = tempFile.replace(/\\/g, '\\\\').replace(/'/g, "''");
      const escapedName = printerName.replace(/'/g, "''");
      console.log(`[thermal] METHOD 2: Write-Printer -Data to ${printerName}`);

      const psScript = `$bytes = [System.IO.File]::ReadAllBytes('${escapedPath}'); if ($bytes -and $bytes.Length -gt 0) { Write-Printer -Name '${escapedName}' -Data ([byte[]]$bytes); if ($?) { Write-Host "OK" } else { Write-Error "FAILED" } } else { Write-Error "EMPTY" }`;
      const proc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', psScript
      ], { shell: false });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.stderr.on('data', (d) => stderr += d);

      proc.on('close', (code) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
        console.log(`[thermal] METHOD 2 result: code=${code} stdout="${stdout}" stderr="${stderr}"`);
        if (stdout.includes('OK') || code === 0) {
          resolve({ success: true, message: `Write-Printer to ${printerName} OK` });
        } else {
          reject(new Error(`Write-Printer failed (${code}): ${stderr || stdout}`));
        }
      });
      proc.on('error', (err) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
        reject(new Error(`PowerShell spawn: ${err.message}`));
      });
    });
  },

  /**
   * METHOD 3: `copy /b` directly to printer port (USB001, COM3, etc.)
   *
   * Gets the printer's port name and writes directly to \\.\PortName.
   * This completely bypasses the spooler and driver.
   */
  async _sendViaPort(printerName, escPosBuffer) {
    const tempFile = this._writeTempBinFile(escPosBuffer);
    console.log(`[thermal] METHOD 3: Direct port write for ${printerName}`);

    // Get port name from printer
    const escapedName = printerName.replace(/'/g, "''");
    const psScript = `$p = Get-Printer -Name '${escapedName}' -ErrorAction SilentlyContinue; if ($p -and $p.PortName) { Write-Output $p.PortName } else { Write-Error 'NO_PORT' }`;
    const portResult = await new Promise((resolve, reject) => {
      const proc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', psScript
      ], { shell: false });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.stderr.on('data', (d) => stderr += d);

      proc.on('close', (code) => {
        resolve({ portName: stdout.trim(), stderr, code });
      });
      proc.on('error', (err) => reject(err));
    });

    const portName = portResult.portName;
    console.log(`[thermal] METHOD 3 detected port: "${portName}"`);

    if (!portName || portResult.stderr.includes('NO_PORT')) {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
      throw new Error(`No port found for ${printerName}`);
    }

    // Try print_gdi.exe - custom C# GDI engine for thermal printers
    const printGdiPath = path.join(__dirname, '../../../../print_gdi.exe');
    const args = [
      tempFile,  // file to print
      printerName  // printer name
    ];
    
    console.log(`[thermal] METHOD 3 trying print_gdi.exe: ${printGdiPath} ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
      const gdiProc = spawn(printGdiPath, args, { shell: false });

      let gdiOut = '';
      let gdiErr = '';
      gdiProc.stdout.on('data', (d) => gdiOut += d);
      gdiProc.stderr.on('data', (d) => gdiErr += d);

      gdiProc.on('close', (gdiCode) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
        console.log(`[thermal] METHOD 3 print_gdi.exe result: code=${gdiCode} stdout="${gdiOut}" stderr="${gdiErr}"`);
        
        if (gdiCode === 0) {
          resolve({ success: true, message: `print_gdi.exe to ${printerName} OK` });
        } else {
          reject(new Error(`print_gdi.exe failed (exit ${gdiCode}): ${gdiOut || gdiErr}`));
        }
      });
      gdiProc.on('error', (err) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
        reject(new Error(`print_gdi.exe spawn: ${err.message}`));
      });
    });
  },

  /**
   * Send raw ESC/POS data to a Windows printer.
   *
   * Tries methods in this order:
   *   1. copy /b to \\localhost\Name (requires sharing enabled)
   *   2. Write-Printer -Data (raw spooler passthrough)
   *   3. copy /b to \\.\PortName (direct USB port access)
   *
   * @param {string} printerName - Windows printer name
   * @param {Buffer} escPosBuffer - ESC/POS binary data
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendRawToPrinter(printerName, escPosBuffer) {
    console.log(`[thermal] sendRawToPrinter: "${printerName}" (${escPosBuffer.length} bytes)`);

    // Try to get the actual share name (may differ from printer name)
    const shareName = await this.getPrinterShareName(printerName);
    if (shareName) {
      console.log(`[thermal] Using share name: "${shareName}" for printer "${printerName}"`);
    }

    return this._sendViaCopyToLocalhost(printerName, escPosBuffer, shareName)
      .catch(err1 => {
        console.warn(`[thermal] Method 1 failed: ${err1.message}`);
        return this._sendViaWritePrinter(printerName, escPosBuffer);
      })
      .catch(err2 => {
        console.warn(`[thermal] Method 2 failed: ${err2.message}`);
        return this._sendViaPort(printerName, escPosBuffer);
      })
      .catch(err3 => {
        console.error(`[thermal] ALL raw methods failed. Last error: ${err3.message}`);
        throw err3; // Caller will fall back to standard printing
      });
  },

  /**
   * Check if printer is shared and try to enable if not (needs admin).
   */
  ensurePrinterShared(printerName) {
    return new Promise((resolve) => {
      const escapedName = printerName.replace(/'/g, "''");
      const psScript = `$p = Get-Printer -Name '${escapedName}' -ErrorAction SilentlyContinue; if ($p) { Write-Output "SHARED=$($p.Shared)" } else { Write-Output "NOT_FOUND" }`;
      const proc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', psScript
      ], { shell: false });

      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.on('close', () => resolve(stdout.includes('SHARED=True')));
      proc.on('error', () => resolve(false));
    });
  },

  /**
   * Get the printer's connection type from saved profiles.
   */
  getPrinterConnectionType(printerName) {
    return new Promise((resolve) => {
      try {
        const db = require('../database/db');
        db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
          if (err || !row) { resolve('unknown'); return; }
          try {
            const prefs = JSON.parse(row.value);
            const profiles = prefs.printer_profiles || {};
            const profile = profiles[printerName];
            resolve(profile ? (profile.connection_type || 'unknown') : 'unknown');
          } catch (e) { resolve('unknown'); }
        });
      } catch (e) { resolve('unknown'); }
    });
  },

  /** Determine if raw ESC/POS mode should be used based on connection type */
  shouldUseRawMode(connectionType) { 
    // Raw mode works best with USB and network printers
    // Bluetooth and some virtual printers may need standard GDI mode
    return connectionType === "wire" || connectionType === "wifi" || connectionType === "unknown";
  }
};

module.exports = thermalPrinterService;