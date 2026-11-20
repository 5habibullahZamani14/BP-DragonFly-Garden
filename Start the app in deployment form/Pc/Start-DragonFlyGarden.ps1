[CmdletBinding()]
param(
    [ValidateSet('manager', 'customer', 'payment', 'home', 'none')]
    [string]$Role = 'manager'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backendPath = Join-Path $repositoryRoot 'restaurant-system\backend'
$frontendPath = Join-Path $repositoryRoot 'frontend'
$logsPath = Join-Path $backendPath 'logs'
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$setupLog = Join-Path $logsPath "launcher-$logStamp.log"
$serverStdoutLog = Join-Path $logsPath "server-$logStamp.stdout.log"
$serverStderrLog = Join-Path $logsPath "server-$logStamp.stderr.log"
$backendProcess = $null
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
    Push-Location $WorkingDirectory
    try {
        & $NpmPath @Arguments 2>&1 | Out-File -LiteralPath $setupLog -Encoding utf8 -Append
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "$Description failed with exit code $exitCode. See the launcher log: $setupLog"
        }
    }
    finally {
        Pop-Location
    }
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
    $startupMutex = New-Object System.Threading.Mutex($false, 'Local\DragonFlyGardenStartup')
    try {
        $mutexAcquired = $startupMutex.WaitOne([TimeSpan]::FromSeconds(120))
    }
    catch [System.Threading.AbandonedMutexException] {
        $mutexAcquired = $true
    }
    if (-not $mutexAcquired) {
        throw 'Another DragonFly Garden startup is still in progress. Wait a moment and try again.'
    }

    $backendReady = Test-BackendReady
    if (-not $backendReady -and (Test-BackendPortListening)) {
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

    if (-not $backendReady) {
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

        if (-not (Test-Path -LiteralPath (Join-Path $backendPath 'node_modules') -PathType Container)) {
            Invoke-NpmCommand -NpmPath $npmCommand.Source -WorkingDirectory $backendPath -Arguments @('ci') -Description 'Installing backend dependencies'
        }
        if (-not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules') -PathType Container)) {
            Invoke-NpmCommand -NpmPath $npmCommand.Source -WorkingDirectory $frontendPath -Arguments @('ci') -Description 'Installing frontend dependencies'
        }
        Invoke-NpmCommand -NpmPath $npmCommand.Source -WorkingDirectory $frontendPath -Arguments @('run', 'build') -Description 'Building the production frontend'

        $backendProcess = Start-Process `
            -FilePath $nodeCommand.Source `
            -ArgumentList 'src/server.js' `
            -WorkingDirectory $backendPath `
            -RedirectStandardOutput $serverStdoutLog `
            -RedirectStandardError $serverStderrLog `
            -WindowStyle Hidden `
            -PassThru

        Add-Content -LiteralPath $setupLog -Value "[$(Get-Date -Format o)] Started backend process $($backendProcess.Id)."
        $ready = $false
        $deadline = (Get-Date).AddSeconds(90)
        while ((Get-Date) -lt $deadline) {
            $backendProcess.Refresh()
            if ($backendProcess.HasExited) {
                if (Test-BackendReady) {
                    $ready = $true
                    break
                }
                throw "Backend process $($backendProcess.Id) exited before becoming healthy. See $serverStderrLog"
            }
            if (Test-BackendReady) {
                $ready = $true
                break
            }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) {
            throw "Backend process $($backendProcess.Id) did not become healthy within 90 seconds. It was left running to avoid an unsafe forced termination. Check $serverStdoutLog and $serverStderrLog before retrying."
        }
    }

    if ($Role -ne 'none') {
        $page = switch ($Role) {
            'manager' { '/?view=manager' }
            'customer' { '/?qr=table-1' }
            'payment' { '/?view=payment' }
            'home' { '/' }
        }
        $serverAddress = Get-AppAddress
        $appUrl = "http://${serverAddress}:5000$page"
        Start-Process $appUrl
    }
}
catch {
    $message = $_.Exception.Message
    if (Test-Path -LiteralPath $setupLog -PathType Leaf) {
        $message += "`r`n`r`nLauncher log: $setupLog"
    }
    if (Test-Path -LiteralPath $serverStderrLog -PathType Leaf) {
        $message += "`r`nBackend error log: $serverStderrLog"
    }
    Show-LauncherError -Message $message
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
