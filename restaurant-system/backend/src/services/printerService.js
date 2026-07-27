/*
 * printerService.js — Thermal printer integration for order tickets.
 * Rewritten to support Advanced C# GDI Printing with Rich Text tags
 * on Windows, and clean plain-text fallback on Linux (Raspberry Pi).
 * 
 * Updated with circuit breaker pattern for resilience.
 * 
 * Width handling:
 * - 80mm paper = ~48 characters per line
 * - 50mm paper = ~32 characters per line  
 * - Width is set per-printer in the printer profile (stored in DB)
 * - The ticket formatters dynamically use the configured width
 * - Hardcoded fallback: 48 chars (80mm paper)
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../database/db");
const { withCircuitBreaker, STATE } = require("./circuitBreaker");

// Load thermalPrinterService with explicit error logging
let thermalPrinterService;
try {
  thermalPrinterService = require("./thermalPrinterService");
  console.log("[thermal] thermalPrinterService loaded successfully");
} catch (err) {
  console.error("[thermal] FAILED to load thermalPrinterService:", err.message);
  // Create a stub so the rest of the code doesn't crash
  thermalPrinterService = {
    convertTicketToEscPos: () => Buffer.from(""),
    addEmptyLines: (buf) => buf,
    sendRawToPrinter: () => Promise.reject(new Error("thermalPrinterService not loaded")),
    ensurePrinterShared: () => Promise.resolve(false),
    getPrinterShareName: () => Promise.resolve(""),
    getPrinterConnectionType: () => Promise.resolve("unknown"),
    shouldUseRawMode: () => false
  };
}

// Default width for 50mm thermal paper (32 chars). Can be overridden per printer.
const DEFAULT_PRINTER_WIDTH = 32;

const centerText = (text, width = DEFAULT_PRINTER_WIDTH) => {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
};

/**
 * Draw a separator line using the configured width
 */
const separator = (width = DEFAULT_PRINTER_WIDTH) => '='.repeat(Math.max(10, width));

/**
 * Get receipt copy counts from printer preferences
 */
const getReceiptCopyCounts = () => {
  return new Promise((resolve, reject) => {
    const defaultCopies = {
      order_customer: 1,
      order_kitchen: 1,
      addon_customer: 1,
      addon_kitchen: 1,
      final_receipt: 1,
      daily_sales_report: 1
    };
    
    db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(defaultCopies);
        return;
      }
      
      try {
        const prefs = JSON.parse(row.value);
        const receiptCopies = prefs.receipt_copies || {};
        const globalCopies = receiptCopies.global || {};
        
        resolve({
          order_customer: globalCopies.order_customer || 1,
          order_kitchen: globalCopies.order_kitchen || 1,
          addon_customer: globalCopies.addon_customer || 1,
          addon_kitchen: globalCopies.addon_kitchen || 1,
          final_receipt: globalCopies.final_receipt || 1,
          daily_sales_report: globalCopies.daily_sales_report || 1
        });
      } catch (e) {
        console.error("Error parsing receipt copy counts:", e);
        resolve(defaultCopies);
      }
    });
  });
};

/**
 * Get printer-specific settings from printer profiles
 * Falls back to global settings if printer-specific settings not found
 */
const getPrinterSettings = (printerName) => {
  return new Promise((resolve, reject) => {
    const defaultSettings = {
      width: DEFAULT_PRINTER_WIDTH,
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      marginBottom: 0,
      delaySeconds: 0,
      emptyLinesBefore: 2,
      emptyLinesAfter: 3,
      hasAutoCutter: false
    };
    
    db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(defaultSettings);
        return;
      }
      
      try {
        const prefs = JSON.parse(row.value);
        const printerProfiles = prefs.printer_profiles || {};
        const printerProfile = printerProfiles[printerName];
        
        if (printerProfile) {
          resolve({
            width: printerProfile.width || DEFAULT_PRINTER_WIDTH,
            marginLeft: printerProfile.margin_left || 0,
            marginRight: printerProfile.margin_right || 0,
            marginTop: printerProfile.margin_top || 0,
            marginBottom: printerProfile.margin_bottom || 0,
            delaySeconds: printerProfile.print_delay_seconds || 0,
            emptyLinesBefore: printerProfile.empty_lines_before || 2,
            emptyLinesAfter: printerProfile.empty_lines_after || 3,
            hasAutoCutter: printerProfile.has_auto_cutter || false
          });
        } else {
          resolve(defaultSettings);
        }
      } catch (e) {
        console.error("Error parsing printer preferences:", e);
        resolve(defaultSettings);
      }
    });
  });
};

/**
 * Get the currently selected printer from database settings
 * Falls back to default printer if selected is not available
 */
const getSelectedPrinter = () => {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM restaurant_settings WHERE key = 'selected_printer'", (err, row) => {
      if (err) {
        reject(err);
      } else {
        const selectedPrinter = row ? row.value : null;
        
        if (!selectedPrinter) {
          db.get("SELECT value FROM restaurant_settings WHERE key = 'default_printer'", (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row ? row.value : "BP_DragonFly_Garden_Confirmed");
            }
          });
        } else {
          resolve(selectedPrinter);
        }
      }
    });
  });
};

