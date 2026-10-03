# WHINK MCP gateway (`services/openclaw`)

WHINK's own gateway for external tools. It connects to the MCP servers listed in `config/servers.json`, and re-exposes their tools from ONE authenticated streamable HTTP endpoint (`POST /mcp`). Each tool is named `<platform>__<tool>`. WHINK adds `openclaw__`, so a tool appears as `openclaw__<platform>__<tool>`, and the full name must match `^[a-z0-9_]{1,64}$`.

Only `apps/web/lib/openclaw-client.ts` knows this transport.

## Run

1. Make one shared secret and put it in BOTH git-ignored files (`.env` is ignored everywhere, including `services/openclaw/.env`):

```
cd services/openclaw
cp .env.example .env
openssl rand -hex 32          # copy the output
# paste it as OPENCLAW_TOKEN=<value> in services/openclaw/.env
# and as OPENCLAW_TOKEN=<value> in apps/web/.env
```

2. Start the gateway. Compose reads `services/openclaw/.env` by itself, and refuses to start if `OPENCLAW_TOKEN` is empty:

```
docker compose up -d --build
```

3. In `apps/web/.env` set `OPENCLAW_URL=http://localhost:3100`, then restart `npm run dev`/`pnpm dev`. Within about 60 seconds WHINK offers `openclaw__ref__echo` and the other reference tools.

Leave `OPENCLAW_URL` empty to run without the gateway: WHINK makes no gateway call, writes no ledger row, and offers standard tools only. If it is set but the gateway is down, chat still works and the ledger records one `gateway_unavailable` row per request.

Hardening (see `docker-compose.yml`): non-root user (uid 1000), read-only root filesystem, only tmpfs writable (`/tmp` 64 MB noexec, `/home/node` 512 MB), all capabilities dropped, `no-new-privileges`, 512 MB memory and 1 CPU limit, 256 pids, healthcheck, `restart: unless-stopped`, base image pinned by exact version and digest. Measured: about 50 MB with the reference server on Apple Silicon.

Security properties:
- Published on `127.0.0.1:3100` only. It listens on `0.0.0.0` inside the container, and refuses to start on a non-loopback address without `OPENCLAW_TOKEN`.
- `POST /mcp` needs `Authorization: Bearer $OPENCLAW_TOKEN`, otherwise 401. `GET /healthz` is open and returns no tool data.
- The gateway never assigns permission classes and strips annotations. WHINK decides classes in `apps/web/config/tool-classes.json`, and anything unlisted is Class C.
- Descriptions are capped at 500 characters, responses at 64 KB. Call arguments and results are never logged.
- Upstream secrets come only from environment variable NAMES in the config (values from compose env). Literal secrets in the config are rejected.

## Config format (`config/servers.json`)

```json
{
  "servers": [
    { "platform": "ref", "transport": "stdio", "command": "node", "args": ["..."], "env": ["NAME_OF_ENV_VAR"] },
    { "platform": "gh", "transport": "http", "url": "https://host/mcp",
      "headers": { "Authorization": { "env": "GH_TOKEN", "prefix": "Bearer " } } }
  ]
}
```

- `platform`: `^[a-z0-9]{1,16}$`, unique.
- stdio: the child gets a minimal environment plus the variables named in `env`.
- http: header values are read from the variable named in `env`, with an optional `prefix`.
- Tool names: lowercased and `-` becomes `_`. Names that are invalid, collide, or make the full name longer than 64 characters are rejected and logged, never truncated.

## Adding any MCP server from GitHub (swap test)

Edit only `docker-compose.yml` and files under `config/`. No change to `apps/web`, no rebuild of `apps/web`.

1. Add an entry to `config/servers.json`.
   - npm server: `"command": "npx", "args": ["-y", "@scope/server-name@1.2.3"]`. Pin a version.
   - Python server: `"command": "uvx", "args": ["server-name==1.2.3"]`. In `docker-compose.yml` set the build arg `EXTRA_APK: "uv"`.
   - Hosted server: `"transport": "http"` with its URL.
2. If it needs credentials, add the variable to the `environment:` block in `docker-compose.yml` (`GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN:-}`), put the value in your git-ignored `.env`, and list the NAME in the entry (`"env": [...]` or `headers`).
3. `docker compose up -d --build` (use `--build` only when `EXTRA_APK` changes). The config is a read-only mount, so `docker compose restart` is enough for config-only edits.
4. WHINK picks up the new tools within 60 seconds. They are Class C (each call waits for approval) until you review them and list them in `apps/web/config/tool-classes.json`.

Example: the official GitHub MCP server (`github/github-mcp-server`, MIT). A copy-ready file is `config/servers.github.example.json`:

```jsonc
// add inside "servers" in config/servers.json
{
  "platform": "github",
  "transport": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": { "Authorization": { "env": "GITHUB_PERSONAL_ACCESS_TOKEN", "prefix": "Bearer " } }
}
// docker-compose.yml, under environment:
//   GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN:-}
```

Check each server's licence (MIT, Apache 2.0, BSD or ISC only) before adding it.

## Swap test record (C2), 2026-10-03

Added the official `mcp-server-time` 2026.8.18 (`modelcontextprotocol/servers`, MIT, read-only) by editing only `config/servers.json` (a `uvx` entry) and `docker-compose.yml` (`EXTRA_APK: "uv"`, three `UV_*` cache variables, `exec` on the `/home/node` tmpfs). After `docker compose up -d --build` the gateway listed `openclaw__time__get_current_time` and `openclaw__time__convert_time`, a call returned the time, and `git diff --stat` showed only those two files. No change to `apps/web`.

Result: the swap works. The entry was REVERTED because the server's Python dependency tree includes `certifi` (MPL-2.0) and `typing_extensions` (PSF-2.0), which are outside the MIT, Apache 2.0, BSD, ISC policy, and it needs the network at every start and raised memory to about 320 MB. Needs Victor's approval before it is used. Notes for any Python MCP server: the `/home/node` tmpfs needs `exec` (uvx unpacks a Python runtime and native wheels), and the `UV_*` variables must be listed in the entry's `"env"`.

## Reference server and licences

`ref` runs `@modelcontextprotocol/server-everything` 2026.8.31 from the image's `node_modules` (no network at runtime). The MCP project is moving from MIT to Apache-2.0. Both are allowed. Its npm package ships no LICENSE file, so compliance-checker should record the upstream repo licence. Transitive notes: `jszip` is `MIT OR GPL-3.0-or-later` (we use it under MIT), and `pako` is `MIT AND Zlib`. Both arrive through the reference server only. Delete the `ref` entry and the `server-everything` dependency to drop them.

## Develop

```
npm install && npm test && npm run typecheck
```
