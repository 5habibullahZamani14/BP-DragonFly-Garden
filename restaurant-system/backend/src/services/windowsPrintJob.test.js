const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { submitWindowsPrintJob } = require("./windowsPrintJob");

const createChildProcess = (exitCode, output, errorOutput = "") => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  process.nextTick(() => {
    child.stdout.end(output);
    child.stderr.end(errorOutput);
    child.emit("close", exitCode);
  });
  return child;
};

test("Windows print job succeeds only after the spooler command confirms submission", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-print-test-"));
  let command;
  let argumentsList;

  try {
    const result = await submitWindowsPrintJob("Receipt\nTotal: 10.00\n", "Owner's Printer", "receipt.txt", {
      tempDirectory,
      spawnProcess: (executable, args) => {
        command = executable;
        argumentsList = args;
        return createChildProcess(0, "DRAGONFLY_PRINT_JOB_SUBMITTED\r\n");
      }
    });

    assert.equal(result.success, true);
    assert.equal(result.method, "windows-spooler");
    assert.match(result.message, /submitted to the Windows queue/);
    assert.equal(command, "powershell.exe");
    assert.ok(argumentsList[4].includes("System.Drawing.Printing.PrintDocument"));
    assert.ok(argumentsList[4].includes("DrawString"));
    assert.ok(!argumentsList[4].includes("Out-Printer"));
    assert.ok(argumentsList[4].includes("Owner''s Printer"));
    assert.deepEqual(fs.readdirSync(tempDirectory), []);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("Windows print job rejects spooler errors and success without confirmation", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-print-test-"));
  try {
    await assert.rejects(
      submitWindowsPrintJob("Receipt\n", "USB Printer", "receipt.txt", {
        tempDirectory,
        spawnProcess: () => createChildProcess(1, "", "Printer unavailable")
      }),
      /Printer unavailable/
    );
    assert.deepEqual(fs.readdirSync(tempDirectory), []);

    await assert.rejects(
      submitWindowsPrintJob("Receipt\n", "USB Printer", "receipt.txt", {
        tempDirectory,
        spawnProcess: () => createChildProcess(0, "")
      }),
      /Windows print submission failed/
    );
    assert.deepEqual(fs.readdirSync(tempDirectory), []);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
