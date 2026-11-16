# Windows run checklist (item 39)

**Status: Needs Victor** (a Windows machine). CI already builds and tests the installer on `windows-2025` (`.github/workflows/windows-installer.yml`: compiles the EXE, runs `packaging/windows/test.ps1`, install and data-preserving uninstall) and boots the packaged stack on Linux. That is not a real Windows run with Docker Desktop.

On a real Windows 11 PC, tick each box and note the date:
- [ ] Docker Desktop (WSL2 backend) installed and running; `docker info` works.
- [ ] Download the `whink-windows-installer` artifact from the latest passing "Windows installer" run; check SmartScreen behaviour (unsigned: expect a warning; do not bypass system security, report it).
- [ ] Run `Whink-Ultimate-Windows-Setup.exe`; first build finishes; browser opens `http://localhost:3211` (or the chosen port).
- [ ] Owner signup with the setup token works; signup closes afterwards.
- [ ] `node scripts/ops/readiness.mjs --url http://127.0.0.1:3211` all PASS (Git Bash or WSL for the `.sh` scripts; the readiness check is plain Node).
- [ ] Reboot; Docker restarts the stack; data and passkey survive.
- [ ] Uninstall keeps data (Docker volume `whink-personal-data`); reinstall sees it.
- [ ] Backup then restore with `scripts/ops/test-restore.sh` under WSL.
- [ ] Ollama for Windows reachable from the container (`host.docker.internal:11434`).
Record failures in `docs/pending-tasks.md`. Not yet verified on Windows: everything above.
