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

3. In `apps/web/.env` set `OPENCLAW_URL=http://localhost:3100`, then restart `npm run dev`/`pnpm dev`. Within about 60 seconds WHINK offers `openclaw__ref__echo` and `openclaw__ref__get_sum` (the reference server's other tools are not allow-listed).

Leave `OPENCLAW_URL` empty to run without the gateway: WHINK makes no gateway call, writes no ledger row, and offers standard tools only. If it is set but the gateway is down, chat still works and the ledger records one `gateway_unavailable` row per request.

Hardening (see `docker-compose.yml`): non-root user (uid 1000), read-only root filesystem, only tmpfs writable (`/tmp` 64 MB noexec, `/home/node` 512 MB), all capabilities dropped, `no-new-privileges`, 512 MB memory and 1 CPU limit, 256 pids, healthcheck, `restart: unless-stopped`, base image pinned by exact version and digest. Measured: about 50 MB with the reference server on Apple Silicon.

Security properties:
- Published on `127.0.0.1:3100` only. It listens on `0.0.0.0` inside the container.
- `OPENCLAW_TOKEN` is required in every mode. The gateway refuses to start without it, even on loopback.
- `POST /mcp` needs `Authorization: Bearer $OPENCLAW_TOKEN`, otherwise 401. `GET /healthz` is open and returns no tool data.
- DNS-rebinding defence: the `Host` header must be in the allow-list (default `localhost`, `127.0.0.1`, `[::1]`, `openclaw`; override with `GATEWAY_ALLOWED_HOSTS`, comma separated), and the SDK's own DNS-rebinding protection is on. Any request that carries an `Origin` header is refused with 403, because WHINK's client is server-side and never sends one.
- The gateway never assigns permission classes and strips annotations. WHINK decides classes in `apps/web/config/tool-classes.json`, and anything unlisted is Class C.
- Descriptions are capped at 500 characters, responses at 64 KB. Call arguments and results are never logged. Errors log only the error class name, never `err.message` or a body.
- Upstream secrets come only from environment variable NAMES in the config (values from compose env). Literal secrets are rejected at parse time (see below).
- Each upstream is refreshed in parallel with a 5 s `tools/list` timeout. If one fails, its last good tool snapshot keeps being served.

## Config format (`config/servers.json`)

```json
{
  "servers": [
    { "platform": "ref", "transport": "stdio", "command": "node",
      "args": ["/app/upstreams/ref/node_modules/@modelcontextprotocol/server-everything/dist/index.js", "stdio"],
      "env": ["REF_SOME_VAR"], "tools": ["echo", "get-sum"] },
    { "platform": "github", "transport": "http", "url": "http://github-mcp:8082/",
      "headers": { "Authorization": { "env": "GITHUB_PERSONAL_ACCESS_TOKEN", "prefix": "Bearer " } } }
  ]
}
```

Local override: if `config/local/servers.json` exists, it is used INSTEAD of `config/servers.json`. `config/local/` is git-ignored (root `.gitignore`) and docker-build-ignored (`.dockerignore`), but it is inside the read-only `./config` mount, so the running container sees it. Keep your real upstream list there. The startup log says which file was loaded.

Validation (the gateway refuses to start on any failure, and the error never echoes the offending value):
- `platform`: `^[a-z0-9]{1,16}$`, unique.
- Env names (stdio `env`, header `env`): `^[A-Z][A-Z0-9_]{0,63}$`, must start with `<PLATFORM_UPPER>_` (platform `github` needs `GITHUB_...`), and may not be `OPENCLAW_*`, `GATEWAY_*`, `PORT`, `HOST`, `CONFIG_PATH`, `NODE_OPTIONS`, `PATH` or `LD_*`. A name shaped like a token (`ghp_`, `github_pat_`, `gho_`, `ghs_`, `sk-`, `sk-ant-`, `xox[abpr]-`, `AKIA...`, `AIza...`) is rejected, and logged only as "invalid env name".
- Header `prefix`: `Bearer `, `Basic `, `Token ` or empty.
- stdio `args` and http `url`: rejected if they contain those token patterns or a 32+ character run of `[A-Za-z0-9_-]` (url: known patterns, and long runs in the path).
- stdio commands: see "Third-party servers" below.
- http `url`: must be `https` when the entry sends headers, unless the host is loopback or a bare compose service name (no dots). Link-local and metadata addresses (169.254.0.0/16, `fd00::/8`, `fe80::/10`, 100.100.100.200, `metadata.google.internal`) are always rejected.
- `tools` (optional): list of exact upstream tool names. When present, only those are exposed. Use it on every entry; omit it only for servers you have fully reviewed.
- Tool names: lowercased and `-` becomes `_`. Names that are invalid, collide, or make the full name longer than 64 characters are rejected and logged, never truncated.

## Third-party servers: separate containers, http transport

stdio children run with the gateway's uid, so they can read `/proc/1/environ` (which holds `OPENCLAW_TOKEN` and every other upstream's credentials). Therefore:

