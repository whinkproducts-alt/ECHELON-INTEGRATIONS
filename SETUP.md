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
