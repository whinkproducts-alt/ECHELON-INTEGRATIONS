# Local Setup & Development

## Prerequisites
- macOS (M3 or later)
- Node 22+, pnpm, Python 3.10+
- Postgres (local or Docker)
- OrbStack or Docker Desktop
- Ollama (optional, for local LLM fallback)

## Clone & Install
git clone https://github.com/whinkproducts-alt/KAMSI-PRIME.git
cd KAMSI-PRIME
pnpm install

## Local Ollama Model

WHINK Ultimate defaults to a local Qwen 3.5 9B Q4 model profile with an 8K context. On a 16 GB Mac, this keeps inference local while leaving memory for macOS and the app. From the repository root, install the base model and create the profile:

```sh
ollama pull qwen3.5:9b-q4_K_M
ollama create wink-qwen3.5-9b-8k -f apps/web/ollama/Modelfile
```

The app uses `wink-qwen3.5-9b-8k` for chat, memory tasks, and specialist work by default. This does not enable Ollama-to-cloud escalation; cloud routing remains a separate, explicitly configured provider path.

## Database Setup
cd apps/web
npx prisma generate
npx prisma migrate dev

## Run Dev Server
cd apps/web
pnpm dev
Open http://localhost:3000

## Run Tests
cd apps/web
pnpm exec vitest run

## Environment Variables
Copy `.env.example` to `.env.local`:
- ANTHROPIC_API_KEY=sk-...
- DEEPGRAM_API_KEY=...
- ELEVENLABS_API_KEY=...
- DATABASE_URL=postgresql://...
- OPENAI_API_KEY=... (optional backup)

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
Runs on localhost:3001.

## Git Workflow
Runs on localhost:3001.

## Git Workflow
git checkout main
git pull origin main
... make changes ...

git add .
git commit -m “feat: [description]”
git push origin main

## After You Finish a Session
Update HANDOFF.md with:
- What you completed
- What's blocked
- What the next AI should do
git add HANDOFF.md
git commit -m “handoff: [summary]”
git push origin main

## Troubleshooting
- Prisma error: `npx prisma generate` then `npx prisma db push`
- Node version: Use `nvm use 22`
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

