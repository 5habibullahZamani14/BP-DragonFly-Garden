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

$applications = @(
    [pscustomobject]@{
        Name = 'DragonFly Garden - Manager'
        Launcher = 'Start the app in deployment form\Pc\START_MANAGEMENT_DEPLOY.bat'
        Icon = 'ICONS\ICO\MANAGER.ico'
        Description = 'Open the manager application'
    }
    [pscustomobject]@{
        Name = 'DragonFly Garden - Employee'
        Launcher = 'Start the app in deployment form\Pc\START_PAYMENT_COUNTER_DEPLOY.bat'
        Icon = 'ICONS\ICO\EMPLOYEE.ico'
        Description = 'Open the employee payment-counter application'
    }
    [pscustomobject]@{
        Name = 'DragonFly Garden - Customer'
        Launcher = 'Start the app in deployment form\Pc\START_TABLE1_DEPLOY.bat'
        Icon = 'ICONS\ICO\CUSTOMER.ico'
        Description = 'Open the customer ordering application'
    }
)

$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($application in $applications) {
        $launcherPath = Join-Path $repositoryRoot $application.Launcher
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
            $shortcut.TargetPath = $launcherPath
            $shortcut.WorkingDirectory = [System.IO.Path]::GetDirectoryName($launcherPath)
            $shortcut.IconLocation = "$iconPath,0"
            $shortcut.Description = $application.Description
            $shortcut.WindowStyle = 1
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
