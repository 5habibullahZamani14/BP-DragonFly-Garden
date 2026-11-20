const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

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
    "  $script:printLines = @($content -split \"`r?`n\")",
    "  $script:printLineIndex = 0",
    "  $font = New-Object System.Drawing.Font('Consolas', 9)",
    "  $document.add_PrintPage({",
    "    param($sender, $eventArgs)",
    "    $lineHeight = $font.GetHeight($eventArgs.Graphics)",
    "    if ($lineHeight -le 0 -or $lineHeight -gt $eventArgs.MarginBounds.Height) { throw 'The printer page is too small for the selected font' }",
    "    $y = [single]$eventArgs.MarginBounds.Top",
    "    while ($script:printLineIndex -lt $script:printLines.Length) {",
    "      if ($y + $lineHeight -gt $eventArgs.MarginBounds.Bottom) {",
    "        $eventArgs.HasMorePages = $true",
    "        return",
    "      }",
    "      $eventArgs.Graphics.DrawString([string]$script:printLines[$script:printLineIndex], $font, [System.Drawing.Brushes]::Black, [single]$eventArgs.MarginBounds.Left, $y)",
    "      $y += $lineHeight",
    "      $script:printLineIndex++",
    "    }",
    "    $eventArgs.HasMorePages = $false",
    "  })",
    "  try { $document.Print() } finally { $font.Dispose(); $document.Dispose() }",
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
