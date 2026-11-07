param([Parameter(Mandatory=$true)][string]$OutputDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$checks = New-Object 'System.Collections.Generic.List[string]'
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object { $_.Extension -in '.ps1', '.psm1' }) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    Assert ($errors.Count -eq 0) ('PowerShell parse errors: ' + $file.Name + ': ' + ($errors | Out-String))
}
$checks.Add('PowerShell syntax parsed successfully')
Import-Module (Join-Path $PSScriptRoot 'Runtime.psm1') -Force
$fixture = Join-Path $env:TEMP ('whink-installer-test-' + [Guid]::NewGuid().ToString('N'))
New-RuntimeConfiguration $fixture 'owner@example.test'
$envFile = Join-Path $fixture 'runtime.env'
$first = (Get-FileHash -LiteralPath $envFile).Hash
$values = @{}
foreach ($line in [IO.File]::ReadAllLines($envFile)) { $pair = $line -split '=', 2; $values[$pair[0]] = $pair[1] }
Assert ($values['AUTH_SECRET'] -match '^[a-f0-9]{64}$') 'Auth secret must have 256 random bits'
Assert ($values['AUTH_SECRET'] -ne $values['ENCRYPTION_KEY']) 'Encryption and auth secrets must differ'
Assert ($values['WHINK_OWNER_EMAILS'] -eq 'owner@example.test') 'Owner configuration mismatch'
Assert ($values['SIGNUP_ENABLED'] -eq '') 'First-user-only signup must remain the default'
New-RuntimeConfiguration $fixture 'other@example.test'
Assert ((Get-FileHash -LiteralPath $envFile).Hash -eq $first) 'Existing private configuration changed'
$acl = Get-Acl -LiteralPath $fixture
Assert $acl.AreAccessRulesProtected 'Private state must not inherit broad permissions'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($rule in $acl.Access) {
    $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    Assert ($ruleSid -in @($sid, 'S-1-5-18')) 'Unexpected identity has access to private state'
}
$checks.Add('Random private credentials, ACL and existing configuration preservation passed')
$invalid = $false
try { New-RuntimeConfiguration (Join-Path $fixture 'invalid') "owner@example.test`nAUTH_SECRET=injected" } catch { $invalid = $true }
Assert $invalid 'Email/env injection must be rejected'
Assert (-not (Test-Path -LiteralPath (Join-Path $fixture 'invalid'))) 'Invalid input created configuration'
$checks.Add('Invalid owner input rejected without writes')
$archive = Join-Path $OutputDirectory 'stage\source.zip'
$metadata = Get-Content -LiteralPath (Join-Path $OutputDirectory 'stage\release.json') -Raw | ConvertFrom-Json
Assert-Payload $archive $metadata.payload_sha256
$rejected = $false
try { Assert-Payload $archive ('0' * 64) } catch { $rejected = $true }
Assert $rejected 'Mismatched payload must be rejected'
$checks.Add('Payload checksum success and mismatch rejection passed')

# The disposable Windows runner is the only target of this install/uninstall test.
$exe = Join-Path $OutputDirectory 'Whink-Ultimate-Windows-Setup.exe'
$process = Start-Process -FilePath $exe -ArgumentList '/Q' -PassThru
if (-not $process.WaitForExit(120000)) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    throw 'Installer exceeded 120 seconds; its test process tree was stopped.'
}
Assert ($process.ExitCode -eq 0) 'Installer returned an error'
$installed = Join-Path $env:LOCALAPPDATA 'Programs\Whink Ultimate'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Whink Ultimate'
foreach ($name in @('Start.cmd', 'Start.ps1', 'Runtime.psm1', 'Uninstall.ps1', 'source.zip', 'release.json', 'README.md')) {
    Assert (Test-Path -LiteralPath (Join-Path $installed $name)) ('Installed file absent: ' + $name)
}
foreach ($name in @('Whink Ultimate', 'Stop Whink Ultimate', 'Uninstall Whink Ultimate')) {
    Assert (Test-Path -LiteralPath (Join-Path $menu ($name + '.lnk'))) ('Start Menu shortcut absent: ' + $name)
}
$checks.Add('Compiled EXE executed: application files and three Start Menu shortcuts installed')
$state = Join-Path $env:LOCALAPPDATA 'WhinkUltimate\state'
New-PrivateDirectory $state
$sentinel = Join-Path $state 'synthetic-retention-test.txt'
[IO.File]::WriteAllText($sentinel, 'Synthetic retention fixture; no real account/data.')
& powershell.exe -NoProfile -File (Join-Path $installed 'Uninstall.ps1')
Assert ($LASTEXITCODE -eq 0) 'Uninstall returned an error'
Assert (Test-Path -LiteralPath $sentinel) 'Uninstall removed private runtime state'
Assert (-not (Test-Path -LiteralPath (Join-Path $installed 'Start.ps1'))) 'Application launcher survived uninstall'
Assert (-not (Test-Path -LiteralPath (Join-Path $menu 'Whink Ultimate.lnk'))) 'Start shortcut survived uninstall'
$checks.Add('Uninstall removed application/shortcuts and preserved synthetic runtime data')
@{ checks = @($checks.ToArray()); docker_runtime_verified = $false; signed = $false } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'verification.json') -Encoding UTF8
$checks | ForEach-Object { Write-Host "PASS: $_" }
