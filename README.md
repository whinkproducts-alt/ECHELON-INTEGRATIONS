# W.H.I.N.K. Ultimate

AI personal CEO. Two minds (WHINK + MAMBA), one memory, one permission engine.
Built by WHINK Apps, Calgary. Owner: Victor Igboekwe.

---

## Prerequisites

Install with Homebrew on Apple Silicon:

```sh
brew install --cask orbstack        # OrbStack (Docker runtime)
brew install node                   # Node 20+
brew install pnpm                   # pnpm 9+ (the workspace package manager)
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
AUTH_SECRET=<same or different random string>
DEFAULT_MODEL=claude-sonnet-4-6
ENCRYPTION_KEY=<64 hex chars: openssl rand -hex 32>   # encrypts stored API keys and social tokens
```

The action gateway is optional and off by default (`OPENCLAW_URL` empty). See
`services/openclaw/README.md` to enable it.

---

## Start Postgres

From the repo root:

```sh
docker compose up -d
```

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