const formatDateTime = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatTableNumber = (tableNumber) => {
  if (!tableNumber) return "";
  const trimmed = tableNumber.trim();
  if (/^table\b/i.test(trimmed)) {
    return trimmed;
  }
  if (/(takeaway|delivery|pickup)/i.test(trimmed)) {
    return trimmed;
  }
  return `Table: ${trimmed}`;
};

/* Strips GDI tags and applies alignment manually for non-Windows (Linux/Raspberry Pi) raw print fallback. */
const stripGdiTags = (ticket, width = DEFAULT_PRINTER_WIDTH) => {
  return ticket
    .split('\n')
    .map(line => {
      let isCenter = false;
      let isRight = false;
      let isSquare = false;
      let cleanLine = line.trimEnd();

      while (cleanLine.startsWith("[")) {
        if (cleanLine.startsWith("[H1]")) {
          cleanLine = cleanLine.substring(4).trim();
        } else if (cleanLine.startsWith("[BOLD]")) {
          cleanLine = cleanLine.substring(6).trim();
        } else if (cleanLine.startsWith("[CENTER]")) {
          isCenter = true;
          cleanLine = cleanLine.substring(8).trim();
        } else if (cleanLine.startsWith("[RIGHT]")) {
          isRight = true;
          cleanLine = cleanLine.substring(7).trim();
        } else if (cleanLine.startsWith("[SQUARE]")) {
          isSquare = true;
          cleanLine = cleanLine.substring(8).trim();
        } else {
          break;
        }
      }

      if (isSquare) {
        cleanLine = "[ ] " + cleanLine;
      }

      if (isCenter) {
        cleanLine = centerText(cleanLine, width);
      } else if (isRight) {
        cleanLine = cleanLine.padStart(width, ' ');
      }
      return cleanLine;
    })
    .join('\n');
};

// ── Dynamic width helper ─────────────────────────────────────────────
// All ticket formatters now accept an optional 'width' parameter.
// The print functions resolve the printer's configured width and pass it
// to the formatters, so separators, padding, and text wrapping all fit
// the actual paper size (50mm = 32 chars, 80mm = 48 chars).

/**
 * Format a ticket line with proper padding for a given width.
 * Wraps long text to fit within the available space.
 */
const wrapText = (text, maxWidth) => {
  if (!text || text.length <= maxWidth) return [text || ''];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxWidth) {
      if (cur) lines.push(cur.trim());
      cur = word.length > maxWidth ? word.substring(0, maxWidth) : word;
    } else {
      cur = cur ? cur + ' ' + word : word;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
};

/**
 * Internal print execution logic (not wrapped with circuit breaker).
 * This is the actual implementation that gets wrapped.
 */
