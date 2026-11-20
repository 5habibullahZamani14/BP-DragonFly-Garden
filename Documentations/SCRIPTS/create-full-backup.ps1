$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backend = Join-Path $projectRoot "restaurant-system\backend"
$database = Join-Path $backend "src\database\database.sqlite"

Write-Host "Dragonfly Garden - manual data backup"
Write-Host "Project: $projectRoot"
Write-Host "Stop the restaurant application before continuing."

$listeners = Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue
if ($listeners) {
    throw "Port 5000 is listening. Confirm the application is stopped and retry."
}
if (-not (Test-Path -LiteralPath $database -PathType Leaf)) {
    throw "Database not found: $database"
}

$stage = Join-Path $env:TEMP ("DragonflyGardenBackup-" + [guid]::NewGuid().ToString("N"))
$backupDirectory = Join-Path $env:LOCALAPPDATA "DragonflyBackups"
$archive = Join-Path $backupDirectory ("dragonfly-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")

try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath $database -Destination (Join-Path $stage "database.sqlite")
    foreach ($suffix in @("-wal", "-shm")) {
        $sidecar = "$database$suffix"
        if (Test-Path -LiteralPath $sidecar -PathType Leaf) {
            Copy-Item -LiteralPath $sidecar -Destination (Join-Path $stage ("database.sqlite" + $suffix))
        }
    }

    foreach ($relative in @(
        "frontend\public\menu-images",
        "frontend\public\feedback-images",
        "restaurant-system\backend\uploads"
    )) {
        $source = Join-Path $projectRoot $relative
        if (Test-Path -LiteralPath $source -PathType Container) {
            $destination = Join-Path $stage $relative
            $destinationParent = Split-Path -Parent $destination
            New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
            Copy-Item -LiteralPath $source -Destination $destinationParent -Recurse
        }
    }

    New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open(
        $archive,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    try {
        Get-ChildItem -LiteralPath $stage -Force -File -Recurse | ForEach-Object {
            $entryName = $_.FullName.Substring($stage.Length + 1).Replace("\", "/")
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,
                $_.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
    finally {
        $zip.Dispose()
    }
    Write-Host "Backup created: $archive"
    Write-Host "The archive contains restaurant data. Store it securely."
}
finally {
    if (Test-Path -LiteralPath $stage -PathType Container) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}
