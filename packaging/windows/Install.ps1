Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Runtime.psm1') -Force
try {
    $destination = Join-Path $env:LOCALAPPDATA 'Programs\Whink Ultimate'
    New-PrivateDirectory $destination
    $metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
    Assert-Payload (Join-Path $PSScriptRoot 'source.zip') $metadata.payload_sha256
    foreach ($file in @('Start.cmd', 'Start.ps1', 'Runtime.psm1', 'Uninstall.ps1', 'source.zip', 'release.json', 'README.md')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $destination $file) -Force
    }
    $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Whink Ultimate'
    [void][IO.Directory]::CreateDirectory($menu)
    $shell = New-Object -ComObject WScript.Shell
    $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($entry in @(@('Whink Ultimate', 'Start.cmd', ''), @('Stop Whink Ultimate', 'Start.cmd', '-Stop'), @('Uninstall Whink Ultimate', 'Uninstall.ps1', ''))) {
        $shortcut = $shell.CreateShortcut((Join-Path $menu ($entry[0] + '.lnk')))
        if ($entry[1] -eq 'Start.cmd') {
            $shortcut.TargetPath = Join-Path $destination $entry[1]
            $shortcut.Arguments = $entry[2]
        } else {
            $shortcut.TargetPath = $powershell
            $shortcut.Arguments = '-NoProfile -NoExit -File "' + (Join-Path $destination $entry[1]) + '"'
        }
        $shortcut.WorkingDirectory = $destination
        $shortcut.Save()
    }
    # No privileged system changes, execution-policy bypass, downloads or runtime start during installation.
    Write-Host 'Installed. Open Whink Ultimate from the Start Menu to configure and start the local system.'
    exit 0
} catch { Write-Error $_; exit 1 }
