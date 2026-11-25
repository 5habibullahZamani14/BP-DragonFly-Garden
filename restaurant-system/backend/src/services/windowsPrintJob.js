const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const QRCode = require("qrcode");
const sharp = require("sharp");
const {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
} = require("./receiptLayout");

const SUBMITTED_MARKER = "DRAGONFLY_PRINT_JOB_SUBMITTED";
const quotePowerShellLiteral = value => String(value).replace(/'/g, "''");
const RECEIPT_FONT_DIRECTORY = path.resolve(__dirname, "../../../../frontend/public/fonts/receipt");
const RECEIPT_FONT_FILES = Object.freeze({
  brandRegular: path.join(RECEIPT_FONT_DIRECTORY, "Cinzel-Regular.ttf"),
  brandBold: path.join(RECEIPT_FONT_DIRECTORY, "Cinzel-Bold.ttf"),
  textLight: path.join(RECEIPT_FONT_DIRECTORY, "RobotoCondensed-Light.ttf"),
  textBold: path.join(RECEIPT_FONT_DIRECTORY, "RobotoCondensed-Bold.ttf"),
  numericRegular: path.join(RECEIPT_FONT_DIRECTORY, "BodoniModa-Regular.ttf"),
  numericBold: path.join(RECEIPT_FONT_DIRECTORY, "BodoniModa-Bold.ttf"),
});

const submitWindowsPrintJob = async (ticket, printerName, filename, options = {}) => {
  if (!printerName || !String(printerName).trim()) {
    throw new Error("A printer must be selected before printing");
  }
  if (!ticket || !String(ticket).trim()) {
    throw new Error("Cannot submit an empty print job");
  }

  const ticketText = String(ticket);
  const spawnProcess = options.spawnProcess || spawn;
  const tempDirectory = options.tempDirectory || os.tmpdir();
  const columns = Number.isInteger(options.columns) && options.columns > 0
    ? options.columns
    : RECEIPT_LAYOUT.columns;
  const tempFilePath = path.join(
    tempDirectory,
    `dragonfly-print-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  const qrLine = ticketText.split(/\r?\n/).find(line => line.startsWith("[QRCODE]"));
  const qrUrl = qrLine ? qrLine.substring("[QRCODE]".length).trim() : "";
  let qrCodeBuffer = null;
  if (qrLine && !qrUrl) {
    throw new Error("The receipt QR code must contain a valid HTTPS URL.");
  }
  if (qrUrl) {
    let parsedQrUrl;
    try {
      parsedQrUrl = new URL(qrUrl);
    } catch {
      throw new Error("The receipt QR code must contain a valid HTTPS URL.");
    }
    if (parsedQrUrl.protocol !== "https:") {
      throw new Error("The receipt QR code must contain a valid HTTPS URL.");
    }
    qrCodeBuffer = await QRCode.toBuffer(qrUrl, {
      type: "png",
      width: 264,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  }
  const qrImagePath = qrCodeBuffer
    ? path.join(tempDirectory, `dragonfly-qr-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
    : "";
  const logoSourcePath = path.resolve(__dirname, "../../../../frontend/public/bp-dragonfly-garden-logo.png");
  const hasLogo = ticketText.split(/\r?\n/).some(line => line.startsWith("[LOGO]"));
  const logoImagePath = hasLogo
    ? path.join(tempDirectory, `dragonfly-logo-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
    : "";
  const logoSizeHundredthsInch = Math.round((RECEIPT_LAYOUT.logoSizeMm / 25.4) * 100);
  const qrCodeSizeHundredthsInch = Math.round((RECEIPT_LAYOUT.qrCodeSizeMm / 25.4) * 100);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "  Add-Type -AssemblyName System.Drawing",
    "  $script:receiptFonts = New-Object System.Drawing.Text.PrivateFontCollection",
    ...Object.values(RECEIPT_FONT_FILES).map(file =>
      `  $script:receiptFonts.AddFontFile('${quotePowerShellLiteral(file)}')`
    ),
    `  $content = [System.IO.File]::ReadAllText('${quotePowerShellLiteral(tempFilePath)}', [System.Text.Encoding]::UTF8)`,
    "  if ([string]::IsNullOrWhiteSpace($content)) { throw 'The print ticket is empty' }",
    `  $printerName = '${quotePowerShellLiteral(printerName)}'`,
    `  $logoPath = '${quotePowerShellLiteral(logoImagePath)}'`,
    `  $qrImagePath = '${quotePowerShellLiteral(qrImagePath)}'`,
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
    "  $script:bodyLightFontFamily = $script:receiptFonts.Families | Where-Object { $_.Name -eq 'Roboto Condensed Light' } | Select-Object -First 1",
    "  $script:bodyBoldFontFamily = $script:receiptFonts.Families | Where-Object { $_.Name -eq 'Roboto Condensed' } | Select-Object -First 1",
    "  $script:brandFontFamily = $script:receiptFonts.Families | Where-Object { $_.Name -eq 'Cinzel' } | Select-Object -First 1",
    "  $script:numericFontFamily = $script:receiptFonts.Families | Where-Object { $_.Name -eq 'Bodoni Moda 11pt' } | Select-Object -First 1",
    "  if (-not $script:bodyLightFontFamily -or -not $script:bodyBoldFontFamily -or -not $script:brandFontFamily -or -not $script:numericFontFamily) { throw 'A bundled receipt font could not be loaded' }",
    "  $script:baseFontFamily = $script:bodyLightFontFamily",
    `  $script:brandFontSize = ${RECEIPT_LAYOUT.brandFontSizePt}`,
    `  $script:totalFontSize = ${RECEIPT_LAYOUT.totalFontSizePt}`,
    `  $script:logoSize = ${logoSizeHundredthsInch}`,
    `  $script:qrCodeSize = ${qrCodeSizeHundredthsInch}`,
    "  $script:font = [System.Drawing.Font]::new($script:baseFontFamily, $script:baseFontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)",
    `  $script:interpretAlignmentTags = $${options.interpretAlignmentTags === true ? "true" : "false"}`,
    "  function New-ReceiptTextMetrics {",
    "    param([string]$text, $textFamily, $numericFamily, [single]$fontSize, [System.Drawing.FontStyle]$fontStyle, $graphics)",
    "    $segments = New-Object System.Collections.ArrayList",
    "    $matches = [regex]::Matches($text, '\\d+(?:[.,:/-]\\d+)*')",
    "    $cursor = 0",
    "    foreach ($match in $matches) {",
    "      if ($match.Index -gt $cursor) { [void]$segments.Add(@{ Text = $text.Substring($cursor, $match.Index - $cursor); Numeric = $false }) }",
    "      [void]$segments.Add(@{ Text = $match.Value; Numeric = $true })",
    "      $cursor = $match.Index + $match.Length",
    "    }",
    "    if ($cursor -lt $text.Length) { [void]$segments.Add(@{ Text = $text.Substring($cursor); Numeric = $false }) }",
    "    if ($segments.Count -eq 0) { [void]$segments.Add(@{ Text = $text; Numeric = $false }) }",
    "    $runs = New-Object System.Collections.ArrayList",
    "    $width = [single]0",
    "    $height = [single]0",
    "    foreach ($segment in $segments) {",
    "      $family = if ($segment.Numeric) { $numericFamily } else { $textFamily }",
    "      $font = [System.Drawing.Font]::new($family, $fontSize, $fontStyle, [System.Drawing.GraphicsUnit]::Point)",
    "      $measure = $graphics.MeasureString($segment.Text, $font)",
    "      $width += [single]$measure.Width",
    "      $height = [single][Math]::Max($height, [Math]::Max($font.GetHeight($graphics), $measure.Height))",
    "      [void]$runs.Add([pscustomobject]@{ Text = $segment.Text; Font = $font; Width = [single]$measure.Width })",
    "    }",
    "    return [pscustomobject]@{ Runs = $runs.ToArray(); Width = $width; Height = $height }",
    "  }",
    "  function Draw-ReceiptTextMetrics {",
    "    param($metrics, [single]$x, [single]$y, [single]$width, [single]$height, [System.Drawing.StringAlignment]$alignment, $graphics)",
    "    $drawX = $x",
    "    if ($alignment -eq [System.Drawing.StringAlignment]::Center) { $drawX += [single](($width - $metrics.Width) / 2) }",
    "    elseif ($alignment -eq [System.Drawing.StringAlignment]::Far) { $drawX += [single]($width - $metrics.Width) }",
    "    $format = New-Object System.Drawing.StringFormat",
    "    $format.Alignment = [System.Drawing.StringAlignment]::Near",
    "    $format.Trimming = [System.Drawing.StringTrimming]::None",
    "    try {",
    "      foreach ($run in $metrics.Runs) {",
    "        $runBounds = [System.Drawing.RectangleF]::new($drawX, $y, [single]([Math]::Max(1, $run.Width + 1)), $height)",
    "        $graphics.DrawString($run.Text, $run.Font, [System.Drawing.Brushes]::Black, $runBounds, $format)",
    "        $drawX += $run.Width",
    "      }",
    "    } finally { $format.Dispose() }",
    "  }",
    "  function Dispose-ReceiptTextMetrics {",
    "    param($metrics)",
    "    foreach ($run in $metrics.Runs) { $run.Font.Dispose() }",
    "  }",
    "  $document.add_PrintPage({",
    "    param($sender, $eventArgs)",
    "    $printableArea = $eventArgs.PageSettings.PrintableArea",
    "    $contentX = [single]$margins.Left",
    "    $contentY = [single]$margins.Top",
    "    $contentWidth = [single]($printableArea.Width - $margins.Left - $margins.Right)",
    "    $contentHeight = [single]($printableArea.Height - $margins.Top - $margins.Bottom)",
    "    $probeFont = [System.Drawing.Font]::new($script:baseFontFamily, $script:baseFontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)",
    "    try { $probeWidth = $eventArgs.Graphics.MeasureString(('M' * $script:columnCount), $probeFont).Width } finally { $probeFont.Dispose() }",
    "    if ($contentWidth -le 0 -or $contentHeight -le 0) { throw 'The printer driver did not report a usable printable area after margins' }",
    "    if ($probeWidth -le 0) { throw 'Could not measure the receipt font against the printable page width' }",
    "    $fontSize = [single]($script:baseFontSize * $contentWidth / $probeWidth)",
    "    if ($script:font.Size -ne $fontSize) { $script:font.Dispose(); $script:font = [System.Drawing.Font]::new($script:baseFontFamily, $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point) }",
    "    $baseLineHeight = $script:font.GetHeight($eventArgs.Graphics)",
    "    if ($baseLineHeight -le 0 -or $baseLineHeight -gt $contentHeight) { throw 'The printer page is too small for the selected font' }",
    "    $y = $contentY",
    "    while ($script:printLineIndex -lt $script:sourceLines.Length) {",
    "      $line = [string]$script:sourceLines[$script:printLineIndex]",
    "      $alignment = [System.Drawing.StringAlignment]::Near",
    "      $fontFamily = $script:baseFontFamily",
    "      $lineFontSize = $fontSize",
    "      $fontStyle = [System.Drawing.FontStyle]::Regular",
    "      $isRow = $false",
    "      $isBrand = $false",
    "      $isLogo = $false",
    "      $isQrCode = $false",
    "      $ruleThickness = 0",
    "      $isSpacer = $false",
    "      if ($script:interpretAlignmentTags) {",
    "        $readingTags = $true",
    "        while ($readingTags -and $line.StartsWith('[')) {",
    "          if ($line.StartsWith('[CENTER]')) { $alignment = [System.Drawing.StringAlignment]::Center; $line = $line.Substring(8).TrimStart() }",
    "          elseif ($line.StartsWith('[RIGHT]')) { $alignment = [System.Drawing.StringAlignment]::Far; $line = $line.Substring(7).TrimStart() }",
    "          elseif ($line.StartsWith('[LEFT]')) { $alignment = [System.Drawing.StringAlignment]::Near; $line = $line.Substring(6).TrimStart() }",
    "          elseif ($line.StartsWith('[LOGO]')) { $isLogo = $true; $line = $line.Substring(6).TrimStart() }",
    "          elseif ($line.StartsWith('[QRCODE]')) { $isQrCode = $true; $line = $line.Substring(8).TrimStart() }",
    "          elseif ($line.StartsWith('[THIN_RULE]')) { $ruleThickness = 1; $line = $line.Substring(11).TrimStart() }",
    "          elseif ($line.StartsWith('[THICK_RULE]')) { $ruleThickness = 2; $line = $line.Substring(12).TrimStart() }",
    "          elseif ($line.StartsWith('[SPACER]')) { $isSpacer = $true; $line = $line.Substring(8).TrimStart() }",
    "          elseif ($line.StartsWith('[BRAND]')) { $isBrand = $true; $fontFamily = $script:brandFontFamily; $lineFontSize = [single]($script:brandFontSize * $fontSize / $script:baseFontSize); $fontStyle = [System.Drawing.FontStyle]::Bold; $alignment = [System.Drawing.StringAlignment]::Center; $line = $line.Substring(7).TrimStart() }",
    "          elseif ($line.StartsWith('[TOTAL]')) { $lineFontSize = [single]($script:totalFontSize * $fontSize / $script:baseFontSize); $fontStyle = [System.Drawing.FontStyle]::Bold; $line = $line.Substring(7).TrimStart() }",
    "          elseif ($line.StartsWith('[ROW]')) { $isRow = $true; $line = $line.Substring(5).TrimStart() }",
    "          elseif ($line.StartsWith('[H1]')) { $fontStyle = [System.Drawing.FontStyle]::Bold; $line = $line.Substring(4).TrimStart() }",
    "          elseif ($line.StartsWith('[BOLD]')) { $fontStyle = [System.Drawing.FontStyle]::Bold; $line = $line.Substring(6).TrimStart() }",
    "          elseif ($line.StartsWith('[SQUARE]')) { $line = '[ ] ' + $line.Substring(8).TrimStart() }",
    "          else { $readingTags = $false }",
    "        }",
    "      }",
    "      if (-not $script:interpretAlignmentTags -and $line.Trim() -ieq 'BP DRAGONFLY GARDEN') { $isBrand = $true; $fontFamily = $script:brandFontFamily; $lineFontSize = [single]($script:brandFontSize * $fontSize / $script:baseFontSize); $fontStyle = [System.Drawing.FontStyle]::Bold; $alignment = [System.Drawing.StringAlignment]::Center; $line = 'BP DRAGONFLY GARDEN' }",
    "      if ($isLogo) {",
    "        if (-not (Test-Path -LiteralPath $logoPath)) { throw \"The BP Dragonfly Garden logo was not found at '$logoPath'\" }",
    "        $logo = [System.Drawing.Image]::FromFile($logoPath)",
    "        $logoAttributes = New-Object System.Drawing.Imaging.ImageAttributes",
    "        try {",
    "          $logoScale = [single][Math]::Min(($script:logoSize / $logo.Width), ($script:logoSize / $logo.Height))",
    "          $logoWidth = [single]($logo.Width * $logoScale)",
    "          $logoHeight = [single]($logo.Height * $logoScale)",
    "          if ($logoHeight -gt $contentHeight) { throw 'The logo is taller than the printable area' }",
    "          if ($y + $logoHeight -gt ($contentY + $contentHeight)) { $eventArgs.HasMorePages = $true; return }",
    "          $colorMatrix = New-Object System.Drawing.Imaging.ColorMatrix",
    "          $colorMatrix.Matrix00 = 0.299; $colorMatrix.Matrix01 = 0.299; $colorMatrix.Matrix02 = 0.299",
    "          $colorMatrix.Matrix10 = 0.587; $colorMatrix.Matrix11 = 0.587; $colorMatrix.Matrix12 = 0.587",
    "          $colorMatrix.Matrix20 = 0.114; $colorMatrix.Matrix21 = 0.114; $colorMatrix.Matrix22 = 0.114",
    "          $logoAttributes.SetColorMatrix($colorMatrix)",
    "          $logoBounds = [System.Drawing.Rectangle]::new([int]($contentX + (($contentWidth - $logoWidth) / 2)), [int]$y, [int]$logoWidth, [int]$logoHeight)",
    "          $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "          $eventArgs.Graphics.DrawImage($logo, $logoBounds, 0, 0, $logo.Width, $logo.Height, [System.Drawing.GraphicsUnit]::Pixel, $logoAttributes)",
    "          $y += $logoHeight",
    "        } finally { $logoAttributes.Dispose(); $logo.Dispose() }",
    "        $script:printLineIndex++",
    "        continue",
    "      }",
    "      if ($isQrCode) {",
    "        if (-not $qrImagePath -or -not (Test-Path -LiteralPath $qrImagePath)) { throw 'The receipt QR code image is missing' }",
    "        $qrImage = [System.Drawing.Image]::FromFile($qrImagePath)",
    "        try {",
    "          if ($script:qrCodeSize -gt $contentWidth) { throw 'The QR code is wider than the printable area' }",
    "          if ($y + $script:qrCodeSize -gt ($contentY + $contentHeight)) { $eventArgs.HasMorePages = $true; return }",
    "          $qrLeft = [int]($contentX + (($contentWidth - $script:qrCodeSize) / 2))",
    "          $qrBounds = [System.Drawing.Rectangle]::new($qrLeft, [int]$y, $script:qrCodeSize, $script:qrCodeSize)",
    "          $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor",
    "          $eventArgs.Graphics.DrawImage($qrImage, $qrBounds)",
    "          $y += $script:qrCodeSize",
    "        } finally { $qrImage.Dispose() }",
    "        $script:printLineIndex++",
    "        continue",
    "      }",
    "      if ($isSpacer) {",
    "        if ($y + ($baseLineHeight / 2) -gt ($contentY + $contentHeight)) { $eventArgs.HasMorePages = $true; return }",
    "        $y += ($baseLineHeight / 2)",
    "        $script:printLineIndex++",
    "        continue",
    "      }",
    "      if ($ruleThickness -gt 0) {",
    "        if ($y + $baseLineHeight -gt ($contentY + $contentHeight)) { $eventArgs.HasMorePages = $true; return }",
    "        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, $ruleThickness)",
    "        try { $eventArgs.Graphics.DrawLine($pen, $contentX, ($y + ($baseLineHeight / 2)), ($contentX + $contentWidth), ($y + ($baseLineHeight / 2))) } finally { $pen.Dispose() }",
    "        $y += $baseLineHeight",
    "        $script:printLineIndex++",
    "        continue",
    "      }",
    "      if (-not $isBrand) { $fontFamily = if ($fontStyle -eq [System.Drawing.FontStyle]::Bold) { $script:bodyBoldFontFamily } else { $script:bodyLightFontFamily } }",
    "      $numericFontFamily = if ($isBrand) { $fontFamily } else { $script:numericFontFamily }",
    "      if ($isRow -and $line.Contains(\"`t\")) {",
    "        $tabIndex = $line.IndexOf([char]9)",
    "        $label = $line.Substring(0, $tabIndex)",
    "        $amount = $line.Substring($tabIndex + 1)",
    "        $labelMetrics = New-ReceiptTextMetrics $label $fontFamily $numericFontFamily $lineFontSize $fontStyle $eventArgs.Graphics",
    "        $amountMetrics = New-ReceiptTextMetrics $amount $fontFamily $numericFontFamily $lineFontSize $fontStyle $eventArgs.Graphics",
    "        try {",
    "          $drawHeight = [single][Math]::Max($labelMetrics.Height, $amountMetrics.Height)",
    "          if ($drawHeight -gt $contentHeight) { throw 'A receipt line is taller than the printable area after margins' }",
    "          if ($y + $drawHeight -gt ($contentY + $contentHeight)) { $eventArgs.HasMorePages = $true; return }",
    "          $labelWidth = [single][Math]::Max(0, ($contentWidth - $amountMetrics.Width - 3))",
    "          Draw-ReceiptTextMetrics $labelMetrics $contentX $y $labelWidth $drawHeight ([System.Drawing.StringAlignment]::Near) $eventArgs.Graphics",
    "          Draw-ReceiptTextMetrics $amountMetrics ($contentX + $labelWidth) $y ($contentWidth - $labelWidth) $drawHeight ([System.Drawing.StringAlignment]::Far) $eventArgs.Graphics",
    "        } finally { Dispose-ReceiptTextMetrics $labelMetrics; Dispose-ReceiptTextMetrics $amountMetrics }",
    "      } else {",
    "        $lineMetrics = New-ReceiptTextMetrics $line $fontFamily $numericFontFamily $lineFontSize $fontStyle $eventArgs.Graphics",
    "        try {",
    "          $drawHeight = $lineMetrics.Height",
    "          if ($drawHeight -gt $contentHeight) { throw 'A receipt line is taller than the printable area after margins' }",
    "          if ($y + $drawHeight -gt ($contentY + $contentHeight)) { $eventArgs.HasMorePages = $true; return }",
    "          Draw-ReceiptTextMetrics $lineMetrics $contentX $y $contentWidth $drawHeight $alignment $eventArgs.Graphics",
    "        } finally { Dispose-ReceiptTextMetrics $lineMetrics }",
    "      }",
    "      $y += $drawHeight",
    "      $script:printLineIndex++",
    "    }",
    "    $eventArgs.HasMorePages = $false",
    "  })",
    "  try { $document.Print() } finally { $script:font.Dispose(); $script:receiptFonts.Dispose(); $document.Dispose() }",
    `  Write-Output '${SUBMITTED_MARKER}'`,
    "} catch {",
    "  [Console]::Error.WriteLine($_.Exception.Message)",
    "  exit 1",
    "}"
  ].join("\r\n");

  const cleanup = () => {
    for (const temporaryFile of [tempFilePath, qrImagePath, logoImagePath].filter(Boolean)) {
      try {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
      } catch (error) {
        console.warn("Could not remove temporary printer asset:", error.message);
      }
    }
  };
  try {
    fs.writeFileSync(tempFilePath, ticketText.replace(/\r?\n/g, "\r\n"), "utf8");
    if (qrCodeBuffer) fs.writeFileSync(qrImagePath, qrCodeBuffer);
    if (hasLogo) {
      await sharp(logoSourcePath)
        .flatten({ background: "#ffffff" })
        .greyscale()
        .normalise()
        .threshold(150)
        .png()
        .toFile(logoImagePath);
    }
  } catch (error) {
    cleanup();
    throw new Error(`Could not prepare receipt artwork: ${error.message}`);
  }

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };

    try {
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
};

module.exports = { submitWindowsPrintJob };
