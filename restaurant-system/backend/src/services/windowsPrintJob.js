const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
} = require("./receiptLayout");

const SUBMITTED_MARKER = "DRAGONFLY_PRINT_JOB_SUBMITTED";
const quotePowerShellLiteral = value => String(value).replace(/'/g, "''");

const submitWindowsPrintJob = (ticket, printerName, filename, options = {}) => new Promise((resolve, reject) => {
  if (!printerName || !String(printerName).trim()) {
    reject(new Error("A printer must be selected before printing"));
    return;
  }
  if (!ticket || !String(ticket).trim()) {
    reject(new Error("Cannot submit an empty print job"));
    return;
  }

  const spawnProcess = options.spawnProcess || spawn;
  const tempDirectory = options.tempDirectory || os.tmpdir();
  const columns = Number.isInteger(options.columns) && options.columns > 0
    ? options.columns
    : RECEIPT_LAYOUT.columns;
  const tempFilePath = path.join(
    tempDirectory,
    `dragonfly-print-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "  Add-Type -AssemblyName System.Drawing",
    `  $content = [System.IO.File]::ReadAllText('${quotePowerShellLiteral(tempFilePath)}', [System.Text.Encoding]::UTF8)`,
    "  if ([string]::IsNullOrWhiteSpace($content)) { throw 'The print ticket is empty' }",
    `  $printerName = '${quotePowerShellLiteral(printerName)}'`,
    "  $document = New-Object System.Drawing.Printing.PrintDocument",
    "  $document.PrinterSettings.PrinterName = $printerName",
    "  if (-not $document.PrinterSettings.IsValid) { throw \"Printer '$printerName' is not available\" }",
    "  $document.DocumentName = 'Dragonfly Garden receipt'",
    "  $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController",
    "  $margins = New-Object System.Drawing.Printing.Margins",
    `  $margins.Left = ${RECEIPT_MARGIN_HUNDREDTHS_INCH}; $margins.Right = ${RECEIPT_MARGIN_HUNDREDTHS_INCH}; $margins.Top = 0; $margins.Bottom = ${RECEIPT_MARGIN_HUNDREDTHS_INCH}`,
    "  $document.DefaultPageSettings.Margins = $margins",
    "  $document.OriginAtMargins = $false",
    "  $script:sourceLines = @($content.Trim([char[]]\"`r`n\") -split \"`r?`n\")",
    "  $script:printLineIndex = 0",
    `  $script:columnCount = ${columns}`,
    `  $script:baseFontSize = ${RECEIPT_LAYOUT.baseFontSizePt}`,
    `  $script:font = New-Object System.Drawing.Font('${RECEIPT_LAYOUT.fontFamily}', $script:baseFontSize)`,
    `  $script:interpretAlignmentTags = $${options.interpretAlignmentTags === true ? "true" : "false"}`,
    "  $document.add_PrintPage({",
    "    param($sender, $eventArgs)",
    "    $printableArea = $eventArgs.PageSettings.PrintableArea",
    "    $contentX = [single]($printableArea.X + $margins.Left)",
    "    $contentY = [single]$printableArea.Y",
    "    $contentWidth = [single]($printableArea.Width - $margins.Left - $margins.Right)",
    "    $contentHeight = [single]($printableArea.Height - $margins.Bottom)",
    `    $probeFont = New-Object System.Drawing.Font('${RECEIPT_LAYOUT.fontFamily}', $script:baseFontSize)`,
    "    try { $probeWidth = $eventArgs.Graphics.MeasureString(('M' * $script:columnCount), $probeFont).Width } finally { $probeFont.Dispose() }",
    "    if ($contentWidth -le 0 -or $contentHeight -le 0) { throw 'The printer driver did not report a usable printable area after margins' }",
    "    if ($probeWidth -le 0) { throw 'Could not measure the receipt font against the printable page width' }",
    "    $fontSize = [single]($script:baseFontSize * $contentWidth / $probeWidth)",
    `    if ($script:font.Size -ne $fontSize) { $script:font.Dispose(); $script:font = New-Object System.Drawing.Font('${RECEIPT_LAYOUT.fontFamily}', $fontSize) }`,
    "    $lineHeight = $script:font.GetHeight($eventArgs.Graphics)",
    "    if ($lineHeight -le 0 -or $lineHeight -gt $contentHeight) { throw 'The printer page is too small for the selected font' }",
    "    $y = $contentY",
    "    while ($script:printLineIndex -lt $script:sourceLines.Length) {",
    "      $line = [string]$script:sourceLines[$script:printLineIndex]",
    "      $alignment = [System.Drawing.StringAlignment]::Near",
    "      if ($script:interpretAlignmentTags) {",
    "        $readingTags = $true",
    "        while ($readingTags -and $line.StartsWith('[')) {",
    "          if ($line.StartsWith('[CENTER]')) { $alignment = [System.Drawing.StringAlignment]::Center; $line = $line.Substring(8).TrimStart() }",
    "          elseif ($line.StartsWith('[RIGHT]')) { $alignment = [System.Drawing.StringAlignment]::Far; $line = $line.Substring(7).TrimStart() }",
    "          elseif ($line.StartsWith('[LEFT]')) { $alignment = [System.Drawing.StringAlignment]::Near; $line = $line.Substring(6).TrimStart() }",
    "          elseif ($line.StartsWith('[H1]')) { $line = $line.Substring(4).TrimStart() }",
    "          elseif ($line.StartsWith('[BOLD]')) { $line = $line.Substring(6).TrimStart() }",
    "          elseif ($line.StartsWith('[SQUARE]')) { $line = '[ ] ' + $line.Substring(8).TrimStart() }",
    "          else { $readingTags = $false }",
    "        }",
    "      }",
    "      $format = New-Object System.Drawing.StringFormat",
    "      $format.Alignment = $alignment",
    "      $format.Trimming = [System.Drawing.StringTrimming]::None",
    "      $lineSize = $eventArgs.Graphics.MeasureString($line, $script:font, $contentWidth, $format)",
    "      $drawHeight = [single][Math]::Max($lineHeight, $lineSize.Height)",
    "      if ($drawHeight -gt $contentHeight) { $format.Dispose(); throw 'A receipt line is taller than the printable area after margins' }",
    "      if ($y + $drawHeight -gt ($contentY + $contentHeight)) {",
    "        $format.Dispose()",
    "        $eventArgs.HasMorePages = $true",
    "        return",
    "      }",
    "      $layout = [System.Drawing.RectangleF]::new($contentX, $y, $contentWidth, $drawHeight)",
    "      try { $eventArgs.Graphics.DrawString($line, $script:font, [System.Drawing.Brushes]::Black, $layout, $format) } finally { $format.Dispose() }",
    "      $y += $drawHeight",
    "      $script:printLineIndex++",
    "    }",
    "    $eventArgs.HasMorePages = $false",
    "  })",
    "  try { $document.Print() } finally { $script:font.Dispose(); $document.Dispose() }",
    `  Write-Output '${SUBMITTED_MARKER}'`,
    "} catch {",
    "  [Console]::Error.WriteLine($_.Exception.Message)",
    "  exit 1",
    "}"
  ].join("\r\n");

  let stdout = "";
  let stderr = "";
  let settled = false;
  let child;

  const cleanup = () => {
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (error) {
      console.warn("Could not remove temporary printer ticket:", error.message);
    }
  };
  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (error) reject(error);
    else resolve(result);
  };

  try {
    fs.writeFileSync(tempFilePath, String(ticket).replace(/\r?\n/g, "\r\n"), "utf8");
    child = spawnProcess("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script
    ], { windowsHide: true, timeout: 30000 });
  } catch (error) {
    finish(new Error(`Could not start Windows print submission: ${error.message}`));
    return;
  }

  child.stdout.on("data", data => { stdout += data.toString(); });
  child.stderr.on("data", data => { stderr += data.toString(); });
  child.once("error", error => {
    finish(new Error(`Could not start Windows print submission: ${error.message}`));
  });
  child.once("close", code => {
    const markerFound = stdout.split(/\r?\n/).some(line => line.trim() === SUBMITTED_MARKER);
    if (code !== 0 || !markerFound) {
      const details = stderr.trim() || stdout.trim();
      finish(new Error(details || `Windows print submission failed (exit code ${code})`));
      return;
    }

    finish(null, {
      success: true,
      message: `Print job submitted to the Windows queue for ${printerName}`,
      filename,
      method: "windows-spooler"
    });
  });
});

module.exports = { submitWindowsPrintJob };
