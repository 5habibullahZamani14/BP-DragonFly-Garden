[CmdletBinding()]
param(
    [ValidateSet('manager', 'payment', 'home', 'none')]
    [string]$Role = 'manager'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backendPath = Join-Path $repositoryRoot 'restaurant-system\backend'
$frontendPath = Join-Path $repositoryRoot 'frontend'
$logsPath = Join-Path $backendPath 'logs'
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$launcherId = [guid]::NewGuid().ToString('N')
$setupLog = Join-Path $logsPath "launcher-$logStamp-$launcherId.log"
$serverStdoutLog = Join-Path $logsPath "server-$logStamp-$launcherId.stdout.log"
$serverStderrLog = Join-Path $logsPath "server-$logStamp-$launcherId.stderr.log"
$statusFile = Join-Path $logsPath "startup-status-$launcherId.json"
$statusPortFile = Join-Path $logsPath "startup-status-$launcherId.port"
$statusServerStdoutLog = Join-Path $logsPath "startup-status-$launcherId.stdout.log"
$statusServerStderrLog = Join-Path $logsPath "startup-status-$launcherId.stderr.log"
$backendProcess = $null
$statusServerProcess = $null
$statusPageOpened = $false
$startupMutex = $null
$mutexAcquired = $false

function Test-BackendReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/ready' -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Test-BackendPortListening {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connection = $client.BeginConnect('127.0.0.1', 5000, $null, $null)
        if (-not $connection.AsyncWaitHandle.WaitOne(500)) {
            return $false
        }
        $client.EndConnect($connection)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Invoke-NpmCommand {
    param(
        [Parameter(Mandatory = $true)][string]$NpmPath,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Add-Content -LiteralPath $setupLog -Value "[$(Get-Date -Format o)] $Description"
    Set-LauncherStatus -State 'working' -Message $Description
    Push-Location $WorkingDirectory
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $NpmPath @Arguments 2>&1 | Out-File -LiteralPath $setupLog -Encoding utf8 -Append
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }
    if ($exitCode -ne 0) {
        throw "$Description failed with exit code $exitCode. See the launcher log: $setupLog"
    }
}

function Test-FrontendBuildCurrent {
    $distIndexPath = Join-Path $frontendPath 'dist\index.html'
    if (-not (Test-Path -LiteralPath $distIndexPath -PathType Leaf)) {
        return $false
    }

    $buildTime = (Get-Item -LiteralPath $distIndexPath).LastWriteTimeUtc
    $inputPaths = @(
        $frontendPath,
        (Join-Path $frontendPath 'src'),
        (Join-Path $frontendPath 'public'),
        (Join-Path $frontendPath 'scripts')
    )

    foreach ($inputPath in $inputPaths) {
        if (-not (Test-Path -LiteralPath $inputPath -PathType Container)) {
            continue
        }

        $isFrontendRoot = $inputPath -eq $frontendPath
        $files = if ($isFrontendRoot) {
            Get-ChildItem -LiteralPath $inputPath -File -Force -ErrorAction Stop
        } else {
            Get-ChildItem -LiteralPath $inputPath -File -Force -Recurse -ErrorAction Stop
        }

        foreach ($file in $files) {
            if ($file.FullName -eq $distIndexPath) {
                continue
            }
            if ($file.LastWriteTimeUtc -gt $buildTime) {
                return $false
            }
        }
    }

    return $true
}

function Get-AppAddress {
    $ipAddress = $null
    try {
        $ipAddress = Get-NetIPConfiguration |
            Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway } |
            ForEach-Object { $_.IPv4Address } |
            Where-Object { $_.IPAddress -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -First 1 -ExpandProperty IPAddress
    }
    catch {
        $ipAddress = $null
    }

    if (-not $ipAddress) {
        try {
            $ipAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
                Select-Object -First 1 -ExpandProperty IPAddress
        }
        catch {
            $ipAddress = $null
        }
    }

    if (-not $ipAddress) {
        return 'localhost'
    }
    return $ipAddress
}

function Get-AppUrl {
    if ($Role -eq 'none') {
        return $null
    }

    $page = switch ($Role) {
        'manager' { '/?view=manager' }
        'payment' { '/?view=payment' }
        'home' { '/' }
    }
    return "http://$(Get-AppAddress):5000$page"
}

function Set-LauncherStatus {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('working', 'ready', 'error')][string]$State,
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Url
    )

    if ($Role -eq 'none') {
        return
    }

    if (-not (Test-Path -LiteralPath $logsPath -PathType Container)) {
        New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
    }
    $status = @{
        state = $State
        message = $Message
        logPath = $setupLog
        url = $Url
    } | ConvertTo-Json -Compress
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($statusFile, $status, $encoding)
}

