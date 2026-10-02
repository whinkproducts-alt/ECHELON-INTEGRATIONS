# W.H.I.N.K. Ultimate

AI personal CEO. Two minds (WHINK + MAMBA), one memory, one permission engine.
Built by WHINK Apps, Calgary. Owner: Victor Igboekwe.

---

## Prerequisites

Install with Homebrew on Apple Silicon:

```sh
brew install --cask orbstack        # OrbStack (Docker runtime)
brew install node                   # Node 20+
brew install ollama                 # Ollama (local models)
```

OrbStack must be running before you start Postgres.

---

## Clone and install

```sh
git clone <repo-url> whink-ultimate
cd whink-ultimate/apps/web
npm install
```

---

## Environment

```sh
cp .env.example .env
```

Open `apps/web/.env` and fill in at minimum:

```
DATABASE_URL=postgresql://whink:whink_local@localhost:5432/whink
ANTHROPIC_API_KEY=sk-ant-...
NEXTAUTH_SECRET=<any random string, e.g. openssl rand -hex 32>
AUTH_SECRET=<same or different random string>
DEFAULT_MODEL=claude-sonnet-4-6
```

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
npx prisma migrate dev
```

---

## Start the app

```sh
npm run dev
```

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