const _executePrintWithPrinter = (ticket, filenamePrefix, printerName) =>
  new Promise((resolve, reject) => {
    try {
      console.log(`\n========== PRINTING ${filenamePrefix} TO SPECIFIC PRINTER: ${printerName} ==========`);
      console.log(ticket);
      console.log("=====================================\n");

      // Use system temp directory with shorter path to avoid issues
      const os = require('os');
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      const filename = `${filenamePrefix}_${timestamp}.txt`;
      const filepath = path.join(tempDir, filename);

      getPrinterSettings(printerName)
        .then(settings => {
          console.log(`Printer settings: width=${settings.width}, margins=${settings.marginLeft},${settings.marginRight},${settings.marginTop},${settings.marginBottom}, delay=${settings.delaySeconds}s, before=${settings.emptyLinesBefore} lines, after=${settings.emptyLinesAfter} lines, autoCutter=${settings.hasAutoCutter}`);
          
          // For test prints, skip margin application
          const isTestPrint = filenamePrefix === 'printer_test';
          let finalTicket;
          
          if (isTestPrint) {
            finalTicket = ticket;
            console.log(`Test print detected, skipping margin application`);
          } else {
            // Apply margins by adding spaces/padding
            const leftMargin = ' '.repeat(settings.marginLeft);
            const rightMargin = ' '.repeat(settings.marginRight);
            const topMargin = '\n'.repeat(settings.marginTop);
            const bottomMargin = '\n'.repeat(settings.marginBottom);
            
            // Calculate effective width (total width minus margins)
            const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
            
            const cleanTicket = stripGdiTags(ticket, effectiveWidth > 0 ? effectiveWidth : settings.width);
            
            // Apply left margin to each line
            const ticketWithMargins = cleanTicket.split('\n').map(line => leftMargin + line).join('\n');
            
            const beforeLines = topMargin + '\n'.repeat(settings.emptyLinesBefore);
            const afterLines = '\n'.repeat(settings.emptyLinesAfter) + bottomMargin;
            finalTicket = beforeLines + ticketWithMargins + afterLines;
          }
          
          console.log(`Ticket length: ${finalTicket.length} chars`);

          if (process.platform === "win32") {
            console.log(`[thermal] Windows platform detected, printing to: ${printerName}`);
            
            // Write content to system temp directory (short path, no spaces)
            const os = require('os');
            const tempDir = os.tmpdir();
            const tempFilename = `${filenamePrefix}_${Date.now()}.txt`;
            const tempFilepath = path.join(tempDir, tempFilename);
            const formattedTicketCRLF = finalTicket.replace(/\n/g, "\r\n");
            fs.writeFileSync(tempFilepath, formattedTicketCRLF);

            const tryPrintMethods = async () => {
              const methods = [];
              
              // METHOD 1: cmd.exe /c copy /b to \\localhost\PrinterName (most reliable)
              methods.push(async () => {
                return new Promise((resolveMethod, rejectMethod) => {
                  const escapedPath = tempFilepath.includes(' ') ? `"${tempFilepath}"` : tempFilepath;
                  const escapedPrinter = printerName.replace(/'/g, "''");
                  const cmd = `copy /b ${escapedPath} "\\\\localhost\\${escapedPrinter}"`;
                  console.log(`[thermal] METHOD 1: copy /b: ${cmd}`);
                  const proc = spawn('cmd.exe', ['/c', cmd], { shell: false });
                  let stdout = '', stderr = '';
                  proc.stdout.on('data', d => stdout += d);
                  proc.stderr.on('data', d => stderr += d);
                  proc.on('close', (code) => {
                    const output = (stdout + stderr).toLowerCase();
                    if (code === 0 && output.includes('1 file(s) copied')) {
                      resolveMethod({ success: true, method: 'copy' });
                    } else {
                      rejectMethod(new Error(`copy /b failed (${code}): ${stdout || stderr}`));
                    }
                  });
                  proc.on('error', (err) => rejectMethod(new Error(`copy spawn: ${err.message}`)));
                });
              });
              
              // METHOD 2: cmd.exe /c print command (Windows built-in)
              methods.push(async () => {
                return new Promise((resolveMethod, rejectMethod) => {
                  const escapedPrinter = printerName.replace(/"/g, '\\"');
                  const escapedPath = tempFilepath;
                  const cmd = `print /D:"${escapedPrinter}" "${escapedPath}"`;
                  console.log(`[thermal] METHOD 2: print /D: ${cmd}`);
                  const proc = spawn('cmd.exe', ['/c', cmd], { shell: false });
                  let stdout = '', stderr = '';
                  proc.stdout.on('data', d => stdout += d);
                  proc.stderr.on('data', d => stderr += d);
                  proc.on('close', (code) => {
                    if (code === 0) {
                      resolveMethod({ success: true, method: 'print' });
                    } else {
                      rejectMethod(new Error(`print command failed (${code}): ${stdout || stderr}`));
                    }
                  });
                  proc.on('error', (err) => rejectMethod(new Error(`print spawn: ${err.message}`)));
                });
              });
              
              // METHOD 3: Write directly to printer port
              methods.push(async () => {
                const escapedName = printerName.replace(/'/g, "''");
                const portScript = `$p = Get-Printer -Name '${escapedName}' -ErrorAction SilentlyContinue; if ($p -and $p.PortName) { Write-Output $p.PortName } else { Write-Error 'NO_PORT' }`;
                const portName = await new Promise((resolvePort) => {
                  const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', portScript], { shell: false });
                  let stdout = '';
                  proc.stdout.on('data', d => stdout += d);
                  proc.on('close', () => resolvePort(stdout.trim()));
                  proc.on('error', () => resolvePort(''));
                });
                if (!portName) throw new Error('No port name found');
                console.log(`[thermal] METHOD 3: Direct port write to \\\\.\\${portName}`);
                return new Promise((resolveMethod, rejectMethod) => {
                  const escapedPath = tempFilepath.includes(' ') ? `"${tempFilepath}"` : tempFilepath;
                  const cmd = `copy /b ${escapedPath} "\\\\.\\${portName}"`;
                  const proc = spawn('cmd.exe', ['/c', cmd], { shell: false });
                  let stdout = '', stderr = '';
                  proc.stdout.on('data', d => stdout += d);
                  proc.stderr.on('data', d => stderr += d);
                  proc.on('close', (code) => {
                    const output = (stdout + stderr).toLowerCase();
                    if (code === 0 && output.includes('1 file(s) copied')) {
                      resolveMethod({ success: true, method: 'port' });
                    } else {
                      rejectMethod(new Error(`port write failed (${code}): ${stdout || stderr}`));
                    }
                  });
                  proc.on('error', (err) => rejectMethod(new Error(`port spawn: ${err.message}`)));
                });
              });

              let lastError = null;
              for (const method of methods) {
                try {
                  const result = await method();
                  console.log(`[thermal] Print succeeded via method: ${result.method}`);
                  return result;
                } catch (err) {
                  console.warn(`[thermal] Method failed: ${err.message}`);
                  lastError = err;
                }
              }
              throw lastError || new Error('All print methods failed');
            };

            tryPrintMethods()
              .then(() => {
                try { if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath); } catch (e) { }
                if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                  setTimeout(() => {
                    resolve({ success: true, message: `Ticket printed on ${printerName} with ${settings.delaySeconds}s delay`, filename });
                  }, settings.delaySeconds * 1000);
                } else {
                  resolve({ success: true, message: `Ticket printed on ${printerName}`, filename });
                }
              })
              .catch((err) => {
                try { if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath); } catch (e) { }
                reject(new Error(`Windows native print failed for ${printerName}: ${err.message}`));
              });
          } else {
            // ── Raspberry Pi / Linux: use lp command ────────────────────
            fs.writeFileSync(filepath, finalTicket);

            const proc = spawn("lp", ["-d", printerName, filepath], { shell: false });
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (data) => stdout += data);
            proc.stderr.on("data", (data) => stderr += data);
            
            proc.on("close", (code) => {
              if (code === 0) {
                if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                  setTimeout(() => {
                    resolve({ success: true, message: `Ticket printed on ${printerName} with ${settings.delaySeconds}s delay`, filename });
                  }, settings.delaySeconds * 1000);
                } else {
                  resolve({ success: true, message: `Ticket printed on ${printerName}`, filename });
                }
              } else {
                reject(new Error(`lp command failed: ${stderr}`));
              }
            });
            proc.on("error", (err) => reject(new Error(`lp execution failed: ${err.message}`)));
          }
        })
        .catch(err => {
          console.error(`Error getting printer settings for ${printerName}:`, err.message);
          reject(err);
        });
    } catch (error) {
      console.error(`Print execution error: ${error.message}`);
      reject(error);
    }
  });