function Open-StartupStatusPage {
    param([Parameter(Mandatory = $true)][string]$NodePath)

    $statusServerPath = Join-Path $PSScriptRoot 'Startup-Status-Server.cjs'
    if (-not (Test-Path -LiteralPath $statusServerPath -PathType Leaf)) {
        throw "Startup status page helper not found: $statusServerPath"
    }

    Set-LauncherStatus -State 'working' -Message 'Preparing DragonFly Garden...'
    $arguments = '"{0}" "{1}" "{2}"' -f $statusServerPath, $statusFile, $statusPortFile
    $script:statusServerProcess = Start-Process `
        -FilePath $NodePath `
        -ArgumentList $arguments `
        -WorkingDirectory $PSScriptRoot `
        -RedirectStandardOutput $statusServerStdoutLog `
        -RedirectStandardError $statusServerStderrLog `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        $script:statusServerProcess.Refresh()
        if ($script:statusServerProcess.HasExited) {
            throw "Startup status page helper exited. See $statusServerStderrLog"
        }
        if (Test-Path -LiteralPath $statusPortFile -PathType Leaf) {
            $port = [int](Get-Content -LiteralPath $statusPortFile -Raw)
            if ($port -lt 1 -or $port -gt 65535) {
                throw 'Startup status page helper returned an invalid local port.'
            }
            Start-Process "http://127.0.0.1:$port/"
            $script:statusPageOpened = $true
            return
        }
        Start-Sleep -Milliseconds 100
    }

    throw "Startup status page helper did not become ready. See $statusServerStderrLog"
}

function Show-LauncherError {
    param([Parameter(Mandatory = $true)][string]$Message)

    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            $Message,
            'DragonFly Garden could not start',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    catch {
        Write-Error $Message
    }
}

