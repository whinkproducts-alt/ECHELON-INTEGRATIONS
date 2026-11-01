# Local Setup & Development

The short path to a first run. README.md has the longer version and the model-switching notes.

## Prerequisites
- Node 22 or newer (CI runs 22)
- pnpm 10 or newer (CI uses 10.28; a fresh install also passes with pnpm 12)
- Docker Desktop or OrbStack (runs Postgres with pgvector)
- git
- Ollama (optional, for local models)
- Python 3.10+ (only for the optional HOLO gesture bridge)

Developed on Apple silicon Macs; CI runs on Linux.

## 1. Clone and install
```sh
git clone https://github.com/whinkproducts-alt/KAMSI-PRIME.git
cd KAMSI-PRIME
pnpm install
```

## 2. Start the database
```sh
docker compose up -d postgres
docker ps        # the postgres line should say Up
```
Start `postgres` only. A plain `docker compose up -d` also starts the optional speech services, which are large downloads.
If port 5432 is already taken on your machine, see the troubleshooting note at the end.

## 3. Create the settings file
The file is `apps/web/.env`. It is **not** `.env.local`: Prisma only reads `.env`.
```sh
cd apps/web
S=$(openssl rand -hex 32)
cat > .env <<EOF
DATABASE_URL=postgresql://whink:whink_local@127.0.0.1:5432/whink
DIRECT_URL=postgresql://whink:whink_local@127.0.0.1:5432/whink
AUTH_SECRET=$S
NEXTAUTH_SECRET=$S
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
ENCRYPTION_KEY=$(openssl rand -hex 32)
SIGNUP_BOOTSTRAP_TOKEN=$(openssl rand -hex 16)
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
DEFAULT_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=PASTE_YOUR_KEY_HERE
WHINK_OWNER_EMAILS=PASTE_YOUR_EMAIL_HERE
EOF
```
Then edit the file and replace the two `PASTE_` values. The owner email must be the exact address you will sign up with.
`DEFAULT_MODEL` can be any model your key can use, or a local Ollama model (see below). `.env.example` lists every other setting.
Never commit `.env`; it is ignored by git.

## 4. Create the tables
```sh
pnpm exec prisma migrate deploy
```
This applies the checked-in migrations and never asks questions. (`migrate dev` is for creating new migrations.)

## 5. Run it
```sh
cd ..            # back to the repo root
pnpm dev
```
Open http://localhost:3000, press Create account, and use the owner email from step 3 (and the sign-up code if the form asks for `SIGNUP_BOOTSTRAP_TOKEN`).
Once your account exists, set `SIGNUP_ENABLED=false` in `apps/web/.env` and restart, so nobody else can register.

## Run tests
```sh
cd apps/web
pnpm exec vitest run
```

## Local Ollama Model

WHINK Ultimate defaults to a local Qwen 3.5 9B Q4 model profile with an 8K context. On a 16 GB Mac, this keeps inference local while leaving memory for macOS and the app. From the repository root, install the base model and create the profile:

```sh
ollama pull qwen3.5:9b-q4_K_M
ollama create wink-qwen3.5-9b-8k -f apps/web/ollama/Modelfile
```

The app uses `wink-qwen3.5-9b-8k` for chat, memory tasks, and specialist work by default. This does not enable Ollama-to-cloud escalation; cloud routing remains a separate, explicitly configured provider path.

### Gemma and the local workspace agent (optional, off by default)
Models whose name starts with `gemma` use Ollama's native `/api/chat` (change the prefixes with `WHINK_OLLAMA_NATIVE_MODELS`).
To let a local model inspect a code folder read-only, set `WHINK_LOCAL_AGENT_TOOLS=true` and `WHINK_WORKSPACE_ROOT=/absolute/path` in `apps/web/.env`;
only owner accounts can use these tools. `WHINK_LOCAL_ONLY=true` keeps every model call and network surface local.
The settings are documented in `.env.example` and the design in `docs/security.md`.

## HOLO Gestures (Optional Local)
cd services/holo-bridge
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 gesture-recognizer.py
Runs on localhost:5001, connects to React app via WebSocket.

## Voice Service (Optional)
cd services/whink-voice
pnpm install
pnpm dev
Runs on localhost:3001.

## Git Workflow
Work on a branch and open a pull request, so the checks (type check, tests, migrations on a real Postgres, browser tests,
dependency audit, gitleaks, CodeQL) run before `main` changes.
```sh
git checkout main && git pull origin main
git checkout -b my-change
# ... make changes, run the tests ...
git add -A && git commit -m "feat: short description"
git push -u origin my-change
```
Before adding or upgrading a dependency, check its publish date: pnpm 12 refuses packages less than 24 hours old.

## After You Finish a Session
Update HANDOFF.md with what you completed, what is blocked, and what the next person or agent should do, then commit it on your branch.

## Troubleshooting
- Prisma error: `npx prisma generate`, then `pnpm exec prisma migrate deploy`. Do not use `db push` on a shared database.
- Node version: use Node 22 or newer (`nvm use 22`).
- Port 3000 in use: Kill with `lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9`

## Troubleshooting: port 5432 is already in use

If `docker compose up -d postgres` fails with `bind: address already in use` on 5432, another Postgres is
running on your machine. Do not stop it. Run this project's database on another port instead:

1. In the repo root (next to docker-compose.yml) create a file named `.env` containing `POSTGRES_PORT=5433`.
2. In `apps/web/.env` change both `DATABASE_URL` and `DIRECT_URL` to use `127.0.0.1:5433`.
3. Run `docker compose up -d postgres` again.

## Troubleshooting: `docker-credential-desktop` not found

Docker Desktop's helper tool is not on your PATH. Add `export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"`
to `~/.zshrc` and open a new Terminal window.

## Troubleshooting: pnpm 12 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`

pnpm 12 refuses packages published in the last 24 hours. When bumping dependencies, check each new version's publish
date first and test with pnpm 12. See docs/decisions.md, 2026-10-27.