const _executePrint = (ticket, filenamePrefix) =>
  new Promise((resolve, reject) => {
    try {
      console.log(`\n========== PRINTING ${filenamePrefix} ==========`);
      console.log(ticket);
      console.log("=====================================\n");

      const logsDir = path.join(__dirname, "../../logs");
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${filenamePrefix}_${timestamp}.txt`;
      const filepath = path.join(logsDir, filename);

      getSelectedPrinter()
        .then(printerName => {
          console.log(`Using printer: ${printerName}`);
          return getPrinterSettings(printerName).then(settings => ({ printerName, settings }));
        })
        .then(({ printerName, settings }) => {
          console.log(`Printer settings: width=${settings.width}, margins=${settings.marginLeft},${settings.marginRight},${settings.marginTop},${settings.marginBottom}, delay=${settings.delaySeconds}s, before=${settings.emptyLinesBefore} lines, after=${settings.emptyLinesAfter} lines, autoCutter=${settings.hasAutoCutter}`);
          
          // Apply margins by adding spaces/padding
          const leftMargin = ' '.repeat(settings.marginLeft);
          const rightMargin = ' '.repeat(settings.marginRight);
          const topMargin = '\n'.repeat(settings.marginTop);
          const bottomMargin = '\n'.repeat(settings.marginBottom);
          
          // Calculate effective width (total width minus margins)
          const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
          
          const cleanTicket = stripGdiTags(ticket, effectiveWidth > 0 ? effectiveWidth : settings.width);
          
          // Apply left margin to each line
          const ticketWithMargins = cleanTicket.split('\n').map(line => leftMargin + line).join('\n');
          
          const beforeLines = topMargin + '\n'.repeat(settings.emptyLinesBefore);
          const afterLines = '\n'.repeat(settings.emptyLinesAfter) + bottomMargin;
          const finalTicket = beforeLines + ticketWithMargins + afterLines;
          
          console.log(`Ticket length: ${finalTicket.length} chars, effective width: ${effectiveWidth}, before lines: ${settings.emptyLinesBefore + settings.marginTop}, after lines: ${settings.emptyLinesAfter + settings.marginBottom}`);

          if (process.platform === "win32") {
            console.log(`[thermal] Windows platform detected, printing to: ${printerName}`);
            
            const os = require('os');
            const tempDir = os.tmpdir();
            const tempFilepath = path.join(tempDir, `${filenamePrefix}_${Date.now()}.txt`);
            const formattedTicketCRLF = finalTicket.replace(/\n/g, "\r\n");
            fs.writeFileSync(tempFilepath, formattedTicketCRLF);

            const tryPrintMethods = async () => {
              async function method1() {
                return new Promise((res, rej) => {
                  const sp = tempFilepath.includes(' ') ? `"${tempFilepath}"` : tempFilepath;
                  const cmd = `copy /b ${sp} "\\\\localhost\\${printerName}"`;
                  console.log(`[thermal] METHOD 1: ${cmd}`);
                  const p = spawn('cmd.exe', ['/c', cmd], { shell: false });
                  let o = '', e = '';
                  p.stdout.on('data', d => o += d);
                  p.stderr.on('data', d => e += d);
                  p.on('close', (c) => {
                    if (c === 0 && (o+e).toLowerCase().includes('1 file(s) copied')) res({method:'copy'})
                    else rej(new Error(`copy /b (${c}): ${o||e}`));
                  });
                  p.on('error', rej);
                });
              }
              async function method2() {
                return new Promise((res, rej) => {
                  const cmd = `print /D:"${printerName}" "${tempFilepath}"`;
                  console.log(`[thermal] METHOD 2: ${cmd}`);
                  const p = spawn('cmd.exe', ['/c', cmd], { shell: false });
                  let o = '', e = '';
                  p.stdout.on('data', d => o += d);
                  p.stderr.on('data', d => e += d);
                  p.on('close', (c) => {
                    if (c === 0) res({method:'print'})
                    else rej(new Error(`print (${c}): ${o||e}`));
                  });
                  p.on('error', rej);
                });
              }
              let lastErr = null;
              for (const fn of [method1, method2]) {
                try { return await fn(); }
                catch (err) { console.warn(`[thermal] Method failed: ${err.message}`); lastErr = err; }
              }
              throw lastErr || new Error('All methods failed');
            };

            tryPrintMethods()
              .then((result) => {
                try { if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath); } catch (e) { }
                console.log(`[thermal] Print succeeded via: ${result.method}`);
                if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                  setTimeout(() => resolve({ success: true, message: `Ticket printed on ${printerName} with ${settings.delaySeconds}s delay`, filename }), settings.delaySeconds * 1000);
                } else {
                  resolve({ success: true, message: `Ticket printed on ${printerName}`, filename });
                }
              })
              .catch((err) => {
                try { if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath); } catch (e) { }
                reject(new Error(`Windows native print failed for ${printerName}: ${err.message}`));
              });
          } else {
            // ── Raspberry Pi / Linux: use lp command ────────────────────
            fs.writeFileSync(filepath, finalTicket);

            const proc = spawn("lp", ["-d", printerName, filepath], { shell: false });
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (data) => stdout += data);
            proc.stderr.on("data", (data) => stderr += data);
            
            proc.on("close", (code) => {
              if (code === 0) {
                if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                  setTimeout(() => {
                    resolve({ success: true, message: `Ticket printed on ${printerName} with ${settings.delaySeconds}s delay`, filename });
                  }, settings.delaySeconds * 1000);
                } else {
                  resolve({ success: true, message: `Ticket printed on ${printerName}`, filename });
                }
              } else {
                reject({ success: false, message: "Linux native print failed", error: stderr || stdout });
              }
            });
            proc.on("error", (err) => reject({ success: false, message: "Linux native print command failed", error: err.message }));
          }
        })
        .catch(err => {
          console.error("Error getting printer settings, using default:", err);
          const defaultPrinter = "BP_DragonFly_Garden_Confirmed";
          
          getPrinterSettings(defaultPrinter)
            .then(settings => {
              console.log(`Using default printer: ${defaultPrinter} with settings:`, settings);
              
              // Apply margins by adding spaces/padding
              const leftMargin = ' '.repeat(settings.marginLeft);
              const rightMargin = ' '.repeat(settings.marginRight);
              const topMargin = '\n'.repeat(settings.marginTop);
              const bottomMargin = '\n'.repeat(settings.marginBottom);
              
              // Calculate effective width (total width minus margins)
              const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
              
              const cleanTicket = stripGdiTags(ticket, effectiveWidth > 0 ? effectiveWidth : settings.width);
              
              // Apply left margin to each line
              const ticketWithMargins = cleanTicket.split('\n').map(line => leftMargin + line).join('\n');
              
              const beforeLines = topMargin + '\n'.repeat(settings.emptyLinesBefore);
              const afterLines = '\n'.repeat(settings.emptyLinesAfter) + bottomMargin;
              const finalTicket = beforeLines + ticketWithMargins + afterLines;
              
              console.log(`Fallback ticket length: ${finalTicket.length} chars, effective width: ${effectiveWidth}, before lines: ${settings.emptyLinesBefore + settings.marginTop}, after lines: ${settings.emptyLinesAfter + settings.marginBottom}`);

              if (process.platform === "win32") {
                console.log(`[thermal] Fallback printing to ${defaultPrinter}`);
                const fallbackPrint = () => new Promise((fbResolve, fbReject) => {
                  const os = require('os');
                  const tempFilepath = path.join(os.tmpdir(), `fb_${Date.now()}.txt`);
                  const formattedTicketCRLF = finalTicket.replace(/\n/g, "\r\n");
                  fs.writeFileSync(tempFilepath, formattedTicketCRLF);
                  const tryCopy = (cb) => {
                    const sp = tempFilepath.includes(' ') ? `"${tempFilepath}"` : tempFilepath;
                    const cmd = `copy /b ${sp} "\\\\localhost\\${defaultPrinter}"`;
                    const p = spawn('cmd.exe', ['/c', cmd], { shell: false });
                    let o = '', e = '';
                    p.stdout.on('data', d => o += d);
                    p.stderr.on('data', d => e += d);
                    p.on('close', (c) => {
                      try { if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath); } catch (x) { }
                      if (c === 0 && (o+e).toLowerCase().includes('1 file(s) copied')) cb(null);
                      else cb(new Error(`${o||e}`));
                    });
                    p.on('error', cb);
                  };
                  const tryPrint = (cb) => {
                    const cmd = `print /D:"${defaultPrinter}" "${tempFilepath}"`;
                    const p = spawn('cmd.exe', ['/c', cmd], { shell: false });
                    let o = '', e = '';
                    p.stdout.on('data', d => o += d);
                    p.stderr.on('data', d => e += d);
                    p.on('close', (c) => {
                      try { if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath); } catch (x) { }
                      if (c === 0) cb(null);
                      else cb(new Error(`${o||e}`));
                    });
                    p.on('error', cb);
                  };
                  tryCopy((err) => {
                    if (!err) return fbResolve();
                    console.warn(`[thermal] Fallback copy failed, trying print: ${err.message}`);
                    tryPrint((err2) => {
                      if (!err2) return fbResolve();
                      fbReject(err2 || new Error('All fallback methods failed'));
                    });
                  });
                });
                fallbackPrint()
                  .then(() => {
                    if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                      setTimeout(() => resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback) with ${settings.delaySeconds}s delay`, filename }), settings.delaySeconds * 1000);
                    } else {
                      resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback)`, filename });
                    }
                  })
                  .catch(err => {
                    reject({ success: false, message: "Fallback printing failed", error: err.message });
                  });
              } else {
                // ── Raspberry Pi / Linux fallback ────────────────────────
                fs.writeFileSync(filepath, finalTicket);
                const proc = spawn("lp", ["-d", defaultPrinter, filepath], { shell: false });
                let stdout = "";
                let stderr = "";
                proc.stdout.on("data", (data) => stdout += data);
                proc.stderr.on("data", (data) => stderr += data);
                proc.on("close", (code) => {
                  if (code === 0) {
                    if (settings.delaySeconds > 0 && !settings.hasAutoCutter) {
                      setTimeout(() => resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback) with ${settings.delaySeconds}s delay`, filename }), settings.delaySeconds * 1000);
                    } else {
                      resolve({ success: true, message: `Ticket printed on ${defaultPrinter} (fallback)`, filename });
                    }
                  } else {
                    reject({ success: false, message: "Linux native print failed", error: stderr || stdout });
                  }
                });
                proc.on("error", (err) => reject({ success: false, message: "Linux native print command failed", error: err.message }));
              }
            })
            .catch(err => {
              reject({ success: false, message: "Error getting default printer settings", error: err.message });
            });
        });
    } catch (error) {
      reject({ success: false, message: "Error printing ticket", error: error.message });
    }
  });

