/*
 * printerDiscoveryService.js — Cross-platform printer discovery and management
 * Supports Windows (PowerShell) and Linux (CUPS) with connection type detection
 * Enhanced with mDNS/Bonjour, SNMP, and node-usb for robust discovery
 */

const { spawn } = require("child_process");
const os = require("os");

// Enhanced discovery packages (with graceful fallback)
let dnssd, snmp, usb;
try {
  dnssd = require('dnssd');
  console.log('[discovery] mDNS/Bonjour support loaded');
} catch (e) {
  console.log('[discovery] mDNS/Bonjour not available (dnssd package)');
}

try {
  snmp = require('net-snmp');
  console.log('[discovery] SNMP support loaded');
} catch (e) {
  console.log('[discovery] SNMP not available (net-snmp package)');
}

try {
  usb = require('usb');
  console.log('[discovery] USB enumeration support loaded');
} catch (e) {
  console.log('[discovery] USB enumeration not available (usb package)');
}

// Caching and debouncing
const discoveryCache = {
  printers: [],
  timestamp: 0,
  ttl: 30000 // 30 seconds cache TTL
};

let discoveryInProgress = false;
let discoveryPromise = null;

const printerDiscoveryService = {
  /**
   * Discover all available printers on the system with caching and debouncing
   * Returns array of printer objects with name, connection type, and status
   */
  discoverPrinters: async () => {
    // Check cache first
    const now = Date.now();
    if (discoveryCache.timestamp > 0 && (now - discoveryCache.timestamp) < discoveryCache.ttl) {
      console.log(`[discovery] Returning cached printers (${discoveryCache.printers.length} printers, cache age: ${now - discoveryCache.timestamp}ms)`);
      return discoveryCache.printers;
    }

    // Debounce: if discovery is in progress, return the existing promise
    if (discoveryInProgress && discoveryPromise) {
      console.log('[discovery] Discovery already in progress, returning existing promise');
      return discoveryPromise;
    }

    discoveryInProgress = true;
    discoveryPromise = (async () => {
      try {
        const platform = os.platform();
        console.log(`[discovery] Discovering installed print queues on platform: ${platform}`);
        let printers;
        if (platform === "win32") {
          printers = await printerDiscoveryService.discoverWindowsPrinters();
        } else if (platform === "linux") {
          printers = await printerDiscoveryService.discoverLinuxPrinters();
        } else {
          throw new Error(`Printer discovery is not supported on ${platform}.`);
        }

        discoveryCache.printers = printers;
        discoveryCache.timestamp = Date.now();
        return printers;
      } catch (error) {
        console.error("[discovery] Printer discovery failed:", error.message);
        throw error;
      } finally {
        discoveryInProgress = false;
        discoveryPromise = null;
      }
    })();

    return discoveryPromise;
  },

  /**
   * Check if a printer is a virtual printer that should be excluded
   */
  isVirtualPrinter: (printerName, driverName) => {
    if (!printerName) return true;
    
    const nameLower = printerName.toLowerCase();
    const driverLower = (driverName || "").toLowerCase();
    
    // List of virtual printer patterns to exclude
    const virtualPatterns = [
      'microsoft print to pdf',
      'microsoft xps document writer',
      'onenote',
      'fax',
      'send to onenote',
      'adobe pdf',
      'bullzip pdf',
      'cute pdf',
      'pdf creator',
      'doPDF',
      'novaPDF',
      'solid pdf',
      'pdf architect',
      'pdf re-direct',
      'pdf24',
      'foxit reader pdf printer',
      'nitro pdf',
      'pdf pro',
      'pdf-xchange',
      'win2pdf',
      'pdfill',
      'pdf factory',
      'primo pdf',
      'smart pdf',
      'pdf generator',
      'virtual printer',
      'image printer',
      'snagit',
      'sharepoint',
      'webex',
      'evernote'
    ];
    
    // Check if printer name or driver matches any virtual pattern
    for (const pattern of virtualPatterns) {
      if (nameLower.includes(pattern) || driverLower.includes(pattern)) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * Check if a printer is actually available and ready to use
   */
  isPrinterAvailable: (printerName, portName, statusCode) => {
    // Check printer status - exclude offline, error, or unavailable printers
    const unavailableStatuses = [2, 3, 4, 5, 7, 8, 13, 24]; // offline, error, paper jam, out of paper, etc.
    if (unavailableStatuses.includes(statusCode)) {
      return false;
    }
    
    // For USB/local printers, check if the port actually exists
    if (portName) {
      const portLower = portName.toLowerCase();
      
      // USB ports should be actively present
      if (portLower.includes('usb')) {
        // We'll do a deeper check via PowerShell for USB ports
        return true; // Will be verified by the deeper check below
      }
      
      // DOT4 ports (typically for USB printers) should be present
      if (portLower.includes('dot4')) {
        return true; // Will be verified by the deeper check below
      }
    }
    
    return true;
  },

  /**
   * Deep check if a USB printer port is actually connected
   */
  verifyUsbPrinterConnection: async (printerName) => {
    return new Promise((resolve) => {
      const escapedName = printerName.replace(/'/g, "''");
      const psScript = `
        $p = Get-Printer -Name '${escapedName}' -ErrorAction SilentlyContinue
        if ($p) {
          $port = $p.PortName
          if ($port -and ($port -like '*USB*' -or $port -like '*DOT4*')) {
            # Check printer status - exclude only clearly offline/error states
            if ($p.PrinterStatus -eq 2 -or $p.PrinterStatus -eq 3 -or $p.PrinterStatus -eq 13) {
              Write-Output "OFFLINE"
            } else {
              # Trust Windows printer status - if it says idle/online, show it
              # User can test print to verify actual connectivity
              Write-Output "CONNECTED"
            }
          } else {
            Write-Output "NOT_USB"
          }
        } else {
          Write-Output "NOT_FOUND"
        }
      `;
      
      const proc = spawn("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psScript
      ], { shell: false });
      
      let stdout = "";
      proc.stdout.on("data", (data) => stdout += data);
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        proc.kill();
        console.warn(`[discovery] USB verification timeout for ${printerName}, assuming NOT connected`);
        resolve(false); // Assume NOT connected if verification times out
      }, 5000); // 5 second timeout
      
      proc.on("close", () => {
        clearTimeout(timeout);
        const result = stdout.trim();
        resolve(result === "CONNECTED");
      });
      proc.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  },

  /**
   * Discover network printers on the local network
   */
  discoverNetworkPrinters: async () => {
    return new Promise((resolve) => {
      const psCommand = `
        # Scan for network printers using various methods
        $networkPrinters = @()
        
        # Method 1: Get printers with network ports
        try {
          $netPrinters = Get-Printer | Where-Object { $_.PortName -like '*IP*' -or $_.PortName -like '*TCP*' -or $_.Type -like '*Network*' }
          foreach ($p in $netPrinters) {
            $networkPrinters += [PSCustomObject]@{
              Name = $p.Name
              DriverName = $p.DriverName
              PortName = $p.PortName
              PrinterStatus = $p.PrinterStatus
              Type = $p.Type
              DiscoveredBy = "InstalledNetwork"
            }
          }
        } catch {}
        
        # Method 2: Scan common network printer ports (9100) - DISABLED to prevent hanging
        # This can take a very long time and is not needed for USB printer discovery
        
        $networkPrinters | ConvertTo-Json
      `;
      
      const proc = spawn("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psCommand
      ], { shell: false });
      
      let stdout = "";
      proc.stdout.on("data", (data) => stdout += data);
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        proc.kill();
        console.warn("[discovery] Network printer discovery timeout");
        resolve([]);
      }, 10000); // 10 second timeout
      
      proc.on("close", () => {
        clearTimeout(timeout);
        try {
          const printers = JSON.parse(stdout);
          console.log(`[discovery] Found ${printers.length} network printers`);
          resolve(printers);
        } catch {
          resolve([]);
        }
      });
      proc.on("error", () => {
        clearTimeout(timeout);
        resolve([]);
      });
    });
  },

  /**
   * Discover Bluetooth printers
   */
  discoverBluetoothPrinters: async () => {
    return new Promise((resolve) => {
      const psCommand = `
        # Scan for Bluetooth printers
        $btPrinters = @()
        
        try {
          # Check if Bluetooth is available
          $btPower = Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue
          if ($btPower) {
            # Get paired Bluetooth devices that might be printers
            $btDevices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | 
              Where-Object { $_.FriendlyName -like '*print*' -or $_.FriendlyName -like '*POS*' -or $_.FriendlyName -like '*thermal*' }
            
            foreach ($device in $btDevices) {
              $btPrinters += [PSCustomObject]@{
                Name = $device.FriendlyName
                DriverName = "Bluetooth"
                PortName = "BLUETOOTH"
                PrinterStatus = 0
                Type = "Bluetooth"
                DiscoveredBy = "BluetoothScan"
              }
            }
          }
        } catch {}
        
        $btPrinters | ConvertTo-Json
      `;
      
      const proc = spawn("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psCommand
      ], { shell: false });
      
      let stdout = "";
      proc.stdout.on("data", (data) => stdout += data);
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        proc.kill();
        console.warn("[discovery] Bluetooth printer discovery timeout");
        resolve([]);
      }, 10000); // 10 second timeout
      
      proc.on("close", () => {
        clearTimeout(timeout);
        try {
          const printers = JSON.parse(stdout);
          console.log(`[discovery] Found ${printers.length} Bluetooth printers`);
          resolve(printers);
        } catch {
          resolve([]);
        }
      });
      proc.on("error", () => {
        clearTimeout(timeout);
        resolve([]);
      });
    });
  },

  /**
   * Discover printers on Windows using PowerShell
   */
  discoverWindowsPrinters: async () => {
    return new Promise((resolve, reject) => {
      // Use WMI for accurate offline detection (Get-Printer is unreliable)
      const psCommand = `
        Get-WmiObject Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus, WorkOffline | ConvertTo-Json
      `;
      
      const proc = spawn("powershell", [
        "-NoProfile", 
        "-NonInteractive", 
        "-Command", 
        psCommand
      ], { shell: false });
      
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (error, printers) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(printers);
      };
      const timeout = setTimeout(() => {
        proc.kill();
        finish(new Error("Timed out while reading installed Windows printer queues."));
      }, 10000);
      
      proc.stdout.on("data", (data) => stdout += data);
      proc.stderr.on("data", (data) => stderr += data);
      
      proc.on("close", async (code) => {
        if (code !== 0) {
          console.error(`[discovery] PowerShell failed with code ${code}: ${stderr}`);
          finish(new Error(`Windows printer discovery failed: ${stderr.trim() || `PowerShell exited with code ${code}`}`));
          return;
        }
        
        if (!stdout || stdout.trim() === "") {
          console.error("[discovery] PowerShell returned empty output");
          finish(null, []);
          return;
        }
        
        try {
          const parsed = JSON.parse(stdout);
          const printers = Array.isArray(parsed) ? parsed : [parsed];
          const availablePrinters = [];
          
          for (const printer of printers) {
            // Filter out virtual printers
            if (printerDiscoveryService.isVirtualPrinter(printer.Name, printer.DriverName)) {
              console.log(`[discovery] Excluding virtual printer: ${printer.Name}`);
              continue;
            }
            
            // Filter out offline printers using WMI WorkOffline flag (more accurate than PrinterStatus)
            if (printer.WorkOffline === true) {
              console.log(`[discovery] Excluding offline printer: ${printer.Name} (WorkOffline=true)`);
              continue;
            }
            
            // Filter by PrinterStatus codes that indicate offline/error
            // Note: Status code 3 is often reported for idle printers in WMI, so we only exclude if WorkOffline is also true
            const status = printerDiscoveryService.getWindowsPrinterStatus(printer.PrinterStatus);
            if (status === "offline") {
              console.log(`[discovery] Excluding offline printer: ${printer.Name} (status: ${status})`);
              continue;
            }
            // Only exclude error status if WorkOffline is also true (more accurate)
            if (status === "error" && printer.WorkOffline === true) {
              console.log(`[discovery] Excluding error printer: ${printer.Name} (status: ${status}, WorkOffline=true)`);
              continue;
            }
            
            // Detect connection type
            const connectionType = printerDiscoveryService.detectWindowsConnectionType(printer.PortName, null);
            
            availablePrinters.push({
              name: printer.Name,
              driver: printer.DriverName,
              port: printer.PortName,
              status: status,
              connectionType: connectionType,
              platform: "windows",
              discoveredBy: "Installed"
            });
          }
          
          console.log(`[discovery] Found ${availablePrinters.length} available printers (filtered from ${printers.length} total)`);
          finish(null, availablePrinters);
        } catch (parseError) {
          console.error(`[discovery] Failed to parse printer data: ${parseError.message}`);
          finish(new Error(`Could not parse installed Windows printer queues: ${parseError.message}`));
        }
      });
      
      proc.on("error", (err) => {
        finish(new Error(`Could not start Windows printer discovery: ${err.message}`));
      });
    });
  },

  /**
   * Discover printers on Linux using CUPS
   */
  discoverLinuxPrinters: async () => {
    return printerDiscoveryService.discoverCUPSPrinters();
  },

  /**
   * Discover printers using CUPS (lpstat)
   */
  discoverCUPSPrinters: async () => {
    return new Promise((resolve, reject) => {
        const proc = spawn("lpstat", ["-p", "-v"], { shell: false });
        
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (error, printers) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve(printers);
        };
        const timeout = setTimeout(() => {
          proc.kill();
          finish(new Error("Timed out while reading CUPS printer queues."));
        }, 10000);
        
        proc.stdout.on("data", (data) => stdout += data);
        proc.stderr.on("data", (data) => stderr += data);
        
        proc.on("close", (code) => {
          if (code !== 0) {
            finish(new Error(`CUPS printer discovery failed: ${stderr.trim() || `lpstat exited with code ${code}`}`));
            return;
          }
          
          const printers = printerDiscoveryService.parseLinuxPrinters(stdout);
          finish(null, printers);
        });
        
        proc.on("error", (err) => {
          finish(new Error(`Could not start CUPS printer discovery: ${err.message}`));
        });
    });
  },

  /**
   * Discover USB printers on Linux by checking /dev/usb devices
   */
  discoverLinuxUSBPrinters: async () => {
    return new Promise((resolve) => {
      const fs = require('fs');
      const printers = [];
      
      // Check for common USB printer device paths
      const usbPaths = [
        '/dev/usb/lp0',
        '/dev/usb/lp1',
        '/dev/usb/lp2',
        '/dev/lp0',
        '/dev/lp1',
        '/dev/lp2',
        '/dev/usb',
      ];
      
      for (const path of usbPaths) {
        try {
          if (fs.existsSync(path)) {
            const stats = fs.statSync(path);
            if (stats.isCharacterDevice() || stats.isBlockDevice()) {
              printers.push({
                name: path.split('/').pop(),
                status: "online",
                connectionType: "wire",
                platform: "linux",
                port: path,
                discoveredBy: "USBDevice"
              });
            }
          }
        } catch (err) {
          // Device might not be accessible, skip
        }
      }
      
      // Also try to detect via lsusb for thermal printers
      const lsusbProc = spawn("lsusb", [], { shell: false });
      let lsusbStdout = "";
      
      lsusbProc.stdout.on("data", (data) => lsusbStdout += data);
      
      const timeout = setTimeout(() => {
        lsusbProc.kill();
        resolve(printers);
      }, 5000);
      
      lsusbProc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          const lines = lsusbStdout.split('\n');
          for (const line of lines) {
            if (line.toLowerCase().includes('print') || 
                line.toLowerCase().includes('thermal') ||
                line.toLowerCase().includes('pos')) {
              // Extract device info from lsusb output
              const match = line.match(/ID ([0-9a-f]{4}:[0-9a-f]{4})/);
              if (match) {
                const deviceId = match[1];
                printers.push({
                  name: `USB Printer ${deviceId}`,
                  status: "online",
                  connectionType: "wire",
                  platform: "linux",
                  port: `usb:${deviceId}`,
                  discoveredBy: "LSUSB"
                });
              }
            }
          }
        }
        resolve(printers);
      });
      
      lsusbProc.on("error", () => {
        clearTimeout(timeout);
        resolve(printers);
      });
    });
  },

  /**
   * Discover Bluetooth printers on Linux
   */
  discoverLinuxBluetoothPrinters: async () => {
    return new Promise((resolve) => {
      const printers = [];
      
      // Try to use bluetoothctl to get paired devices
      const btProc = spawn("bluetoothctl", ["paired-devices"], { shell: false });
      let btStdout = "";
      let btStderr = "";
      
      btProc.stdout.on("data", (data) => btStdout += data);
      btProc.stderr.on("data", (data) => btStderr += data);
      
      const timeout = setTimeout(() => {
        btProc.kill();
        console.warn("[discovery] Bluetooth discovery timeout");
        resolve(printers);
      }, 8000); // 8 second timeout
      
      btProc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0 && btStdout) {
          const lines = btStdout.split('\n');
          for (const line of lines) {
            // Parse bluetoothctl output format: "Device XX:XX:XX:XX:XX:XX Device Name"
            const match = line.match(/Device ([0-9A-F:]{17}) (.+)/);
            if (match) {
              const mac = match[1];
              const name = match[2];
              
              // Check if it looks like a printer
              const nameLower = name.toLowerCase();
              if (nameLower.includes('print') || 
                  nameLower.includes('thermal') ||
                  nameLower.includes('pos') ||
                  nameLower.includes('receipt')) {
                printers.push({
                  name: name,
                  status: "online",
                  connectionType: "bluetooth",
                  platform: "linux",
                  port: `bluetooth:${mac}`,
                  discoveredBy: "BluetoothCTL"
                });
              }
            }
          }
        } else {
          // Fallback: try hcitool scan if bluetoothctl failed
          printerDiscoveryService.discoverBluetoothViaHCITool().then(hciPrinters => {
            resolve([...printers, ...hciPrinters]);
          }).catch(() => resolve(printers));
        }
      });
      
      btProc.on("error", () => {
        clearTimeout(timeout);
        // Fallback to hcitool
        printerDiscoveryService.discoverBluetoothViaHCITool().then(hciPrinters => {
          resolve([...printers, ...hciPrinters]);
        }).catch(() => resolve(printers));
      });
    });
  },

  /**
   * Fallback Bluetooth discovery using hcitool
   */
  discoverBluetoothViaHCITool: async () => {
    return new Promise((resolve) => {
      const printers = [];
      
      const hcitoolProc = spawn("hcitool", ["scan"], { shell: false });
      let hcitoolStdout = "";
      
      hcitoolProc.stdout.on("data", (data) => hcitoolStdout += data);
      
      const timeout = setTimeout(() => {
        hcitoolProc.kill();
        resolve(printers);
      }, 5000);
      
      hcitoolProc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0 && hcitoolStdout) {
          const lines = hcitoolStdout.split('\n');
          for (const line of lines) {
            // Parse hcitool scan output format: "XX:XX:XX:XX:XX:XX Device Name"
            const match = line.match(/([0-9A-F:]{17})\s+(.+)/);
            if (match) {
              const mac = match[1];
              const name = match[2];
              
              const nameLower = name.toLowerCase();
              if (nameLower.includes('print') || 
                  nameLower.includes('thermal') ||
                  nameLower.includes('pos') ||
                  nameLower.includes('receipt')) {
                printers.push({
                  name: name,
                  status: "online",
                  connectionType: "bluetooth",
                  platform: "linux",
                  port: `bluetooth:${mac}`,
                  discoveredBy: "HCITool"
                });
              }
            }
          }
        }
        resolve(printers);
      });
      
      hcitoolProc.on("error", () => {
        clearTimeout(timeout);
        resolve(printers);
      });
    });
  },

  /**
   * Parse Linux CUPS printer output
   */
  parseLinuxPrinters: (output) => {
    const printersByName = new Map();
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      const printerMatch = line.match(/^printer\s+(.+)\s+is\s+(idle|printing|processing|disabled)\b(.*)$/i);
      if (printerMatch) {
        const [, name, rawStatus] = printerMatch;
        const status = rawStatus.toLowerCase() === "disabled"
          ? "offline"
          : rawStatus.toLowerCase() === "printing" || rawStatus.toLowerCase() === "processing"
            ? "printing"
            : "idle";
        printersByName.set(name, {
          name,
          status,
          connectionType: "unknown",
          platform: "linux",
          discoveredBy: "CUPS"
        });
        continue;
      }

      const deviceMatch = line.match(/^device for\s+(.+):\s+(.+)$/i);
      if (deviceMatch) {
        const printer = printersByName.get(deviceMatch[1]);
        if (printer) {
          printer.port = deviceMatch[2];
          printer.connectionType = printerDiscoveryService.detectLinuxConnectionType(deviceMatch[2]);
        }
      }
    }

    return [...printersByName.values()].filter(printer => printer.status !== "offline");
  },

  /**
   * Detect connection type from Windows port information
   */
  detectWindowsConnectionType: (portName, printerType) => {
    if (!portName) return "unknown";
    
    const portLower = portName.toLowerCase();
    const typeLower = (printerType || "").toLowerCase();
    
    // Network/WiFi printers
    if (portLower.includes("ip_") || portLower.includes("tcp") || portLower.includes("network") || 
        typeLower.includes("network") || typeLower.includes("tcp/ip")) {
      return "wifi";
    }
    
    // Bluetooth printers
    if (portLower.includes("bluetooth") || portLower.includes("bt")) {
      return "bluetooth";
    }
    
    // USB/Wired printers
    if (portLower.includes("usb") || portLower.includes("dot4") || portLower.includes("local")) {
      return "wire";
    }
    
    // Serial/Parallel ports
    if (portLower.includes("com") || portLower.includes("lpt")) {
      return "wire";
    }
    
    return "unknown";
  },

  /**
   * Detect connection type from Linux device URI
   */
  detectLinuxConnectionType: (deviceUri) => {
    if (!deviceUri) return "unknown";
    
    const uriLower = deviceUri.toLowerCase();
    
    // Network/WiFi printers
    if (uriLower.includes("ipp://") || uriLower.includes("http://") || uriLower.includes("socket://") ||
        uriLower.includes("lpd://") || uriLower.includes("network")) {
      return "wifi";
    }
    
    // Bluetooth printers
    if (uriLower.includes("bluetooth://") || uriLower.includes("bt://")) {
      return "bluetooth";
    }
    
    // USB/Wired printers
    if (uriLower.includes("usb://") || uriLower.includes("serial:") || uriLower.includes("parallel:")) {
      return "wire";
    }
    
    // Local file/socket
    if (uriLower.includes("file://") || uriLower.includes("/dev/")) {
      return "wire";
    }
    
    return "unknown";
  },

  /**
   * Convert Windows printer status code to readable status
   */
  getWindowsPrinterStatus: (statusCode) => {
    // Windows printer status codes
    const statusMap = {
      0: "idle",
      1: "printing",
      2: "offline",
      3: "idle", // WMI often reports 3 for idle printers, not actual errors
      4: "paper jam",
      5: "out of paper",
      6: "manual feed required",
      7: "paper problem",
      8: "offline",
      9: "IO active",
      10: "busy",
      11: "printing",
      12: "output bin full",
      13: "not available",
      14: "waiting",
      15: "processing",
      16: "initializing",
      17: "warming up",
      18: "toner low",
      19: "no toner",
      20: "page punt",
      21: "user intervention required",
      22: "out of memory",
      23: "door open",
      24: "server unknown",
      25: "power save"
    };
    
    return statusMap[statusCode] || "unknown";
  },

  /**
   * Test print to a specific printer
   */
  testPrint: async (printerName) => {
    // Use the actual printerService for test print since it works reliably
    const printerService = require('./printerService');
    return await printerService.printTestTicket(printerName);
  },

  /**
   * Test print on Windows
   */
  testPrintWindows: async (printerName, content) => {
    return new Promise((resolve, reject) => {
      // Use the same method as printerService.js which works
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tempFile = path.join(os.tmpdir(), `testprint_${Date.now()}.txt`);
      
      // Write content with CRLF line endings
      const formattedContent = content.replace(/\n/g, "\r\n");
      fs.writeFileSync(tempFile, formattedContent);
      
      console.log(`[testPrintWindows] Writing to temp file: ${tempFile}`);
      console.log(`[testPrintWindows] Content length: ${formattedContent.length}`);
      console.log(`[testPrintWindows] Printer name: ${printerName}`);
      
      // Use the exact same PowerShell command as printerService.js
      const psCommand = `Get-Content -Path '${tempFile}' -Raw | Out-Printer -Name '${printerName}'`;
      
      console.log(`[testPrintWindows] PowerShell command: ${psCommand}`);
      
      const proc = spawn("powershell", [
        "-NoProfile",
        "-NonInteractive", 
        "-Command",
        psCommand
      ], { shell: false });
      
      let stderr = "";
      let stdout = "";
      proc.stderr.on("data", (data) => stderr += data);
      proc.stdout.on("data", (data) => stdout += data);
      
      proc.on("close", (code) => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
        
        console.log(`[testPrintWindows] Process closed with code: ${code}`);
        console.log(`[testPrintWindows] Stderr: ${stderr}`);
        console.log(`[testPrintWindows] Stdout: ${stdout}`);
        
        if (code === 0) {
          resolve({ success: true, message: "Test print sent successfully" });
        } else {
          reject(new Error(`PowerShell failed: ${stderr || stdout}`));
        }
      });
      
      proc.on("error", (err) => {
        console.error(`[testPrintWindows] Process error: ${err.message}`);
        reject(err);
      });
    });
  },

  /**
   * Test print on Linux
   */
  testPrintLinux: async (printerName, content) => {
    return new Promise((resolve, reject) => {
      const proc = spawn("lp", ["-d", printerName, "-"], { shell: false });
      
      proc.stdin.write(content);
      proc.stdin.end();
      
      let stderr = "";
      proc.stderr.on("data", (data) => stderr += data);
      
      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, message: "Test print sent successfully" });
        } else {
          reject(new Error(`lp command failed: ${stderr}`));
        }
      });
      
      proc.on("error", (err) => reject(err));
    });
  },

  /**
   * Discover printers via mDNS/Bonjour (industry standard for network printers)
   */
  discoverMdnsPrinters: async () => {
    if (!dnssd) {
      console.log('[discovery] mDNS/Bonjour not available, skipping');
      return [];
    }

    return new Promise((resolve) => {
      const printers = [];
      const browser = new dnssd.Browser('_ipp._tcp');
      const timeout = setTimeout(() => {
        browser.stop();
        console.log(`[discovery] mDNS discovery completed, found ${printers.length} printers`);
        resolve(printers);
      }, 5000); // 5 second timeout

      browser.on('serviceUp', (service) => {
        console.log(`[discovery] mDNS found service: ${service.name} at ${service.host}`);
        printers.push({
          name: service.name,
          host: service.host,
          port: service.port,
          status: "online",
          connectionType: "wifi",
          platform: os.platform(),
          discoveredBy: "mDNS"
        });
      });

      browser.on('serviceDown', (service) => {
        console.log(`[discovery] mDNS service down: ${service.name}`);
      });

      browser.start();
    });
  },

  /**
   * Discover printers via SNMP (enterprise standard for network printers)
   */
  discoverSnmpPrinters: async () => {
    if (!snmp) {
      console.log('[discovery] SNMP not available, skipping');
      return [];
    }

    return new Promise((resolve) => {
      const printers = [];
      
      // Get local network interfaces
      const interfaces = os.networkInterfaces();
      const localSubnets = [];
      
      for (const name in interfaces) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            const parts = iface.address.split('.');
            if (parts.length === 4) {
              localSubnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
            }
          }
        }
      }

      if (localSubnets.length === 0) {
        console.log('[discovery] No local network interfaces found for SNMP discovery');
        resolve([]);
        return;
      }

      console.log(`[discovery] SNMP scanning subnets: ${localSubnets.join(', ')}`);
      
      // Scan a limited range (last octet 1-50) to avoid long scans
      const oids = ['1.3.6.1.2.1.1.5.0', '1.3.6.1.2.1.1.1.0']; // sysName, sysDescr
      let completed = 0;
      const totalToScan = localSubnets.length * 50;
      
      const checkIp = (subnet, lastOctet) => {
        const ip = `${subnet}.${lastOctet}`;
        const session = snmp.createSession(ip, 'public', { timeout: 1000 });
        
        session.get(oids, (error, varbinds) => {
          completed++;
          
          if (!error && varbinds && varbinds.length > 0) {
            const sysName = varbinds[0]?.value?.toString() || '';
            const sysDescr = varbinds[1]?.value?.toString() || '';
            
            // Check if it looks like a printer
            const nameLower = sysName.toLowerCase() + sysDescr.toLowerCase();
            if (nameLower.includes('print') || nameLower.includes('hp') || 
                nameLower.includes('canon') || nameLower.includes('epson') ||
                nameLower.includes('brother') || nameLower.includes('xerox')) {
              console.log(`[discovery] SNMP found printer: ${ip} (${sysName})`);
              printers.push({
                name: sysName || `Printer at ${ip}`,
                host: ip,
                port: 9100,
                status: "online",
                connectionType: "wifi",
                platform: os.platform(),
                discoveredBy: "SNMP",
                model: sysDescr
              });
            }
          }
          
          session.close();
          
          if (completed >= totalToScan) {
            console.log(`[discovery] SNMP discovery completed, found ${printers.length} printers`);
            resolve(printers);
          }
        });
      };

      // Start scanning
      for (const subnet of localSubnets) {
        for (let i = 1; i <= 50; i++) {
          checkIp(subnet, i);
        }
      }

      // Safety timeout
      setTimeout(() => {
        console.log(`[discovery] SNMP discovery timeout, found ${printers.length} printers`);
        resolve(printers);
      }, 10000);
    });
  },

  /**
   * Discover USB printers via node-usb (cross-platform USB enumeration)
   */
  discoverUsbPrinters: async () => {
    if (!usb) {
      console.log('[discovery] USB enumeration not available, skipping');
      return [];
    }

    return new Promise((resolve) => {
      try {
        const printers = [];
        
        // Only use getDeviceList to find ACTUALLY connected devices
        if (typeof usb.getDeviceList !== 'function') {
          console.log('[discovery] USB package available but getDeviceList not found, skipping USB enumeration');
          resolve([]);
          return;
        }
        
        const devices = usb.getDeviceList();
        console.log(`[discovery] USB enumeration found ${devices.length} total USB devices`);
        
        for (const device of devices) {
          try {
            // Check if device has printer class interface
            let isPrinter = false;
            for (const config of device.configs) {
              for (const iface of config.interfaces) {
                for (const altSetting of iface.altSettings) {
                  if (altSetting.bInterfaceClass === 0x07) { // Printer class
                    isPrinter = true;
                    break;
                  }
                }
                if (isPrinter) break;
              }
              if (isPrinter) break;
            }
            
            if (isPrinter) {
              const vendorId = device.deviceDescriptor.idVendor;
              const productId = device.deviceDescriptor.idProduct;
              
              console.log(`[discovery] USB printer found: VID=${vendorId.toString(16)} PID=${productId.toString(16)}`);
              
              printers.push({
                name: `USB Printer (VID:${vendorId.toString(16)} PID:${productId.toString(16)})`,
                vendorId: vendorId,
                productId: productId,
                status: "online",
                connectionType: "wire",
                platform: os.platform(),
                discoveredBy: "USB-Enumeration"
              });
            }
          } catch (deviceError) {
            // Skip devices that can't be read
            console.warn(`[discovery] Error reading USB device: ${deviceError.message}`);
          }
        }
        
        console.log(`[discovery] USB enumeration completed, found ${printers.length} printers`);
        resolve(printers);
      } catch (error) {
        console.error(`[discovery] USB enumeration error:`, error.message);
        resolve([]);
      }
    });
  },

  /**
   * Clear the discovery cache (useful for forcing a refresh)
   */
  clearCache: () => {
    discoveryCache.printers = [];
    discoveryCache.timestamp = 0;
    console.log('[discovery] Cache cleared');
  },

  /**
   * Get system platform information
   */
  getPlatformInfo: () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      type: os.type(),
      release: os.release()
    };
  }
};

module.exports = printerDiscoveryService;
