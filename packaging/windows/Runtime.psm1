Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-PrivateDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        if ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Refusing a redirected configuration directory.'
        }
    } else { [void][IO.Directory]::CreateDirectory($Path) }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($sid in @($identity, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function New-RuntimeConfiguration([string]$StatePath, [string]$OwnerEmail) {
    if ($OwnerEmail.Length -gt 254 -or $OwnerEmail -notmatch '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$') {
        throw 'Enter a valid owner email. No configuration was created.'
    }
    New-PrivateDirectory $StatePath
    $file = Join-Path $StatePath 'runtime.env'
    if (Test-Path -LiteralPath $file) { return }
    $password = New-RandomSecret
    $secret = New-RandomSecret
    $token = New-RandomSecret
    $values = @(
        "WHINK_DB_PASSWORD=$password",
        "DATABASE_URL=postgresql://whink:${password}@postgres:5432/whink",
        "DIRECT_URL=postgresql://whink:${password}@postgres:5432/whink",
        "AUTH_SECRET=$secret", "NEXTAUTH_SECRET=$secret",
        'AUTH_URL=http://localhost:3211', 'NEXTAUTH_URL=http://localhost:3211',
        'AUTH_TRUST_HOST=true', "ENCRYPTION_KEY=$(New-RandomSecret)",
        "WHINK_OWNER_EMAILS=$OwnerEmail", "SIGNUP_BOOTSTRAP_TOKEN=$token", 'SIGNUP_ENABLED=',
        'WEBAUTHN_RP_ID=localhost', 'WEBAUTHN_ORIGIN=http://localhost:3211',
        'WORKER_ENABLED=true', 'WORKER_CONCURRENCY=1',
        'DEFAULT_MODEL=wink-qwen3.5-9b-8k', 'SWARM_MODEL=wink-qwen3.5-9b-8k',
        'EXTRACTION_MODEL=wink-qwen3.5-9b-8k',
        'OLLAMA_URL=http://host.docker.internal:11434',
        'OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:11434/v1',
        'EMBEDDING_MODEL=ollama/nomic-embed-text', 'NVIDIA_TRIAL_ENABLED=false',
        'STT_PROVIDER=', 'TTS_PROVIDER='
    )
    $encoding = New-Object Text.UTF8Encoding($false)
    # Token first: interruption cannot create a configured instance without its setup token.
    [IO.File]::WriteAllText((Join-Path $StatePath 'Setup-token.txt'), "Private first-account setup token:`r`n$token`r`n", $encoding)
    $temporary = Join-Path $StatePath ('runtime-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::WriteAllLines($temporary, $values, $encoding)
        [IO.File]::Move($temporary, $file)
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

function Assert-Payload([string]$Archive, [string]$ExpectedHash) {
    if ($ExpectedHash -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) {
        throw 'Installer payload checksum does not match. Re-download the package.'
    }
}

Export-ModuleMember -Function New-PrivateDirectory, New-RandomSecret, New-RuntimeConfiguration, Assert-Payload
