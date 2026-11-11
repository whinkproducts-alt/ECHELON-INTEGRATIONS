# ECHELON-INTEGRATIONS Mac test sandbox

This package runs the delivery branch of ECHELON-INTEGRATIONS locally on your
Mac. It is a test installation. It uses its own account, database, model cache,
configuration, Docker project and web port. It does not copy the main Echelon
database, credentials or provider keys. The interface listens on this Mac only.

## First launch

1. Run Docker Desktop or OrbStack. Allow substantial free storage for the web
   image, Postgres and optional speech models; 15 GiB is a prudent starting
   allowance, not a measured minimum. The Mac must be awake while you test.
2. Extract `ECHELON-Integrations-Sandbox-0.1.1.zip` and open
   `ECHELON Integrations Sandbox.app`, or run `Start Sandbox.command` from the
   extracted folder. The package is unsigned and unnotarized; macOS may ask you
   to confirm opening it. Do not disable system security controls.
3. Enter the owner email you want for the **sandbox account**. Setup creates
   fresh private credentials and applies checked-in migrations to a new
   `echelon-integrations-sandbox-data` Docker volume. The launcher prints the
   local URL, normally `http://localhost:3311`, and opens the browser. If that
   port is occupied, it selects and prints an unused high port.
4. Create your sandbox account with the one-time setup token opened locally
   by the launcher. Configure a local Ollama model if you want assistant replies;
   the default model names are only placeholders until the model is present.

The sandbox state is in
`~/Library/Application Support/ECHELON Integrations Sandbox/`. Its private
`runtime.env` is mode 0600. The database has no published port. The web port is
bound to `127.0.0.1` and is not a public website. Other devices and users cannot
reach it with this package. Nothing is deployed to the main Echelon instance.
The sandbox also uses distinct authentication cookie names, so signing into it
in the same browser does not replace the main local app's session.

## Keep the local address available

After the first successful launch, move `ECHELON Integrations Sandbox.app` to
`/Applications`, then run **Enable Sandbox Always On.command** from the
extracted folder. This installs two user-level macOS LaunchAgents: one checks
the existing Docker services every two minutes and restarts them if needed;
the other prevents idle system sleep **while the Mac is on AC power**. The
watchdog can reopen the Docker engine selected by your current Docker context
after login. It does not rebuild images, apply a new release, change your port,
open a browser, or touch the main app's database.

The URL is normally `http://localhost:3311`. If that port was occupied on
first setup, use the different address printed by the launcher; it is saved
with this sandbox's login and passkey settings. The watchdog will not silently
move it again. A Mac that is powered off, logged out, sleeping on battery, or
closed with its lid down cannot serve this local address. A network outage or
unavailable Docker engine also interrupts access. For access without relying
on this Mac, use a separate always-powered host with private HTTPS and its own
database after testing here.
If recovery fails, open **Start Sandbox.command** to see Docker's error; the
automatic check will not change your configuration or discard the database.

**Disable Sandbox Always On.command** removes both LaunchAgents. It leaves
the running sandbox services and saved data intact. Disable it before using
`Start Sandbox.command --stop`; otherwise the watchdog will restart the
services on its next check.
After replacing the app with a newer sandbox package, open it once to install
that release before relying on the watchdog again. It never applies new code
without that interactive launch.

## Test the new features

- In Settings → Speech Services, the **Whisper + Kokoro** option needs model
  preparation. Open `Prepare Sandbox Speech.command` in the extracted folder
  after the first launch. It builds the private CPU runtime, downloads official
  model/voice files into `echelon-integrations-sandbox-speech`, records their
  hashes and enables the adapter. It requires model-host access and at least
  3 GiB free **after** the image build. In Settings, choose **Check now** and
  listen to an actual reply. The first model download may take time.
- **VoiceStudio** is a separate Mac application. Its own runtime, models and
  authenticated local API must be working first. Then open
  `Configure Sandbox VoiceStudio.command` to save the token and your sandbox
  account ID privately. Run **Check now** before selecting it. Its host bridge
  may need Mac-specific connectivity testing.
- Try the navigation transitions, saved per-agent voices, Auto/manual speech
  selection and avatar lips while audio plays. The 5 a.m. check uses the
  timezone confirmed in your sandbox profile. A sleeping Mac catches up when
  the stack runs again.
- Higgsfield media uses a hosted provider. It is disabled in the initial
  sandbox configuration. Add a newly rotated key privately only when you want
  to test its approval and spending controls; actual generation may use credits.

No microphone, speech model, paid generation or real media upload is verified
merely by opening the page. The standalone `src/browser` integration modules in
this repository are not activated by the web app bundle; test those separately
before promotion.

## Stop, iterate and promote

Run `Start Sandbox.command --stop` from the extracted folder to stop its Docker
services while keeping the sandbox database and settings. Reopening the app
starts the same release and data. A newer package uses a new source copy but
keeps the sandbox database; back up that database and `runtime.env` before
testing schema-changing updates. Never point the sandbox at the main database.

Iterate on a branch of ECHELON-INTEGRATIONS and review its CI and security
checks. Install a candidate in this sandbox, then test the real flows on the
Mac. After acceptance, promote the reviewed commits to ECHELON-CORP through a
separate PR and migration/rollback review. The sandbox does not auto-push or
auto-deploy to the main Echelon repository.