/**
 * executePrintWithPrinter - Wrapped with circuit breaker for resilience.
 */
const executePrintWithPrinter = async (ticket, filenamePrefix, printerName) => {
  const breaker = withCircuitBreaker('printer', _executePrintWithPrinter, {
    failureThreshold: 3,
    timeoutMs: 60000,
    successThreshold: 2
  });
  
  try {
    return await breaker(ticket, filenamePrefix, printerName);
  } catch (error) {
    if (error.message.includes('Circuit is OPEN')) {
      return {
        success: false,
        message: 'Printer service temporarily unavailable. Please try again in a moment.',
        error: error.message,
        circuitState: 'OPEN'
      };
    }
    throw error;
  }
};

/**
 * executePrint - Wrapped with circuit breaker for resilience.
 */
const executePrint = async (ticket, filenamePrefix) => {
  const breaker = withCircuitBreaker('printer', _executePrint, {
    failureThreshold: 3,
    timeoutMs: 60000,
    successThreshold: 2
  });
  
  try {
    return await breaker(ticket, filenamePrefix);
  } catch (error) {
    if (error.message.includes('Circuit is OPEN')) {
      return {
        success: false,
        message: 'Printer service temporarily unavailable. Please try again in a moment.',
        error: error.message,
        circuitState: 'OPEN'
      };
    }
    throw error;
  }
};

