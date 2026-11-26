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
    assert.ok(argumentsList[4].includes("$margins.Left = 0"));
    assert.ok(argumentsList[4].includes("$margins.Right = 24"));
    assert.ok(argumentsList[4].includes("$margins.Top = 7"));
    assert.ok(argumentsList[4].includes("$margins.Bottom = 7"));
    assert.ok(argumentsList[4].includes("$printableArea = $eventArgs.PageSettings.PrintableArea"));
    assert.ok(argumentsList[4].includes("$contentWidth = [single]($printableArea.Width - $margins.Left - $margins.Right)"));
    assert.ok(argumentsList[4].includes("$contentY = [single]($printableArea.Y + $margins.Top)"));
    assert.ok(argumentsList[4].includes("$contentHeight = [single]($printableArea.Height - $margins.Top - $margins.Bottom)"));
    assert.ok(argumentsList[4].includes("$content.Trim([char[]]\"`r`n\")"));
    assert.ok(argumentsList[4].includes("$script:baseFontSize = 9"));
    assert.ok(argumentsList[4].includes("$script:brandFontSize = 20"));
    assert.ok(argumentsList[4].includes("$script:totalFontSize = 13"));
    assert.ok(argumentsList[4].includes("$eventArgs.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit"));
    assert.ok(argumentsList[4].includes("$fontSize = [single]$script:baseFontSize"));
    assert.ok(!argumentsList[4].includes("$probeWidth"));
    assert.ok(argumentsList[4].includes("System.Drawing.Text.PrivateFontCollection"));
    assert.ok(argumentsList[4].includes("RobotoCondensed-Light.ttf"));
    assert.ok(argumentsList[4].includes("$_.Name -eq 'Roboto Condensed Light'"));
    assert.ok(argumentsList[4].includes("RobotoCondensed-Bold.ttf"));
    assert.ok(argumentsList[4].includes("$_.Name -eq 'Roboto Condensed'"));
    assert.ok(argumentsList[4].includes("Cinzel-Bold.ttf"));
    assert.ok(argumentsList[4].includes("$script:logoSize = 138"));
    assert.ok(argumentsList[4].includes("BodoniModa-Regular.ttf"));
    assert.ok(argumentsList[4].includes("New-ReceiptTextMetrics"));
    assert.ok(argumentsList[4].includes("Draw-ReceiptTextMetrics"));
    assert.ok(argumentsList[4].includes("$format.Alignment = [System.Drawing.StringAlignment]::Near"));
    assert.ok(argumentsList[4].includes("MeasureString($segment.Text, $font)"));
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

test("Windows receipt jobs render final-receipt logo, QR, and aligned amount rows", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-print-test-"));
  let script;
  let qrImagePrepared = false;
  let logoImagePrepared = false;
  try {
    await submitWindowsPrintJob(
        "[LOGO]\n[BRAND]BP DRAGONFLY GARDEN\n[BOLD][CENTER]NEW ORDER\n[THIN_RULE]\n[CHECKITEM]1 x Sample item\n[ITEMDETAIL]Note: no onion\n[ROW]TOTAL\tRM 5.00\n[TOTAL][ROW]TOTAL DUE\tRM 5.00\n[THICK_RULE]\n[QRCODE]https://www.facebook.com/BPDragonflyGarden/\n",
      "USB Printer",
      "receipt.txt",
      {
        interpretAlignmentTags: true,
        tempDirectory,
        spawnProcess: (_executable, args) => {
          script = args[4];
          const imageFiles = fs.readdirSync(tempDirectory).filter(file => file.endsWith(".png"));
          qrImagePrepared = imageFiles.some(file => file.startsWith("dragonfly-qr-"));
          logoImagePrepared = imageFiles.some(file => file.startsWith("dragonfly-logo-"));
          return createChildProcess(0, "DRAGONFLY_PRINT_JOB_SUBMITTED\r\n");
        }
      }
    );

    assert.ok(script.includes("$script:interpretAlignmentTags = $true"));
    assert.ok(script.includes("$line.StartsWith('[CENTER]')"));
    assert.ok(script.includes("$line.StartsWith('[RIGHT]')"));
    assert.ok(script.includes("$line.StartsWith('[LOGO]')"));
    assert.ok(script.includes("$line.StartsWith('[BRAND]')"));
    assert.ok(script.includes("$line.StartsWith('[THIN_RULE]')"));
    assert.ok(script.includes("$line.StartsWith('[THICK_RULE]')"));
    assert.ok(script.includes("$line.StartsWith('[ROW]')"));
    assert.ok(script.includes("$line.StartsWith('[TOTAL]')"));
    assert.ok(script.includes("$line.StartsWith('[QRCODE]')"));
    assert.ok(script.includes("$line.StartsWith('[CHECKITEM]')"));
    assert.ok(script.includes("$line.StartsWith('[ITEMDETAIL]')"));
    assert.ok(!script.includes("$line.Trim() -ieq 'BP DRAGONFLY GARDEN'"));
    assert.ok(script.includes("System.Drawing.StringAlignment]::Center"));
    assert.ok(script.includes("System.Drawing.StringAlignment]::Far"));
    assert.ok(script.includes("System.Drawing.FontStyle]::Bold"));
    assert.ok(script.includes("$fontStyle = [System.Drawing.FontStyle]::Regular; $alignment = [System.Drawing.StringAlignment]::Center"));
    assert.ok(script.includes("$eventArgs.Graphics.DrawImage($logo, $logoBounds)"));
    assert.ok(script.includes("$logoBounds = [System.Drawing.RectangleF]::new"));
    assert.ok(!script.includes("$logoAttributes"));
    assert.ok(script.includes("InterpolationMode]::HighQualityBicubic"));
    assert.ok(script.includes("PixelOffsetMode]::HighQuality"));
    assert.ok(script.includes("CompositingQuality]::HighQuality"));
    assert.ok(script.includes("InterpolationMode]::NearestNeighbor"));
    assert.ok(script.includes("$eventArgs.Graphics.DrawLine($pen"));
    assert.ok(script.includes("[single]$printableArea.X, ($y + ($baseLineHeight / 2)), [single]($printableArea.X + $printableArea.Width)"));
    assert.ok(script.includes("$contentX = [single]($printableArea.X + $margins.Left)"));
    assert.ok(script.includes("Draw-ReceiptCheckBox $eventArgs.Graphics"));
    assert.ok(script.includes("$eventArgs.Graphics.MeasureString('H', $checkBoxFont).Height"));
    assert.ok(script.includes("[single]($printableArea.X + $printableArea.Width)"));
    assert.ok(script.includes("$logoPath = '"));
    assert.ok(script.includes("$line.IndexOf([char]9)"));
    assert.ok(script.includes("$eventArgs.Graphics.DrawImage($qrImage, $qrBounds)"));
    assert.ok(script.includes("InterpolationMode]::NearestNeighbor"));
    assert.ok(script.includes("$rowWidth = [single]($labelMetrics.Width + $amountMetrics.Width)"));
    assert.ok(script.includes("if ($lineMetrics.Width -gt $lineContentWidth)"));
    assert.ok(script.includes("$contentX = [single]($printableArea.X + $margins.Left)"));
    assert.ok(script.includes("$contentY = [single]($printableArea.Y + $margins.Top)"));
    assert.ok(qrImagePrepared);
    assert.ok(logoImagePrepared);
    assert.deepEqual(fs.readdirSync(tempDirectory), []);
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
