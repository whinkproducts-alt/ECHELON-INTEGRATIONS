# ECHELON-CORP

ECHELON is the private, Founder-directed AI organisation for the WHINK Group
(sister company of the WHINK Group). Product name: **ECHELON**. The legacy source
(KAMSI-PRIME / WHINK Ultimate) is preserved here as imported history.

Start here:
- `ECHELON-START-HERE.md` - authority, constraints, acceptance
- `docs/architecture-control/` - Founder decision register (FDR-001..029), contracts, governance
- `docs/ECHELON_ALL_IN_ONE_FOUNDER_BLUEPRINT_ASSETS_DECISIONS.txt` - full master plan archive
- `docs/CAPABILITY-GATEWAY.md` - E1/E4a/E4b capability gateway (this integration branch)
- `docs/GITHUB-GATEWAY-HANDOFF.md` - verified local worker and GitHub provider work, setup, and remaining acceptance
- `ECHELON_CODE_AUDIT_REPORT.txt` - audit of the first E4 code packages

The remainder of this file is the inherited WHINK Ultimate setup guide. It is kept
verbatim because the install steps still apply; product naming there is historical.

---

# W.H.I.N.K. Ultimate

AI personal CEO. Two minds (WHINK + MAMBA), one memory, one permission engine.
Built by WHINK Apps, Calgary. Owner: Victor Igboekwe.

---

## Prerequisites

Install with Homebrew on Apple Silicon:

```sh
brew install --cask orbstack        # OrbStack (Docker runtime)
brew install node                   # Node 22+
brew install pnpm                   # pnpm 10+ (the workspace package manager; 10 and 12 both work)
brew install ollama                 # Ollama (local models)
```

OrbStack must be running before you start Postgres.

---

## Clone and install

```sh
git clone <repo-url> whink-ultimate
cd whink-ultimate
pnpm install          # installs the whole workspace from pnpm-lock.yaml
```

This repo is a pnpm workspace (`pnpm-workspace.yaml`, `pnpm-lock.yaml`). Do not use `npm install`
or `yarn install` — they ignore the lockfile and fail on the `workspace:*` package.

---

## Environment

```sh
cd apps/web
cp .env.example .env
```

Open `apps/web/.env` and fill in at minimum:

```
DATABASE_URL=postgresql://whink:whink_local@localhost:5432/whink
ANTHROPIC_API_KEY=sk-ant-...
NEXTAUTH_SECRET=<any random string, e.g. openssl rand -hex 32>
AUTH_SECRET=<same value as NEXTAUTH_SECRET>
AUTH_URL=http://localhost:3000                        # the app's public address; reset links and cross-site checks use it
DEFAULT_MODEL=claude-sonnet-4-6                       # any model your key can use, or a local Ollama model
ENCRYPTION_KEY=<64 hex chars: openssl rand -hex 32>   # encrypts stored API keys and social tokens
WHINK_OWNER_EMAILS=you@example.com                    # the exact email you will sign up with: makes you the owner
SIGNUP_BOOTSTRAP_TOKEN=<any random string>            # the first account must send it; protects a fresh install
WEBAUTHN_RP_ID=localhost                              # passkeys and Touch ID
WEBAUTHN_ORIGIN=http://localhost:3000
```

SETUP.md has a copy-paste block that writes this file for you. The file must be named `.env` (not `.env.local`).

The action gateway is optional and off by default (`OPENCLAW_URL` empty). See
`services/openclaw/README.md` to enable it.

---

## Start Postgres

From the repo root:

```sh
docker compose up -d postgres
```

(A plain `docker compose up -d` also starts the optional speech services, which are large downloads.
If port 5432 is already in use on your machine, see the troubleshooting note in SETUP.md.)

Wait for the health check to pass (~5 s):

```sh
docker compose ps   # Status should show "healthy"
```

The `pgvector` extension is created automatically on first start via `docker/postgres/init.sql`.

---

## Run migrations

```sh
cd apps/web
pnpm exec prisma migrate deploy
```

---

## Start the app

From the repo root:

```sh
pnpm dev
```

Tests and build (from `apps/web`): `pnpm exec vitest run`, `pnpm exec next build`.

Open [http://localhost:3000](http://localhost:3000).

---

## Switch to Ollama (offline mode)

Make sure Ollama is running and the model is pulled:

```sh
ollama serve &
ollama pull llama3.1:8b
```

In `apps/web/.env`:

```
DEFAULT_MODEL=llama3.1:8b
OPENAI_COMPATIBLE_BASE_URL=http://localhost:11434/v1
```

Restart the dev server. The model router picks up the change.

---

## Switch to MAMBA

Type `/mamba` in the chat input. Type `/whink` to return to the primary mind.

---

## RAM budget (MacBook Air M3 16 GB)

| Service | Idle RAM |
|---|---|
| Postgres (pgvector/pgvector:pg16) | ~50 MB |
| Ollama + llama3.1:8b | ~5.5 GB |
| Next.js dev server | ~250 MB |

Use Claude or Gemini as `DEFAULT_MODEL` when running Ollama concurrently to keep headroom.
