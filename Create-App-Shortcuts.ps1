[CmdletBinding()]
param(
    [string]$ShortcutDirectory
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ShortcutDirectory)) {
    $ShortcutDirectory = [Environment]::GetFolderPath([System.Environment+SpecialFolder]::DesktopDirectory)
}

if ([string]::IsNullOrWhiteSpace($ShortcutDirectory)) {
    throw 'Could not determine where to create the shortcuts.'
}

$ShortcutDirectory = [System.IO.Path]::GetFullPath($ShortcutDirectory)
New-Item -ItemType Directory -Path $ShortcutDirectory -Force | Out-Null
$powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powerShellPath -PathType Leaf)) {
    throw "Windows PowerShell was not found at $powerShellPath."
}
$launcherScript = Join-Path $repositoryRoot 'Start the app in deployment form\Pc\Start-DragonFlyGarden.ps1'
$statusServerScript = Join-Path $repositoryRoot 'Start the app in deployment form\Pc\Startup-Status-Server.cjs'
if (-not (Test-Path -LiteralPath $statusServerScript -PathType Leaf)) {
    throw "Startup status helper not found: $statusServerScript"
}

$applications = @(
    [pscustomobject]@{
        Name = 'Manager'
        Role = 'manager'
        Icon = 'ICONS\ICO\MANAGER.ico'
        Description = 'Open the manager application'
    }
    [pscustomobject]@{
        Name = 'Employee'
        Role = 'payment'
        Icon = 'ICONS\ICO\EMPLOYEE.ico'
        Description = 'Open the employee payment-counter application'
    }
    [pscustomobject]@{
        Name = 'Customer'
        Role = 'customer'
        Icon = 'ICONS\ICO\CUSTOMER.ico'
        Description = 'Open the customer ordering application'
    }
)

$previousShortcutNames = @(
    'DragonFly Garden - Manager.lnk'
    'DragonFly Garden - Employee.lnk'
    'DragonFly Garden - Customer.lnk'
)

foreach ($previousName in $previousShortcutNames) {
    $previousPath = Join-Path $ShortcutDirectory $previousName
    if (Test-Path -LiteralPath $previousPath -PathType Leaf) {
        Remove-Item -LiteralPath $previousPath -Force
    }
}

$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($application in $applications) {
        $launcherPath = $launcherScript
        $iconPath = Join-Path $repositoryRoot $application.Icon

        if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
            throw "Launcher not found: $launcherPath"
        }
        if (-not (Test-Path -LiteralPath $iconPath -PathType Leaf)) {
            throw "Icon not found: $iconPath"
        }

        $shortcutPath = Join-Path $ShortcutDirectory ($application.Name + '.lnk')
        $shortcut = $shell.CreateShortcut($shortcutPath)
        try {
            $shortcut.TargetPath = $powerShellPath
            $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Role {1}' -f $launcherPath, $application.Role
            $shortcut.WorkingDirectory = $repositoryRoot
            $shortcut.IconLocation = "$iconPath,0"
            $shortcut.Description = $application.Description
            $shortcut.WindowStyle = 7
            $shortcut.Save()
        }
        finally {
            [Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut) | Out-Null
        }

        Write-Output "Created $shortcutPath"
    }
}
finally {
    [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
}
