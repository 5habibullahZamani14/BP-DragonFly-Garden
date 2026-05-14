/*
 * printerService.js — Thermal printer integration for order tickets.
 *
 * This service handles formatting order data as a plain-text receipt and
 * sending it to a thermal printer. Because the printer is not yet physically
 * connected during this phase of development, the service has two operational
 * modes:
 *
 *   1. Fallback (no PRINTER_COMMAND set): The formatted ticket is written to a
 *      .txt file in the backend/logs directory. This lets us verify the ticket
 *      content looks correct without needing the hardware connected.
 *
 *   2. Live printing (PRINTER_COMMAND set): The formatted ticket text is piped
 *      into the shell command defined by PRINTER_COMMAND. On the Raspberry Pi
 *      this will be something like `lp -d thermal_printer` or a custom ESC/POS
 *      binary. The service streams the ticket to the process's stdin and waits
 *      for it to exit cleanly.
 *
 * Both modes write to the logs directory first so there is always a file record
 * of every print attempt, regardless of whether the hardware print succeeded.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const printerService = {
  /*
   * formatTicket converts an order object into a human-readable plain-text
   * receipt. The format uses fixed-width ASCII art borders so it looks correct
   * on a standard 42-character-wide thermal roll. Each line item shows the
   * quantity, unit price, and line total.
   */
  formatTicket: (order) => {
    const timestamp = new Date().toLocaleString();

    let ticket = "";
    ticket += "================================\n";
    ticket += "      RESTAURANT ORDERS        \n";
    ticket += "================================\n\n";
    ticket += `Order #${order.id}\n`;
    ticket += `Table: ${order.table_number}\n`;
    ticket += `Time: ${timestamp}\n`;
    ticket += `Status: ${order.status}\n\n`;
    ticket += "--------------------------------\n";
    ticket += "ITEMS:\n";
    ticket += "--------------------------------\n";

    if (Array.isArray(order.items)) {
      order.items.forEach((item, index) => {
        const lineTotal = item.quantity * item.price_at_order_time;
        ticket += `${index + 1}. ${item.item_name}\n`;
        ticket += `   Qty: ${item.quantity} x $${item.price_at_order_time.toFixed(2)} = $${lineTotal.toFixed(2)}\n`;

        if (item.notes) {
          ticket += `   Note: ${item.notes}\n`;
        }
      });
    }

    ticket += "\n--------------------------------\n";
    ticket += `TOTAL: $${order.total_price.toFixed(2)}\n`;
    ticket += "--------------------------------\n\n";
    ticket += "Please prepare items above\n";
    ticket += "================================\n";

    return ticket;
  },

  /*
   * printTicket formats the ticket and sends it to the printer. It always
   * saves a copy to the logs directory, then conditionally spawns the printer
   * command if PRINTER_COMMAND is set in the environment.
   */
  printTicket: (order) =>
    new Promise((resolve, reject) => {
      try {
        const ticket = printerService.formatTicket(order);

        /* Log the ticket content to the server console for debugging. */
        console.log("\n========== PRINTING TICKET ==========");
        console.log(ticket);
        console.log("=====================================\n");

        /* Save a file copy regardless of whether live printing is configured. */
        const logsDir = path.join(__dirname, "../../logs");
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `order_${order.id}_${timestamp}.txt`;
        const filepath = path.join(logsDir, filename);
        fs.writeFileSync(filepath, ticket);

        const printerCommand = process.env.PRINTER_COMMAND;

        /* If no printer command is configured, resolve with the file save result. */
        if (!printerCommand) {
          resolve({
            success: true,
            message: `Ticket saved for order #${order.id}`,
            filename
          });
          return;
        }

        let commandToRun = printerCommand;
        const usesFile = commandToRun.includes("{FILE}");
        
        if (usesFile) {
          commandToRun = commandToRun.replace(/{FILE}/g, filepath);
        }

        /*
         * Spawn the printer process. If the command uses a file directly, we
         * ignore stdin. Otherwise, we pipe stdin so we can stream the ticket text.
         */
        const printerProcess = spawn(commandToRun, {
          shell: true,
          stdio: usesFile ? ["ignore", "ignore", "pipe"] : ["pipe", "ignore", "pipe"]
        });

        let stderr = "";

        printerProcess.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        printerProcess.on("error", (processError) => {
          reject({
            success: false,
            message: "Error printing ticket",
            error: processError.message
          });
        });

        printerProcess.on("close", (code) => {
          if (code !== 0) {
            reject({
              success: false,
              message: "Printer command failed",
              error: stderr.trim() || `Exit code ${code}`
            });
            return;
          }

          resolve({
            success: true,
            message: `Ticket printed for order #${order.id}`,
            filename
          });
        });

        /* Write the ticket text to the process's stdin only if we aren't using {FILE} */
        if (!usesFile) {
          printerProcess.stdin.write(ticket);
          printerProcess.stdin.end();
        }
      } catch (error) {
        reject({
          success: false,
          message: "Error printing ticket",
          error: error.message
        });
      }
    }),

  /*
   * configurePrinter is a stub for future hardware configuration. On the
   * Raspberry Pi this will be expanded to set printer-specific options such
   * as paper width, character encoding, and cut settings.
   */
  configurePrinter: (config) => {
    console.log("Printer configuration:", config);
    return true;
  }
};

module.exports = printerService;