// ── Ticket Formatting Functions ──────────────────────────────────────────
// ALL formatters accept a 'width' parameter (defaults to DEFAULT_PRINTER_WIDTH = 32 for 50mm).
// The separator lines, text wrapping, padding, and alignment all use this width.

const printerService = {
  formatChecklistTicket: (order, itemsToPrint, isAddOn, copyTitle, width = DEFAULT_PRINTER_WIDTH) => {
    const sep = separator(width);
    const timestamp = formatDateTime(new Date());
    let ticket = "\n";
    
    let orderTypeStr = isAddOn ? "ADD-ON" : "NEW ORDER";
    if (order.order_type === 'PICKUP') orderTypeStr = isAddOn ? "ADD-ON (PICKUP)" : "PICKUP";
    else if (order.order_type === 'DELIVERY') orderTypeStr = isAddOn ? "ADD-ON (DELIVERY)" : "DELIVERY";
    else if (order.order_type === 'TAKEAWAY') orderTypeStr = isAddOn ? "ADD-ON (TAKEAWAY)" : "TAKEAWAY";
    else if (order.order_type === 'COUNTER') orderTypeStr = isAddOn ? "ADD-ON (COUNTER)" : "COUNTER ORDER";

    if (copyTitle) {
      ticket += `[CENTER][H1] ${copyTitle}\n`;
      ticket += `[CENTER][BOLD](${orderTypeStr})\n`;
    } else {
      ticket += `[CENTER][H1] ${orderTypeStr}\n`;
    }
    
    // Header row: timestamp left, ticket number right, within width
    const leftHeader = `${timestamp}`;
    const rightHeader = `#${order.daily_ticket_number || order.id}`;
    const headerPad = Math.max(0, width - leftHeader.length - rightHeader.length);
    ticket += `${leftHeader}${' '.repeat(headerPad)}${rightHeader}\n`;
    ticket += `Send by: Cashier\n`;
    
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `${formatTableNumber(order.table_number)}\n`;
    } else {
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number)}\n`;
      }
      if (order.customer_name) ticket += `Name: ${order.customer_name}\n`;
      if (order.customer_phone) ticket += `Phone: ${order.customer_phone}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `Pickup At: ${order.collection_time}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `Address: ${order.delivery_address}\n`;
    }
    ticket += `${sep}\n`;
    
    itemsToPrint.forEach(item => {
      // Wrap item name to fit width (leave room for "2x " prefix = 4 chars)
      const nameMax = width - 4;
      const nameLines = wrapText(item.item_name, nameMax);
      const qtyStr = `${item.quantity}x`.padEnd(4, ' ');
      
      nameLines.forEach((line, idx) => {
        if (idx === 0) {
          ticket += `${qtyStr} ${line}\n`;
        } else {
          ticket += `     ${line}\n`;
        }
      });

      if (item.notes) {
        const noteLines = wrapText(`Note: ${item.notes}`, width - 5);
        noteLines.forEach(line => ticket += `     ${line}\n`);
      }

      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? ` (+${parseFloat(opt.delta).toFixed(2)})` : '';
            const optText = `> ${opt.option}${suffix}`;
            const optLines = wrapText(optText, width - 5);
            optLines.forEach(line => ticket += `     ${line}\n`);
          });
        } catch { /* ignore malformed JSON */ }
      }

      ticket += "[RIGHT][SQUARE]\n";
      ticket += `${sep}\n`;
    });
    
    ticket += "\n\n";
    return ticket;
  },

  formatFinalReceipt: (order, cashierName, width = DEFAULT_PRINTER_WIDTH) => {
    const sep = separator(width);
    const timestamp = formatDateTime(new Date());
    let ticket = "\n";
    
    ticket += `[CENTER][H1] BP DRAGONFLY\n`;
    ticket += `[CENTER]GARDEN\n`;
    ticket += `[CENTER]Solok Pondok Upih\n`;
    ticket += `[CENTER]Taman Kristal\n`;
    ticket += `[CENTER]11020 Balik Pulau\n`;
    ticket += `[CENTER]Pulau Pinang\n`;
    ticket += `${sep}\n`;
    
    ticket += `Invoice: ${order.id}\n`;
    ticket += `Date: ${timestamp}\n`;
    ticket += `Cashier: ${cashierName}\n`;
    if (!order.order_type || order.order_type === 'DINE_IN') {
      ticket += `${formatTableNumber(order.table_number)}\n`;
    } else {
      ticket += `Type: ${order.order_type}\n`;
      if (order.order_type === 'COUNTER' && order.table_id !== 999 && order.table_number && order.table_number !== 'Counter Order') {
        ticket += `${formatTableNumber(order.table_number)}\n`;
      }
      if (order.customer_name) ticket += `Cust: ${order.customer_name}\n`;
      if (order.order_type === 'DELIVERY' && order.delivery_address) ticket += `Addr: ${order.delivery_address}\n`;
      if (order.order_type === 'PICKUP' && order.collection_time) ticket += `Pickup: ${order.collection_time}\n`;
    }
    ticket += "\n";
    ticket += `[H1] ORDER #${order.daily_ticket_number || order.id}\n`;
    ticket += `${sep}\n`;
    ticket += `Qty Item${' '.repeat(Math.max(1, width - 15))}Total\n`;
    ticket += `${sep}\n`;
    
    let totalQty = 0;
    
    order.items.forEach(item => {
      totalQty += item.quantity;
      const qtyStr = item.quantity.toString().padEnd(3, ' ');
      const lineTotal = (item.quantity * item.price_at_order_time).toFixed(2);
      
      // Item name truncated to fit
      const nameMax = width - 15; // room for "3 xxx...xxx  RM12.50"
      const nameStr = item.item_name.substring(0, nameMax).padEnd(nameMax, ' ');
      const priceStr = lineTotal.padStart(8, ' ');
      
      ticket += `${qtyStr} ${nameStr}${priceStr}\n`;
      
      let deltasSum = 0;
      let hasPriceDelta = false;
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            if (opt.delta) { deltasSum += parseFloat(opt.delta); hasPriceDelta = true; }
          });
        } catch {}
      }
      
      if (hasPriceDelta) {
        ticket += `    (RM ${item.price_at_order_time.toFixed(2)}/ea)\n`;
      } else if (item.price_at_order_time > 0) {
        ticket += `    (RM ${item.price_at_order_time.toFixed(2)}/ea)\n`;
      }
      
      if (item.options_json) {
        try {
          const opts = JSON.parse(item.options_json);
          opts.forEach(opt => {
            const suffix = opt.delta > 0 ? `+RM ${parseFloat(opt.delta).toFixed(2)}` : '';
            ticket += `    > ${opt.option}${suffix}\n`.substring(0, width);
            ticket += '\n';
          });
        } catch { /* ignore */ }
      }

      if (item.notes) {
        const noteText = `Note: ${item.notes}`;
        const noteLines = wrapText(noteText, width - 4);
        noteLines.forEach(line => ticket += `    ${line}\n`);
      }
    });
    
    ticket += `${sep}\n`;
    ticket += `Qty: ${totalQty}\n`;
    
    const subtotal = Number(order.total_price || 0);
    const serviceChargeRate = order.service_charge_rate || 0;
    const vatRate = order.vat_rate || 0;
    const serviceCharge = subtotal * serviceChargeRate;
    const sst = (subtotal + serviceCharge) * vatRate;
    const rawTotal = subtotal + sst + serviceCharge;
    const roundedTotal = Math.round(rawTotal * 20) / 20;
    const rounding = roundedTotal - rawTotal;
    
    const fmtMoney = (v) => v.toFixed(2).padStart(10, ' ');
    
    ticket += `Subtotal${' '.repeat(Math.max(0, width - 20))}${fmtMoney(subtotal)}\n`;
    if (serviceChargeRate > 0) {
      ticket += `Svc Chg${' '.repeat(Math.max(0, width - 23))}${fmtMoney(serviceCharge)}\n`;
    }
    if (vatRate > 0) {
      ticket += `SST${' '.repeat(Math.max(0, width - 20))}${fmtMoney(sst)}\n`;
    }
    ticket += `Rounding${' '.repeat(Math.max(0, width - 20))}${fmtMoney(rounding)}\n`;
    ticket += `${sep}\n`;
    
    ticket += `[BOLD]TOTAL (MYR)${' '.repeat(Math.max(0, width - 21))}${fmtMoney(roundedTotal)}\n`;
    ticket += `${sep}\n`;
    
    ticket += "\n";
    ticket += "[CENTER]~ Official Receipt ~\n";
    ticket += "[CENTER]Thank you!\n";
    ticket += "[CENTER]Visit us again\n";
    ticket += "\n\n";
    
    return ticket;
  },

  printChecklistTicket: async (order, itemsToPrint, isAddOn, copyNum) => {
    const copyTitle = copyNum === 1 ? "CUSTOMER COPY" : "KITCHEN COPY";
    const printerName = await getSelectedPrinter();
    const settings = await getPrinterSettings(printerName);
    const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
    const w = effectiveWidth > 0 ? effectiveWidth : settings.width;
    const ticket = printerService.formatChecklistTicket(order, itemsToPrint, isAddOn, copyTitle, w);
    return await executePrint(ticket, `order_${order.id}_checklist`);
  },

  printFinalReceipt: async (order, cashierName) => {
    const printerName = await getSelectedPrinter();
    const settings = await getPrinterSettings(printerName);
    const effectiveWidth = settings.width - settings.marginLeft - settings.marginRight;
    const w = effectiveWidth > 0 ? effectiveWidth : settings.width;
    const ticket = printerService.formatFinalReceipt(order, cashierName, w);
    return await executePrint(ticket, `order_${order.id}_final`);
  },

  printDailySalesReport: async (todayOrders) => {
    const printerName = await getSelectedPrinter();
    const settings = await getPrinterSettings(printerName);
    const width = settings.width - settings.marginLeft - settings.marginRight;
    const w = width > 0 ? width : DEFAULT_PRINTER_WIDTH;
    const sep = separator(w);
    const timestamp = formatDateTime(new Date());
    const todayDateStr = new Date().toLocaleDateString('en-GB');
    
    let ticket = "\n";
    ticket += "[CENTER][H1] DAILY SALES\n";
    ticket += "[CENTER]BP DRAGONFLY\n";
    ticket += `${sep}\n`;
    ticket += `Date: ${todayDateStr}\n`;
    ticket += `At: ${timestamp}\n`;
    ticket += `${sep}\n`;
    
    let totalSales = 0;
    todayOrders.forEach((order, index) => {
      const orderNum = order.daily_ticket_number || order.id;
      const price = Number(order.total_price || 0);
      totalSales += price;
      
      const label = `${index + 1}. #${orderNum}`;
      const priceStr = price.toFixed(2).padStart(10, ' ');
      ticket += `${label}${' '.repeat(Math.max(0, w - label.length - 10))}${priceStr}\n`;
    });
    
    ticket += `${sep}\n`;
    const totalLabel = "Total:";
    const totalValStr = totalSales.toFixed(2).padStart(10, ' ');
    ticket += `[BOLD]${totalLabel}${' '.repeat(Math.max(0, w - totalLabel.length - 10))}${totalValStr}\n`;
    ticket += `${sep}\n`;
    ticket += "\n\n";
    
    return await executePrint(ticket, `daily_sales_report`);
  },

  printTestTicket: async (printerName) => {
    const ticket = `TEST PRINT OK\nBP Dragonfly Garden\nWidth: ${DEFAULT_PRINTER_WIDTH}\n`;
    if (printerName) {
      return await executePrintWithPrinter(ticket, `printer_test`, printerName);
    }
    return await executePrint(ticket, `printer_test`);
  }
};

module.exports = { ...printerService, getReceiptCopyCounts, getPrinterSettings };