1. **Third-party MCP servers run as their own compose services and are reached over `http`.** They share no uid, `/proc` or filesystem with the gateway, and the gateway only forwards the one credential that upstream needs, as a header. Drop-in is still compose plus config only. No change to `apps/web`.
2. **stdio is allowed only for code baked into the gateway image.** The command must be `node` with `args[0]` an absolute path under `/app/node_modules/` or `/app/upstreams/`, or an absolute command path under `/app/`. `npx`, `uvx`, `sh`, `bash`, `python`, relative paths and `..` are rejected when the config is parsed. There are no runtime downloads.
3. **Residual risk for baked stdio servers:** the child still runs as the gateway uid and could read `/proc/1/environ`. Bake in only code you have reviewed, give it only the env vars named for it (the child never receives the gateway's environment, only a minimal default plus its named variables), and prefer the http pattern for anything you did not write.

Steps for any server that publishes a container image (example: the official GitHub MCP server, `ghcr.io/github/github-mcp-server`, MIT, which has a streamable HTTP mode started with `github-mcp-server http`, default port 8082, reading the token from the request's `Authorization` header):

1. In `docker-compose.yml` uncomment or add a service next to `openclaw` (see the commented `github-mcp` block). Use `expose:`, never `ports:`. Pin a tag or digest. Give it no secrets.
2. In `config/local/servers.json` add the http entry (copy from `config/servers.github.example.json`). The URL path (`/` here) is a default I could not test against a running image: check the server's docs for the pinned version and adjust.
3. Put `GITHUB_PERSONAL_ACCESS_TOKEN=...` in the git-ignored `.env` and list it in the `openclaw` service `environment:` block (`GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN:-}`).
4. Add a `tools` allow-list. `docker compose up -d`. WHINK picks up the tools within 60 seconds. They are Class C until listed in `apps/web/config/tool-classes.json`.

Servers that only ship as an npm or Python package: build them into their own small image (one Dockerfile in its own compose service, running a streamable HTTP wrapper or the server's native http mode), not into the gateway. Check each server's licence (MIT, Apache 2.0, BSD or ISC only) before adding it.

## Swap test record (C2), 2026-10-03

Added the official `mcp-server-time` 2026.8.18 (`modelcontextprotocol/servers`, MIT, read-only) through a `uvx` stdio entry and `EXTRA_APK: "uv"`. It worked, and was REVERTED because its Python dependency tree includes `certifi` (MPL-2.0) and `typing_extensions` (PSF-2.0), outside the MIT, Apache 2.0, BSD, ISC policy. Needs Victor's approval before use. NOTE: the `uvx`/`npx` stdio route used in that test is no longer accepted by the gateway (security review M2). The same swap now means running the server as its own compose service over http.

## Reference server (dev only) and licences

`ref` runs `@modelcontextprotocol/server-everything` 2026.8.31, installed from its own lockfile in `upstreams/ref/` into `/app/upstreams/ref/` of the image. It is NOT a dependency of the gateway: `npm ci --omit=dev` installs only the MCP SDK, so `server-everything`, `jszip` and `pako` never enter a product image.

- Local dev: `docker-compose.yml` sets the build arg `INCLUDE_REF_SERVER: "true"`, so the `ref` entry in `config/servers.json` works out of the box. Only `echo` and `get-sum` are allow-listed (`get-env` and `gzip-file-as-resource` are not exposed).
- Product images: build with `INCLUDE_REF_SERVER=false` (the Dockerfile default) and an empty or real servers config (`{ "servers": [] }` in `config/local/servers.json`, or edit the tracked file). With the `ref` entry present but the server absent, the gateway logs it as unavailable and serves nothing for it.

Licences: see `docs/THIRD_PARTY_NOTICES.md`.

## Develop

```
npm install && npm test && npm run typecheck
```

To build a product image: `docker build --build-arg INCLUDE_REF_SERVER=false -t whink-openclaw .`
