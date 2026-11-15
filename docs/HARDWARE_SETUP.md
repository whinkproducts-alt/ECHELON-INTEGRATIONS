# Running ECHELON across a Mac and a second machine

What was checked in this repo and what was not is marked on each line. Nothing here was run on a Windows machine.

## What the code allows (checked)

- **Model endpoints must be loopback.** `lib/local-only.ts` treats only `localhost`, `127.x.x.x` and `::1` as local. The internal-analysis worker (`lib/worker/ear-execution.ts`) and Local-Only mode refuse any other host, including a laptop at `192.168.x.x`. So pointing `OLLAMA_URL` at another machine's LAN address makes every local analysis fail closed.
- **Ollama must answer `/api/show` with a tensor list.** Current Ollama (0.40.16 here) returns it only when asked with `verbose: true`; the app now asks. Older or newer builds are untested.
- **Host liveness is derived, not stored.** `lib/capability/heartbeat.ts`: with defaults a host is ONLINE under 75 s since its last heartbeat, DEGRADED up to 120 s, then OFFLINE. Nothing has to be re-enabled when a host returns, and a provider you disabled by hand stays disabled.

## Using Ollama on a second machine: use an SSH tunnel, not a LAN address

Keep Ollama bound to the second machine's own loopback (its default). From the Mac, forward a local port to it, so the app still sees a loopback endpoint:

```bash
# On the Mac. Use another local port if the Mac runs its own Ollama on 11434.
ssh -N -L 127.0.0.1:11435:127.0.0.1:11434 <user>@<second-machine>
```

Then in `apps/web/.env`: `OLLAMA_URL=http://127.0.0.1:11435` and `OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:11435/v1`, and set `DEFAULT_MODEL` / `SWARM_MODEL` to a model installed on that machine.

- This avoids the `OLLAMA_HOST=0.0.0.0` plus firewall opening an earlier plan used, so nothing is exposed on the LAN.
- Judgement call: a tunnel makes a remote model look local to the app. Traffic stays on your network, encrypted by SSH, but if "local" must mean "this physical machine", do not use it.
- Not tested here: needs OpenSSH on both machines. On Windows, install the OpenSSH Server optional feature.
- Ollama's own settings (`OLLAMA_MODELS` for the model folder, for example) are documented by Ollama; not verified here.

## Host heartbeat

On the machine that hosts MCP servers, run `scripts/host-heartbeat.mjs` (Node 20+, no dependencies). Create the host in the Integration Hub first; its token is shown once.

```bash
ECHELON_URL=https://your-echelon.example ECHELON_HOST_ID=<id> ECHELON_HOST_TOKEN=<token> node scripts/host-heartbeat.mjs
```

It refuses plain http to a non-loopback address, never prints the token, and sends every 30 s by default (`ECHELON_HEARTBEAT_SEC`, minimum 5). Test one beat with `ECHELON_HEARTBEAT_ONCE=1`.

## Installers

Mac and Windows installation candidates are in `packaging/` (see `packaging/README.md`). Both are unsigned personal-use candidates, not proven one-click releases.

## Deliberately not covered

- **Public tunnel to the web app** (for example Cloudflare Tunnel). It exposes the login surface to the internet. `SETUP.md` section 6 says Mac-off operation needs a separately approved remote runtime and a real power-off test; do this only after a security review.
- **Backups.** A restore test is an open item in `docs/LAUNCH-CHECKLIST.md`. A dump of the Docker database (`docker exec <postgres container> pg_dump -U whink whink > backup.sql`) is the standard approach, but no restore was run here.
