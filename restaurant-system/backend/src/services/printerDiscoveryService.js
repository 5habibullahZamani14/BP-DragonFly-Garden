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
    if (discoveryCache.printers.length > 0 && (now - discoveryCache.timestamp) < discoveryCache.ttl) {
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
        let allPrinters = [];
        
        console.log(`[discovery] Starting enhanced printer discovery on platform: ${platform}`);
        
        if (platform === "win32") {
          // Discover installed printers (USB, network, etc.)
          try {
            console.log("[discovery] Discovering Windows installed printers...");
            const installedPrinters = await printerDiscoveryService.discoverWindowsPrinters();
            allPrinters = allPrinters.concat(installedPrinters);
            console.log(`[discovery] Windows installed printers found: ${installedPrinters.length}`);
          } catch (err) {
            console.error("[discovery] Windows printer discovery failed:", err.message);
          }
          
          // Discover network printers on local network
          try {
            console.log("[discovery] Discovering network printers...");
            const networkPrinters = await printerDiscoveryService.discoverNetworkPrinters();
            allPrinters = allPrinters.concat(networkPrinters);
            console.log(`[discovery] Network printers found: ${networkPrinters.length}`);
          } catch (err) {
            console.error("[discovery] Network printer discovery failed:", err.message);
          }
          
          // Discover Bluetooth printers
          try {
            console.log("[discovery] Discovering Bluetooth printers...");
            const bluetoothPrinters = await printerDiscoveryService.discoverBluetoothPrinters();
            allPrinters = allPrinters.concat(bluetoothPrinters);
            console.log(`[discovery] Bluetooth printers found: ${bluetoothPrinters.length}`);
          } catch (err) {
            console.error("[discovery] Bluetooth printer discovery failed:", err.message);
          }

          // Enhanced: mDNS/Bonjour discovery
          try {
            console.log("[discovery] Discovering printers via mDNS/Bonjour...");
            const mdnsPrinters = await printerDiscoveryService.discoverMdnsPrinters();
            allPrinters = allPrinters.concat(mdnsPrinters);
            console.log(`[discovery] mDNS printers found: ${mdnsPrinters.length}`);
          } catch (err) {
            console.error("[discovery] mDNS discovery failed:", err.message);
          }

          // Enhanced: SNMP discovery
          try {
            console.log("[discovery] Discovering printers via SNMP...");
            const snmpPrinters = await printerDiscoveryService.discoverSnmpPrinters();
            allPrinters = allPrinters.concat(snmpPrinters);
            console.log(`[discovery] SNMP printers found: ${snmpPrinters.length}`);
          } catch (err) {
            console.error("[discovery] SNMP discovery failed:", err.message);
          }

          // Enhanced: Direct USB enumeration
          try {
            console.log("[discovery] Discovering USB printers via node-usb...");
            const usbPrinters = await printerDiscoveryService.discoverUsbPrinters();
            allPrinters = allPrinters.concat(usbPrinters);
            console.log(`[discovery] USB enumeration printers found: ${usbPrinters.length}`);
          } catch (err) {
            console.error("[discovery] USB enumeration failed:", err.message);
          }
          
          // Remove duplicates by name
          const uniquePrinters = [];
          const seenNames = new Set();
          for (const printer of allPrinters) {
            if (!seenNames.has(printer.name)) {
              seenNames.add(printer.name);
              uniquePrinters.push(printer);
            }
          }
          
          console.log(`[discovery] Total unique printers discovered: ${uniquePrinters.length}`);
          
          // Update cache
          discoveryCache.printers = uniquePrinters;
          discoveryCache.timestamp = Date.now();
          
          return uniquePrinters;
        } else {
          console.log("[discovery] Running Linux printer discovery...");
          const linuxPrinters = await printerDiscoveryService.discoverLinuxPrinters();
          
          // Enhanced: mDNS/Bonjour discovery on Linux
          try {
            console.log("[discovery] Discovering printers via mDNS/Bonjour on Linux...");
            const mdnsPrinters = await printerDiscoveryService.discoverMdnsPrinters();
            linuxPrinters.push(...mdnsPrinters);
            console.log(`[discovery] mDNS printers found on Linux: ${mdnsPrinters.length}`);
          } catch (err) {
            console.error("[discovery] mDNS discovery failed on Linux:", err.message);
          }

          // Enhanced: SNMP discovery on Linux
          try {
            console.log("[discovery] Discovering printers via SNMP on Linux...");
            const snmpPrinters = await printerDiscoveryService.discoverSnmpPrinters();
            linuxPrinters.push(...snmpPrinters);
            console.log(`[discovery] SNMP printers found on Linux: ${snmpPrinters.length}`);
          } catch (err) {
            console.error("[discovery] SNMP discovery failed on Linux:", err.message);
          }

          // Enhanced: Direct USB enumeration on Linux
          try {
            console.log("[discovery] Discovering USB printers via node-usb on Linux...");
            const usbPrinters = await printerDiscoveryService.discoverUsbPrinters();
            linuxPrinters.push(...usbPrinters);
            console.log(`[discovery] USB enumeration printers found on Linux: ${usbPrinters.length}`);
          } catch (err) {
            console.error("[discovery] USB enumeration failed on Linux:", err.message);
          }

          // Remove duplicates
          const uniquePrinters = [];
          const seenNames = new Set();
          for (const printer of linuxPrinters) {
            if (!seenNames.has(printer.name)) {
              seenNames.add(printer.name);
              uniquePrinters.push(printer);
            }
          }

          // Update cache
          discoveryCache.printers = uniquePrinters;
          discoveryCache.timestamp = Date.now();

          return uniquePrinters;
        }
      } catch (error) {
        console.error("[discovery] Printer discovery failed:", error);
        return [];
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
              # For USB printers, if status is not clearly offline, consider it connected
              # Get-PrinterConfiguration can fail for various reasons even on connected printers
              # so we don't rely on it as the sole determinant
              try {
                $config = Get-PrinterConfiguration -PrinterName '${escapedName}' -ErrorAction SilentlyContinue
                Write-Output "CONNECTED"
              } catch {
                # Even if config fails, if printer status is good, consider it connected
                Write-Output "CONNECTED"
              }
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
        console.warn(`[discovery] USB verification timeout for ${printerName}, assuming connected`);
        resolve(true); // Assume connected if verification times out
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
    return new Promise((resolve) => {
      const psCommand = `
        Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Type | ConvertTo-Json
      `;
      
      const proc = spawn("powershell", [
        "-NoProfile", 
        "-NonInteractive", 
        "-Command", 
        psCommand
      ], { shell: false });
      
      let stdout = "";
      let stderr = "";
      
      proc.stdout.on("data", (data) => stdout += data);
      proc.stderr.on("data", (data) => stderr += data);
      
      proc.on("close", async (code) => {
        if (code !== 0) {
          console.error(`[discovery] PowerShell failed with code ${code}: ${stderr}`);
          resolve([]); // Return empty array instead of rejecting
          return;
        }
        
        if (!stdout || stdout.trim() === "") {
          console.error("[discovery] PowerShell returned empty output");
          resolve([]);
          return;
        }
        
        try {
          const printers = JSON.parse(stdout);
          const availablePrinters = [];
          
          for (const printer of printers) {
            // Filter out virtual printers
            if (printerDiscoveryService.isVirtualPrinter(printer.Name, printer.DriverName)) {
              console.log(`[discovery] Excluding virtual printer: ${printer.Name}`);
              continue;
            }
            
            // Check basic availability
            if (!printerDiscoveryService.isPrinterAvailable(printer.Name, printer.PortName, printer.PrinterStatus)) {
              console.log(`[discovery] Excluding unavailable printer: ${printer.Name} (status: ${printer.PrinterStatus})`);
              continue;
            }
            
            // For USB printers, do a deeper connection check
            const connectionType = printerDiscoveryService.detectWindowsConnectionType(printer.PortName, printer.Type);
            if (connectionType === "wire") {
              const isConnected = await printerDiscoveryService.verifyUsbPrinterConnection(printer.Name);
              if (!isConnected) {
                console.log(`[discovery] Excluding disconnected USB printer: ${printer.Name}`);
                continue;
              }
            }
            
            availablePrinters.push({
              name: printer.Name,
              driver: printer.DriverName,
              port: printer.PortName,
              status: printerDiscoveryService.getWindowsPrinterStatus(printer.PrinterStatus),
              connectionType: connectionType,
              platform: "windows",
              discoveredBy: "Installed"
            });
          }
          
          console.log(`[discovery] Found ${availablePrinters.length} available printers (filtered from ${printers.length} total)`);
          resolve(availablePrinters);
        } catch (parseError) {
          console.error(`[discovery] Failed to parse printer data: ${parseError.message}`);
          console.error(`[discovery] Raw output: ${stdout.substring(0, 200)}`);
          resolve([]); // Return empty array instead of rejecting
        }
      });
      
      proc.on("error", (err) => {
        console.error(`[discovery] PowerShell process error: ${err.message}`);
        resolve([]); // Return empty array instead of rejecting
      });
    });
  },

  /**
   * Discover printers on Linux using CUPS
   */
  discoverLinuxPrinters: async () => {
    let allPrinters = [];
    
    // Method 1: Try CUPS (lpstat)
    try {
      const cupsPrinters = await printerDiscoveryService.discoverCUPSPrinters();
      allPrinters = allPrinters.concat(cupsPrinters);
      console.log(`[discovery] CUPS found ${cupsPrinters.length} printers`);
    } catch (err) {
      console.warn(`[discovery] CUPS discovery failed: ${err.message}`);
    }
    
    // Method 2: Try USB device discovery (fallback for systems without CUPS)
    try {
      const usbPrinters = await printerDiscoveryService.discoverLinuxUSBPrinters();
      allPrinters = allPrinters.concat(usbPrinters);
      console.log(`[discovery] USB discovery found ${usbPrinters.length} printers`);
    } catch (err) {
      console.warn(`[discovery] USB discovery failed: ${err.message}`);
    }
    
    // Method 3: Try Bluetooth discovery
    try {
      const bluetoothPrinters = await printerDiscoveryService.discoverLinuxBluetoothPrinters();
      allPrinters = allPrinters.concat(bluetoothPrinters);
      console.log(`[discovery] Bluetooth discovery found ${bluetoothPrinters.length} printers`);
    } catch (err) {
      console.warn(`[discovery] Bluetooth discovery failed: ${err.message}`);
    }
    
    // Remove duplicates by name
    const uniquePrinters = [];
    const seenNames = new Set();
    for (const printer of allPrinters) {
      if (!seenNames.has(printer.name)) {
        seenNames.add(printer.name);
        uniquePrinters.push(printer);
      }
    }
    
    console.log(`[discovery] Total unique Linux printers: ${uniquePrinters.length}`);
    return uniquePrinters;
  },

  /**
   * Discover printers using CUPS (lpstat)
   */
  discoverCUPSPrinters: async () => {
    return new Promise((resolve, reject) => {
      // First check if CUPS is available (use command -v instead of which for better compatibility)
      const cupsCheck = spawn("command", ["-v", "lpstat"], { shell: false });
      
      cupsCheck.on("close", (code) => {
        if (code !== 0) {
          reject(new Error("CUPS (lpstat) not available on this system"));
          return;
        }
        
        // Get list of printers
        const proc = spawn("lpstat", ["-p", "-v"], { shell: false });
        
        let stdout = "";
        let stderr = "";
        
        proc.stdout.on("data", (data) => stdout += data);
        proc.stderr.on("data", (data) => stderr += data);
        
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          proc.kill();
          console.warn("[discovery] CUPS lpstat timeout");
          reject(new Error("CUPS lpstat timeout"));
        }, 10000); // 10 second timeout
        
        proc.on("close", (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error(`lpstat failed: ${stderr}`));
            return;
          }
          
          const printers = printerDiscoveryService.parseLinuxPrinters(stdout);
          resolve(printers);
        });
        
        proc.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      cupsCheck.on("error", (err) => reject(err));
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
    const lines = output.split('\n');
    const printers = [];
    let currentPrinter = null;
    
    for (const line of lines) {
      const printerMatch = line.match(/printer (\S+) is enabled/);
      if (printerMatch) {
        if (currentPrinter) {
          printers.push(currentPrinter);
        }
        currentPrinter = {
          name: printerMatch[1],
          status: "online",
          connectionType: "unknown",
          platform: "linux"
        };
      }
      
      const deviceMatch = line.match(/device for (\S+): (.+)/);
      if (deviceMatch && currentPrinter) {
        currentPrinter.port = deviceMatch[2];
        currentPrinter.connectionType = printerDiscoveryService.detectLinuxConnectionType(deviceMatch[2]);
      }
      
      const statusMatch = line.match(/printer (\S+) disabled/);
      if (statusMatch && currentPrinter) {
        currentPrinter.status = "offline";
      }
    }
    
    if (currentPrinter) {
      printers.push(currentPrinter);
    }
    
    return printers;
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
      3: "error",
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
    const platform = os.platform();
    const testContent = `
========================================
DRAGONFLY GARDEN PRINTER TEST
========================================
Test Print Successful
Printer: ${printerName}
Platform: ${platform}
Time: ${new Date().toLocaleString()}
========================================
If you can read this, the printer
is working correctly!
========================================
`;
    
    try {
      if (platform === "win32") {
        return await printerDiscoveryService.testPrintWindows(printerName, testContent);
      } else {
        return await printerDiscoveryService.testPrintLinux(printerName, testContent);
      }
    } catch (error) {
      throw new Error(`Test print failed: ${error.message}`);
    }
  },

  /**
   * Test print on Windows
   */
  testPrintWindows: async (printerName, content) => {
    return new Promise((resolve, reject) => {
      // Try raw ESC/POS first via thermalPrinterService
      const thermalPrinterService = require('./thermalPrinterService');
      
      // Convert test content to ESC/POS
      const escPosBuffer = thermalPrinterService.convertTicketToEscPos(content, 80, true);
      const finalBuffer = thermalPrinterService.addEmptyLines(escPosBuffer, 2, 3);
      
      // Save binary for debugging
      const fs = require('fs');
      const path = require('path');
      try {
        const binPath = path.join(__dirname, '../../logs', `testprint_${Date.now()}.bin`);
        fs.writeFileSync(binPath, finalBuffer);
        console.log(`[thermal] Test print ESC/POS binary saved to ${binPath} (${finalBuffer.length} bytes)`);
      } catch (binErr) {
        console.error('[thermal] Failed to save test print binary:', binErr.message);
      }
      
      // Try raw methods
      thermalPrinterService.sendRawToPrinter(printerName, finalBuffer)
        .then(result => {
          console.log(`[thermal] Test print raw success: ${result.message}`);
          resolve({ success: true, message: "Test print sent successfully (raw ESC/POS)" });
        })
        .catch(rawErr => {
          console.warn(`[thermal] Test print raw failed: ${rawErr.message}, falling back to Out-Printer`);
          
          // Fallback to standard Out-Printer - write to temp file first
          const fs = require('fs');
          const path = require('path');
          const tempFile = path.join(require('os').tmpdir(), `testprint_${Date.now()}.txt`);
          fs.writeFileSync(tempFile, content);
          
          const psCommand = `Get-Content -Path '${tempFile}' -Raw | Out-Printer -Name '${printerName}'`;
          
          const proc = spawn("powershell", [
            "-NoProfile",
            "-NonInteractive", 
            "-Command",
            psCommand
          ], { shell: false });
          
          let stderr = "";
          proc.stderr.on("data", (data) => stderr += data);
          
          proc.on("close", (code) => {
            try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
            
            if (code === 0) {
              resolve({ success: true, message: "Test print sent successfully (standard)" });
            } else {
              reject(new Error(`PowerShell failed: ${stderr}`));
            }
          });
          
          proc.on("error", (err) => reject(err));
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
        
        // Try different USB package APIs
        let devices = [];
        if (typeof usb.getDeviceList === 'function') {
          devices = usb.getDeviceList();
        } else if (typeof usb.findByIds === 'function') {
          // Alternative API - just log that we have USB support but can't enumerate
          console.log('[discovery] USB package available but getDeviceList not found, using alternative method');
          // Try to find common printer VID/PIDs
          const commonPrinterVidPids = [
            [0x04b8, 0x0202], // Epson TM-T88
            [0x0416, 0x5011], // Star Micronics
            [0x0dd4, 0x0144], // Custom USB printer
            [0x0519, 0x0004], // Star Micronics TSP143
          ];
          
          for (const [vid, pid] of commonPrinterVidPids) {
            try {
              const device = usb.findByIds(vid, pid);
              if (device) {
                console.log(`[discovery] USB printer found via VID/PID: VID=${vid.toString(16)} PID=${pid.toString(16)}`);
                printers.push({
                  name: `USB Printer (VID:${vid.toString(16)} PID:${pid.toString(16)})`,
                  vendorId: vid,
                  productId: pid,
                  status: "online",
                  connectionType: "wire",
                  platform: os.platform(),
                  discoveredBy: "USB-Enumeration"
                });
              }
            } catch (e) {
              // Device not found, continue
            }
          }
          
          console.log(`[discovery] USB enumeration completed via VID/PID lookup, found ${printers.length} printers`);
          resolve(printers);
          return;
        } else {
          console.log('[discovery] USB package available but no enumeration method found');
          resolve([]);
          return;
        }
        
        console.log(`[discovery] USB enumeration found ${devices.length} total USB devices`);
        
        for (const device of devices) {
          // Check if device has printer class interface
          for (const config of device.configs) {
            for (const iface of config.interfaces) {
              for (const altSetting of iface.altSettings) {
                if (altSetting.bInterfaceClass === 0x07) { // Printer class
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
              }
            }
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
      release: os.release(),
      discoveryMethods: {
        mDNS: !!dnssd,
        SNMP: !!snmp,
        USB: !!usb
      }
    };
  }
};

module.exports = printerDiscoveryService;
