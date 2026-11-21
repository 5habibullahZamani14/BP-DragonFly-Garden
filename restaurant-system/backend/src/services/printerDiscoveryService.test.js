const assert = require("node:assert/strict");
const test = require("node:test");
const printerDiscoveryService = require("./printerDiscoveryService");

test("parses enabled CUPS queues and associates each device with the correct queue", () => {
  const printers = printerDiscoveryService.parseLinuxPrinters([
    "printer kitchen is idle. enabled since Tue 12 Mar 2024 10:00:00 AM",
    "printer receipt is printing. enabled since Tue 12 Mar 2024 10:01:00 AM",
    "printer manager receipt is idle. enabled since Tue 12 Mar 2024 10:02:00 AM",
    "printer old_queue disabled since Tue 12 Mar 2024 09:00:00 AM - reason",
    "device for kitchen: usb://vendor/kitchen",
    "device for receipt: ipp://192.0.2.10/print",
    "device for manager receipt: usb://vendor/manager"
  ].join("\n"));

  assert.deepEqual(printers.map(printer => [printer.name, printer.status, printer.port]), [
    ["kitchen", "idle", "usb://vendor/kitchen"],
    ["receipt", "printing", "ipp://192.0.2.10/print"],
    ["manager receipt", "idle", "usb://vendor/manager"]
  ]);
});
