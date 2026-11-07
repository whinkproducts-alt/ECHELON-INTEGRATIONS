Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Only explicitly named installed files are removed. Runtime state and Docker data stay intact.
$destination = Join-Path $env:LOCALAPPDATA 'Programs\Whink Ultimate'
if ([IO.Path]::GetFullPath($PSScriptRoot) -ne [IO.Path]::GetFullPath($destination)) { throw 'Run the installed uninstaller from the Start Menu.' }
foreach ($file in @('Start.cmd', 'Start.ps1', 'Runtime.psm1', 'source.zip', 'release.json', 'README.md')) {
    $path = Join-Path $destination $file
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
}
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Whink Ultimate'
foreach ($name in @('Whink Ultimate', 'Stop Whink Ultimate', 'Uninstall Whink Ultimate')) {
    $path = Join-Path $menu ($name + '.lnk')
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
}
Write-Host 'Application shortcuts/files removed. Docker services, private configuration and database data are preserved. Stop the runtime before uninstalling if you do not want it to keep running.'
# Remove this script last, never a recursive directory deletion.
Remove-Item -LiteralPath (Join-Path $destination 'Uninstall.ps1') -Force
