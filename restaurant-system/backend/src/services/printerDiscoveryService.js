/*
 * printerDiscoveryService.js — Cross-platform printer discovery and management
 * Supports Windows (PowerShell) and Linux (CUPS) with connection type detection
 */

const { spawn } = require("child_process");
const os = require("os");

const printerDiscoveryService = {
  /**
   * Discover all available printers on the system
   * Returns array of printer objects with name, connection type, and status
   */
  discoverPrinters: async () => {
    try {
      const platform = os.platform();
      
      if (platform === "win32") {
        return await printerDiscoveryService.discoverWindowsPrinters();
      } else {
        return await printerDiscoveryService.discoverLinuxPrinters();
      }
    } catch (error) {
      console.error("Printer discovery failed:", error);
      return [];
    }
  },

  /**
   * Discover printers on Windows using PowerShell
   */
  discoverWindowsPrinters: async () => {
    return new Promise((resolve, reject) => {
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
      
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`PowerShell failed: ${stderr}`));
          return;
        }
        
        try {
          const printers = JSON.parse(stdout);
          const formattedPrinters = printers.map(printer => ({
            name: printer.Name,
            driver: printer.DriverName,
            port: printer.PortName,
            status: printerDiscoveryService.getWindowsPrinterStatus(printer.PrinterStatus),
            connectionType: printerDiscoveryService.detectWindowsConnectionType(printer.PortName, printer.Type),
            platform: "windows"
          }));
          
          resolve(formattedPrinters);
        } catch (parseError) {
          reject(new Error(`Failed to parse printer data: ${parseError.message}`));
        }
      });
      
      proc.on("error", (err) => reject(err));
    });
  },

  /**
   * Discover printers on Linux using CUPS
   */
  discoverLinuxPrinters: async () => {
    return new Promise((resolve, reject) => {
      // First check if CUPS is available
      const cupsCheck = spawn("which", ["lpstat"], { shell: false });
      
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
        
        proc.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`lpstat failed: ${stderr}`));
            return;
          }
          
          const printers = printerDiscoveryService.parseLinuxPrinters(stdout);
          resolve(printers);
        });
        
        proc.on("error", (err) => reject(err));
      });
      
      cupsCheck.on("error", (err) => reject(err));
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
      const psCommand = `
        $content = @'
${content}
'@
        $content | Out-Printer -Name '${printerName}'
      `;
      
      const proc = spawn("powershell", [
        "-NoProfile",
        "-NonInteractive", 
        "-Command",
        psCommand
      ], { shell: false });
      
      let stderr = "";
      proc.stderr.on("data", (data) => stderr += data);
      
      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, message: "Test print sent successfully" });
        } else {
          reject(new Error(`PowerShell failed: ${stderr}`));
        }
      });
      
      proc.on("error", (err) => reject(err));
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