try {
    $backendReady = Test-BackendReady
    if ($backendReady) {
        if ($Role -ne 'none') {
            Start-Process (Get-AppUrl)
        }
        return
    }

    if (-not (Test-Path -LiteralPath (Join-Path $backendPath 'src\server.js') -PathType Leaf)) {
        throw "Could not find the backend at $backendPath."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $backendPath '.env') -PathType Leaf)) {
        throw "Backend configuration is missing. Copy .env.example to $backendPath\.env and configure it before starting the app."
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw 'Node.js 20 LTS or newer is required. Install Node.js, then try again.'
    }
    $nodeVersion = (& $nodeCommand.Source --version).Trim()
    $nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
    if ($nodeMajor -lt 20) {
        throw "Node.js 20 LTS or newer is required. Found $nodeVersion."
    }

    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw 'npm was not found. Reinstall Node.js with npm included.'
    }

    New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
    Add-Content -LiteralPath $setupLog -Value "[$(Get-Date -Format o)] Starting DragonFly Garden for role '$Role'."

    if ($Role -ne 'none') {
        Set-LauncherStatus -State 'working' -Message 'Checking whether DragonFly Garden is already starting...'
        Open-StartupStatusPage -NodePath $nodeCommand.Source
    }

    $startupMutex = New-Object System.Threading.Mutex($false, 'Local\DragonFlyGardenStartup')
    Set-LauncherStatus -State 'working' -Message 'Checking for another startup attempt...'
    try {
        $mutexAcquired = $startupMutex.WaitOne([TimeSpan]::FromMinutes(10))
    }
    catch [System.Threading.AbandonedMutexException] {
        $mutexAcquired = $true
    }
    if (-not $mutexAcquired) {
        throw 'Another DragonFly Garden startup is taking longer than expected. Check the other startup window before trying again.'
    }

    $backendReady = Test-BackendReady
    if (-not $backendReady -and (Test-BackendPortListening)) {
        Set-LauncherStatus -State 'working' -Message 'Waiting for the current server to finish starting or shutting down...'
        $readyDeadline = (Get-Date).AddSeconds(125)
        while ((Get-Date) -lt $readyDeadline) {
            if (Test-BackendReady) {
                $backendReady = $true
                break
            }
            if (-not (Test-BackendPortListening)) {
                break
            }
            Start-Sleep -Seconds 1
        }
        if (-not $backendReady -and (Test-BackendPortListening)) {
            throw 'Port 5000 is already in use, but DragonFly Garden did not become ready. No second server was started.'
        }
        if (-not $backendReady) {
            Start-Sleep -Seconds 2
        }
    }

    if ($backendReady) {
        if ($Role -ne 'none') {
            Set-LauncherStatus -State 'ready' -Message 'The server is ready. Opening your app...' -Url (Get-AppUrl)
        }
        return
    }

    if (-not (Test-Path -LiteralPath (Join-Path $backendPath 'node_modules') -PathType Container)) {
        Invoke-NpmCommand -NpmPath $npmCommand.Source -WorkingDirectory $backendPath -Arguments @('ci') -Description 'Installing backend dependencies...'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules') -PathType Container)) {
        Invoke-NpmCommand -NpmPath $npmCommand.Source -WorkingDirectory $frontendPath -Arguments @('ci') -Description 'Installing frontend dependencies...'
    }
    if (Test-FrontendBuildCurrent) {
        Add-Content -LiteralPath $setupLog -Value "[$(Get-Date -Format o)] Reusing the current production frontend build."
        Set-LauncherStatus -State 'working' -Message 'Checking the existing frontend build...'
        $secretScanPath = Join-Path $frontendPath 'scripts\check-client-secrets.cjs'
        & $nodeCommand.Source $secretScanPath 2>&1 | Out-File -LiteralPath $setupLog -Encoding utf8 -Append
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build secret scan failed with exit code $LASTEXITCODE."
        }
    } else {
        Invoke-NpmCommand -NpmPath $npmCommand.Source -WorkingDirectory $frontendPath -Arguments @('run', 'build') -Description 'Building the production frontend...'
    }

    Set-LauncherStatus -State 'working' -Message 'Starting the backend...'
    $backendProcess = Start-Process `
        -FilePath $nodeCommand.Source `
        -ArgumentList 'src/server.js' `
        -WorkingDirectory $backendPath `
        -RedirectStandardOutput $serverStdoutLog `
        -RedirectStandardError $serverStderrLog `
        -WindowStyle Hidden `
        -PassThru

    Add-Content -LiteralPath $setupLog -Value "[$(Get-Date -Format o)] Started backend process $($backendProcess.Id)."
    Set-LauncherStatus -State 'working' -Message 'Waiting for the database and backend to become ready...'
    $ready = $false
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        $backendProcess.Refresh()
        if ($backendProcess.HasExited) {
            if (Test-BackendReady) {
                $ready = $true
                break
            }
            throw "Backend process $($backendProcess.Id) exited before becoming ready. See $serverStderrLog"
        }
        if (Test-BackendReady) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        throw "Backend process $($backendProcess.Id) did not become ready within 90 seconds. It was left running to avoid an unsafe forced termination. Check $serverStdoutLog and $serverStderrLog before retrying."
    }

    if ($Role -ne 'none') {
        Set-LauncherStatus -State 'ready' -Message 'DragonFly Garden is ready. Opening your app...' -Url (Get-AppUrl)
    }
}
catch {
    $message = $_.Exception.Message
    if (Test-Path -LiteralPath $setupLog -PathType Leaf) {
        try {
            Add-Content -LiteralPath $setupLog -Value "[$(Get-Date -Format o)] Startup error: $message"
        }
        catch {
            # Keep the original startup error visible if logging is unavailable.
        }
        $message += "`r`n`r`nLauncher log: $setupLog"
    }
    if (Test-Path -LiteralPath $serverStderrLog -PathType Leaf) {
        $message += "`r`nBackend error log: $serverStderrLog"
    }
    if (Test-Path -LiteralPath $statusServerStderrLog -PathType Leaf) {
        $message += "`r`nStartup screen error log: $statusServerStderrLog"
    }
    if ($statusPageOpened) {
        try {
            Set-LauncherStatus -State 'error' -Message $message
        }
        catch {
            Show-LauncherError -Message "$message`r`n`r`nThe startup screen could not show this error."
        }
    }
    else {
        Show-LauncherError -Message $message
    }
    exit 1
}
finally {
    if ($mutexAcquired -and $startupMutex) {
        $startupMutex.ReleaseMutex()
    }
    if ($startupMutex) {
        $startupMutex.Dispose()
    }
}
finally {
    if ($mutexAcquired -and $startupMutex) {
        $startupMutex.ReleaseMutex()
    }
    if ($startupMutex) {
        $startupMutex.Dispose()
    }
}
