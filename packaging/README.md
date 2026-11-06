# WHINK Ultimate — local Mac installation candidate

This package installs **Whink Ultimate.app** in Applications. Open it to set up
the full local **web + worker + pgvector/Postgres** stack in Docker. It is an
unsigned, unnotarized personal-use installation candidate, not a proven one-click
release. macOS may refuse it; no security bypass is included or recommended.

## Requirements and first start

1. Docker Desktop or OrbStack, running with Docker Compose v2 and enough free
   disk/memory for the Next.js build and Postgres. Internet is required to fetch
   pinned Node dependencies and container images. These are not bundled offline.
2. Install the `.pkg`, then open Whink Ultimate from Applications. Its Terminal
   setup asks for your owner email and creates random private credentials locally.
3. First build can take several minutes. After the web health check succeeds,
   the browser opens `http://localhost:3211`. Create your account with that owner
   email and the setup token opened in the private text file. Signup closes after
   the first account under the existing server policy. No password is bundled.
4. Configure your existing local Ollama service/model through the app. Defaults
   expect `wink-qwen3.5-9b-8k` and embedding model `nomic-embed-text` on the Mac.
   This package does not download model weights, grant provider entitlement,
   enable a paid fallback, or make unconfigured voice/connectors work. Cloud keys,
   if desired, must be configured separately with the application's normal gates.

The web listener is published only on `127.0.0.1:3211`. Database has no published
port. Configuration lives at `~/Library/Application Support/Whink Ultimate/runtime.env`
(mode 0600); release source copies are beneath `releases/`. It never imports
the developer checkout's `.env`, DB or credentials. It only runs checked-in
`prisma migrate deploy`; it never seeds, resets, pushes schema or deletes data.
The separate persistent Docker volume is `whink-personal-data`.

## Start, stop, restart and preservation

Reopen the app to reuse/start the same stack. Docker services restart with Docker.
There is no macOS login item or remote/Mac-off runtime provisioned. To stop, run:

```bash
"/Applications/Whink Ultimate.app/Contents/Resources/Start.command" --stop
```

Stop preserves the database/configuration. No uninstall/data-deletion command is
provided. Back up the private configuration (especially ENCRYPTION_KEY) and the
Postgres volume using your existing backup process before changing/upgrading an
installation. A tested backup/restore workflow remains outstanding; do not treat
this candidate as the sole copy of irreplaceable data. Never share `runtime.env`,
Setup-token.txt or raw logs with private payloads.

An interrupted setup may leave `install.lock` in the support folder. Close its
Terminal window before removing that empty lock directory. The launcher refuses
concurrent setup rather than terminating an unknown process. Port conflicts,
Docker failures and migration failures stop setup without resetting data. Fix the
reported prerequisite and reopen. Removing an application bundle does not remove
your personal data. Updates with a different source ID are separate source copies;
database/configuration remain shared, so rollback requires a reviewed DB backup.

## Build and evidence

Stage intended source files, then run from the repository:

```bash
python3 packaging/macos/build.py --output /absolute/path/to/output
```

The builder archives an explicit allowlist of git-index filenames. No ignored or
untracked files, symlinks, `.env`, dependencies or build outputs are shipped.
`release.json` records payload ID, package checksum and source base. The package
contains no postinstall scripts; it does not alter the host runtime during build.

Verification on the build host: shell syntax, Python compile, package creation,
payload inspection and source review. **Docker socket access is denied in the
coding session**, so image build, migrations, actual installation, worker claims,
model calls, restart, backup/restore and cross-account live acceptance are unproven.
Signing/notarization require the owner's Apple signing identity. Existing project
readiness gates in `docs/LAUNCH-CHECKLIST.md` remain open. Installing a desktop
package does not certify that every product integration is ready.
