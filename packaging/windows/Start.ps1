param([switch]$Stop, [switch]$CheckOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Runtime.psm1') -Force
$mutex = $null
$acquired = $false
try {
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is required. Install it from docker.com, enable WSL2/Linux containers, and start it before reopening WHINK.'
    }
    $dockerOS = & docker.exe info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE -ne 0 -or "$dockerOS".Trim() -ne 'linux') {
        throw 'Docker must be running in Linux-container mode with WSL2. No configuration or data was changed.'
    }
    & docker.exe compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required.' }
    if ($CheckOnly) { Write-Host 'Docker Linux engine and Compose available. Runtime/model integrations not tested.'; exit 0 }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutex = New-Object Threading.Mutex($false, "Local\WhinkUltimate-$sid")
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Another WHINK setup/start operation is running. Wait for its window to finish.' }
    $state = Join-Path $env:LOCALAPPDATA 'WhinkUltimate\state'
    New-PrivateDirectory $state
    $env:WHINK_RUNTIME_ENV = Join-Path $state 'runtime.env'
    if ($Stop -and -not (Test-Path -LiteralPath $env:WHINK_RUNTIME_ENV)) { Write-Host 'No installed runtime to stop.'; exit 0 }
    if (-not (Test-Path -LiteralPath $env:WHINK_RUNTIME_ENV)) {
        Write-Host 'First start creates a separate local database. Existing checkout/data is not imported.'
        $ownerEmail = Read-Host 'Owner email (use this exact email at signup)'
        New-RuntimeConfiguration $state $ownerEmail
    }
    $metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
    if ($metadata.payload_id -notmatch '^[a-f0-9]{16}$') { throw 'Invalid release metadata.' }
    $env:WHINK_RELEASE_ID = $metadata.payload_id
    $runtime = Join-Path $state "releases\$($metadata.payload_id)"
    $archive = Join-Path $PSScriptRoot 'source.zip'
    Assert-Payload $archive $metadata.payload_sha256
    if (-not (Test-Path -LiteralPath (Join-Path $runtime '.extraction-complete'))) {
        New-PrivateDirectory $runtime
        Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
        [IO.File]::WriteAllText((Join-Path $runtime '.extraction-complete'), $metadata.payload_id)
    }
    $compose = @('compose', '--env-file', $env:WHINK_RUNTIME_ENV, '-f', (Join-Path $runtime 'packaging\local\compose.yaml'))
    if ($Stop) {
        & docker.exe @compose stop
        if ($LASTEXITCODE -ne 0) { throw 'Stop failed. Inspect Docker; no data was removed.' }
        Write-Host 'Stopped web, worker and database. Configuration and database volume preserved.'
        exit 0
    }
    Write-Host 'Building and starting web, worker and Postgres. First setup downloads images/dependencies and may take several minutes.'
    Write-Host 'Local Ollama/models must be configured separately. No paid model/provider is enabled or model weights downloaded.'
    & docker.exe @compose up --build -d
    if ($LASTEXITCODE -ne 0) { throw 'Setup failed. Check Docker output above. No database reset, seed or private-config overwrite was attempted.' }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $webID = & docker.exe @compose ps -q web
        if ($LASTEXITCODE -eq 0 -and $webID) {
            $health = & docker.exe inspect --format '{{.State.Health.Status}}' $webID
            if ($LASTEXITCODE -eq 0 -and $health -eq 'healthy') {
                & docker.exe @compose ps
                Write-Host 'Web ready. Worker process listing is not proof of actual model/service integration.'
                $tokenPath = Join-Path $state 'Setup-token.txt'
                if (Test-Path -LiteralPath $tokenPath) { Start-Process notepad.exe -ArgumentList ('"' + $tokenPath + '"') }
                Start-Process 'http://localhost:3211'
                exit 0
            }
        }
        Start-Sleep -Seconds 2
    }
    throw 'Web readiness timed out. Inspect Docker services and logs. Existing configuration and data are preserved.'
} catch {
    Write-Host ("WHINK: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($acquired -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
