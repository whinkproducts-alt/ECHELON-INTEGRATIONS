# WHINK Ultimate — local Mac installation candidate

This package contains **Whink Ultimate.app**. For a ZIP, extract it and drag the app into Applications; a PKG installs it there. Open it to set up
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
   the browser opens the local address printed by the launcher (normally `http://localhost:3211`). Create your account with that owner
   email and the setup token opened in the private text file. Signup closes after
   the first account under the existing server policy. No password is bundled.
4. Configure your existing local Ollama service/model through the app. Defaults
   expect `wink-qwen3.5-9b-8k` and embedding model `nomic-embed-text` on the Mac.
   This package does not download model weights, grant provider entitlement,
   enable a paid fallback, or make unconfigured voice/connectors work. Cloud keys,
   if desired, must be configured separately with the application's normal gates.

The web listener is published only on loopback. A new installation chooses an unused high port if 3211 is occupied; later launches preserve its configured origin and passkeys. Docker atomically binds the selected port; a concurrent conflict fails instead of opening another app. Database has no published
port. Configuration lives at `~/Library/Application Support/Whink Ultimate/runtime.env`
(mode 0600); release source copies are beneath `releases/`. It never imports
the developer checkout's `.env`, DB or credentials. It only runs checked-in
`prisma migrate deploy`; it never seeds, resets, pushes schema or deletes data.
The separate persistent Docker volume is `whink-personal-data`. Web, standing worker and optional speech adapters share the web network namespace so authenticated loopback speech works for daily checks too.

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

See the current release evidence for actual build/test results. Docker is accessible on the build host, but Prisma engine downloads are currently blocked by network policy. Type generation without an engine is not live database acceptance. Mac installation, actual speech inference, paid provider generation, restart and backup/restore remain separate acceptance gates.
Signing/notarization require the owner's Apple signing identity. Existing project
readiness gates in `docs/LAUNCH-CHECKLIST.md` remain open. Installing a desktop
package does not certify that every product integration is ready.

## Speech services, daily checks and agent voices

Settings → Speech Services provides Auto, Whisper + Kokoro, VoiceStudio and Previous provider. Selecting Auto confirms the displayed profile timezone. Set it correctly first. The standing worker checks at 5 a.m.; if the machine or stack was off, it catches up when running again. Synthetic recognition/synthesis checks do not record your microphone. Availability and measured sample latency determine selection; manual choices remain selected. Set WHINK/MAMBA/other stable speaker IDs to supported voice IDs separately for each service. No provider choice grants spoken approval authority.

VoiceStudio is a separate application, not bundled AGPL source. Install its official Apple Silicon release, complete its runtime/model setup and enable an authenticated local speech API. In the installed app bundle's Contents/Resources folder, `Configure Speech.command` saves the local API token privately, binds its use to your Echelon account ID and restarts the stack with the narrow bridge. Never paste API keys into chat. The bridge uses only the Mac host gateway, a configured port and four fixed speech endpoints; it does not expose the app publicly or copy your full runtime environment. Verify Docker Desktop/OrbStack can reach the private host listener. If it cannot, leave the service unconfigured; do not broaden the listener to the public network as a workaround.

Whisper + Kokoro's private CPU runtime is available through `Prepare Speech.command` in the installed app's Contents/Resources folder. The owner approved the separate runtime's GPL/LGPL exception on 2026-11-10; LICENSES.md and model repository notices are retained. This helper builds the runtime, explicitly downloads the official models and six voices into a private volume, then enables the speech service with a fresh local token. It requires at least 3 GiB free after the image build and access to Hugging Face model hosts. Startup/health checks never download models or fall back to the cloud. The serving cache is read-only. Run **Check now** in Speech Services after the helper finishes; Mac inference and voice quality remain to be accepted on the target computer. Docker CPU operation is a compatibility route, not a promise of native Metal speed.

## Higgsfield media production

Media Studio and governed media tools are separate from speech. Configure `HIGGSFIELD_ENABLED`, `HIGGSFIELD_ACCOUNT_USER_ID`, `HIGGSFIELD_KEY_ID`, and `HIGGSFIELD_KEY_SECRET` privately in the existing runtime configuration. Keys previously posted in chat should be replaced. Paid generation additionally requires the existing paid-dispatch operator flag and positive account spend cap; no key, paid enablement or balance is bundled. Local-Only mode blocks hosted media.

The workflow requires exact approval to send the prompt for an authoritative account estimate, then approval for that exact quoted generation. A higher refreshed estimate needs fresh approval. Estimates are not a guarantee of the final invoice. Completed generation reservations remain held pending billing reconciliation; uncertain submissions are not blindly retried. Without provider configuration or funding, installation alone cannot produce video.

## Updated avatar animation

Animated Board/Holo portraits use restrained movement derived from actual playback; they remain neutral without audio and stop on pause, silence or cancellation. Reduced-motion settings and an animation toggle are respected. This is audio-reactive animation, not phoneme alignment. Current canonical presence portraits remain static; audible appearance and timing need your Mac acceptance.
