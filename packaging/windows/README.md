# WHINK Ultimate for Windows

Run **Whink-Ultimate-Windows-Setup.exe**. It installs for your Windows account
under `%LOCALAPPDATA%\Programs\Whink Ultimate` and creates Start Menu shortcuts:
Whink Ultimate, Stop Whink Ultimate, and Uninstall Whink Ultimate. No administrator
rights or execution-policy changes are requested by the installer.

## First start

Use Windows 11 x64 with Docker Desktop installed, running Linux containers with
the WSL2 backend. Docker/WSL2 installation, virtualization and any required reboot
must be completed separately. The installer does not change Windows features or
accept Docker's terms on your behalf. Internet is required for the first image
build (Node dependencies and container images); this is not an offline bundle.

Open Whink Ultimate from Start. It checks Docker, asks for your owner email, creates
private credentials, builds and starts the web app, worker and pgvector/Postgres.
The browser opens `http://localhost:3211` only after its own web container is
healthy. The setup token opens in Notepad; use it with the exact owner email to
create the first account. Existing signup, authentication, tenant isolation,
permission, approval and spend checks remain unchanged. No seeded account or
password, paid keys, trial activation or model weights are bundled.

Configure your existing local Ollama/models separately. Defaults expect
`wink-qwen3.5-9b-8k` and `nomic-embed-text` on the Windows host. Voice, connectors
and other integrations require their own configuration and acceptance checks.
The worker process appearing in Docker is not proof it performed real work.

## Data and maintenance

Private credentials and release sources live under
`%LOCALAPPDATA%\WhinkUltimate\state`. That directory's ACL allows the current user
and Windows SYSTEM only. Do not share runtime.env or Setup-token.txt. After
successfully creating your account, you may remove the setup-token text file.
Retain the private encryption key in your secure backup; losing it can make
encrypted data unreadable. Backup/restore remains a separately unverified gate.

Only the web port binds to the host: `127.0.0.1:3211`. The separate persistent
database volume `whink-personal-data` has no published port. Migrations use
`prisma migrate deploy`; there is no reset, schema push or seed. Startup refuses
concurrent setup using a Windows per-user mutex. Missing prerequisites, occupied
ports and migration failures do not reset existing data or terminate other apps.

Stop preserves configuration/data. Stop the runtime before uninstalling if you
do not want it left running: uninstall removes only explicitly named application
files and shortcuts, leaving runtime configuration and Docker data intact.
Upgrades reuse the same DB/config, so back up before installing a new version.
Windows execution policies, SmartScreen and antivirus remain in force. The
candidate is unsigned; no bypass is included. A publisher signing certificate
is required for a signed distribution build.

## Build and verification

The EXE is compiled with Windows' built-in IExpress on the standard Windows
GitHub runner. No additional installer framework or runtime dependency is added.
`python packaging/windows/build.py --output OUTPUT` builds on Windows;
`--stage-only` verifies the same source payload on other hosts. Only allowed
tracked source filenames enter source.zip; environment files, symlinks, ignored
dependencies/builds and unrelated untracked files are excluded. release.json
records source revision, payload checksum and installer checksum.

The Windows packaging workflow parses PowerShell, tests private configuration,
checksum rejection and preservation, executes the EXE in its disposable runner,
checks installed files/shortcuts, and tests uninstall/data retention. It does not
claim a complete Docker/WSL2/model/worker/voice installation test. Read the delivered
verification results for the exact checks that completed. Existing product gates
in docs/LAUNCH-CHECKLIST.md remain open; this installer does not certify them.
