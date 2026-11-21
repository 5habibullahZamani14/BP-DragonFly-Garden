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
    assert.ok(argumentsList[4].includes("$document.DefaultPageSettings.Margins = $margins"));
    assert.ok(argumentsList[4].includes("$margins.Left = 0; $margins.Right = 0"));
    assert.ok(argumentsList[4].includes("$printableArea = $eventArgs.PageSettings.PrintableArea"));
    assert.ok(argumentsList[4].includes("$format.Alignment = $alignment"));
    assert.ok(argumentsList[4].includes("MeasureString($line, $font"));
    assert.ok(argumentsList[4].includes("$script:interpretAlignmentTags = $false"));
    assert.ok(!argumentsList[4].includes("$maxCharacters"));
    assert.ok(!argumentsList[4].includes("$line.Substring($offset, $length)"));
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

test("Windows receipt jobs interpret only alignment markers", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-print-test-"));
  let script;
  try {
    await submitWindowsPrintJob("[CENTER]Title\n[RIGHT]Total: RM 5.00\n", "USB Printer", "receipt.txt", {
      interpretAlignmentTags: true,
      tempDirectory,
      spawnProcess: (_executable, args) => {
        script = args[4];
        return createChildProcess(0, "DRAGONFLY_PRINT_JOB_SUBMITTED\r\n");
      }
    });

    assert.ok(script.includes("$script:interpretAlignmentTags = $true"));
    assert.ok(script.includes("$line.StartsWith('[CENTER]')"));
    assert.ok(script.includes("$line.StartsWith('[RIGHT]')"));
    assert.ok(script.includes("System.Drawing.StringAlignment]::Center"));
    assert.ok(script.includes("System.Drawing.StringAlignment]::Far"));
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("Windows submission preserves source text and does not add custom wrapping", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-print-test-"));
  const ticket = "BP DRAGONFLY GARDEN\n\nLine two  \n";
  let submittedText;

  try {
    await submitWindowsPrintJob(ticket, "USB Printer", "test.txt", {
      tempDirectory,
      spawnProcess: () => {
        const [filename] = fs.readdirSync(tempDirectory);
        submittedText = fs.readFileSync(path.join(tempDirectory, filename), "utf8");
        return createChildProcess(0, "DRAGONFLY_PRINT_JOB_SUBMITTED\r\n");
      }
    });

    assert.equal(submittedText, ticket.replace(/\n/g, "\r\n"));
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
