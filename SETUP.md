# ECHELON local setup and desktop-launch requirements

Updated 2026-11-04. This is the setup path for the actual ECHELON repo. It does not mark full personal acceptance complete. Start with the [audit handoff](docs/ECHELON-AUDIT-HANDOFF-2026-11-04.md) and preserve existing private settings/data.

## 1. Prerequisites and checkout

Node 22, pnpm 10.28.0 (CI versions), Git, Docker Desktop or OrbStack for PostgreSQL + pgvector. Use an existing installed Ollama model for local text; optional local voice services require separate model/image preparation. Verify installed versions before adding software. Other versions were used historically but are not freshly certified here.

```sh
git clone https://github.com/whinkproducts-alt/ECHELON-CORP.git
cd ECHELON-CORP
pnpm install --frozen-lockfile
```

If the repository is already present, inspect `git status` and update safely; do not clone over it or discard other work.

## 2. Private settings

For a new instance, copy `apps/web/.env.example` to `apps/web/.env` **only if `.env` does not already exist**, then edit privately. Both `.env` and `.env.local` are ignored by Git. Never print/copy their values to chat, documentation, logs or an audit export.

- Database: `DATABASE_URL` and `DIRECT_URL` must identify this instance's database/port.
- Auth: `AUTH_SECRET`, `NEXTAUTH_SECRET`, `AUTH_URL`, `NEXTAUTH_URL`; use the actual local origin consistently. Preserve existing secrets rather than rotating them casually.
- Owner/passkey: `WHINK_OWNER_EMAILS`, `SIGNUP_BOOTSTRAP_TOKEN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`; perform controlled owner bootstrap, then keep open signup disabled (`SIGNUP_ENABLED=false`). Do not expose a fresh owner email to public signup.
- Encryption: valid `ENCRYPTION_KEY` per `.env.example`; changing it can make existing stored secrets/results unreadable. Preserve/backup it securely, outside Git.
- Local text: set `DEFAULT_MODEL` and `WHINK_LOCAL_MODEL` to the **exact installed tag**, and the correct loopback compatible/Ollama endpoint. Check `ollama list`; no model winner or installed tag is assumed. The example uses `wink-qwen3.5-9b-8k`.
- For an intended local-only instance, set both `WHINK_LOCAL_ONLY=true` and `NEXT_PUBLIC_WHINK_LOCAL_ONLY=true`; the browser flag is compiled into the client, so rebuild/restart as appropriate. Verify no remote calls across chat/background/embedding/voice, not just the first reply.
- The example currently selects Deepgram STT and OpenAI TTS. For local speech, clear those cloud selectors and configure the matching loopback `STT_URL`/`TTS_URL` and supported voice/provider (Kokoro requires its voice selection). A local URL alone does not override a cloud selector. No service configured means unavailable/browser fallback as supported, not proof of local audio.
- Configure optional providers only as needed for acceptance: SMTP/Twilio/Telegram, restricted GitHub provider, MCP hosts. Key presence is not spend authorization.

**Environment loading:** Next.js can load `.env.local` with higher precedence; Prisma CLI and the `dotenv/config` worker normally read `.env` from their working directory. Reconcile conflicting files privately. A value saved only in `.env.local` is not proof the worker/Prisma sees it. Do not delete either file as a shortcut.

## 3. Start this instance's database

```sh
docker compose up -d postgres
docker compose ps postgres
```

Start only `postgres`; plain `docker compose up -d` also starts optional speech images/services. The compose database binds to loopback. If 5432 is occupied, do not kill the existing database: set a different `POSTGRES_PORT` in a repo-root private `.env` and match both app database URLs. Do not repurpose an unrelated container or database.

## 4. Check and apply checked-in migrations

Back up any existing personal DB and encryption material, then verify the intended target before writing:

```sh
pnpm --filter app exec prisma generate
pnpm --filter app exec prisma migrate status
pnpm --filter app exec prisma migrate deploy
```

`migrate deploy` applies existing migrations; `migrate dev` is for creating/developing schema changes on developer data. Do not run `db push`, reset, or test seeds on a personal database. An old note recommending reset after the gateway migration was edited is superseded by inspection/forward-upgrade work in `20261102010000_gateway_constraint_upgrade`. If checksums/schema mismatch, stop and plan a backup/repair; do not force success.

The unknown-cost migration converts ambiguous historical zeros to null; reversal cannot reconstruct them. The reservations migration adds hold fields. Fresh CI migration success does not prove personal-data upgrade/restore safety.

## 5. Start app and worker separately

```sh
# Terminal 1, repo root; dev binds 127.0.0.1
pnpm dev
# Terminal 2, after WORKER_ENABLED=true is set privately:
pnpm --filter app worker
```

Open the configured origin, normally `http://localhost:3000`, and verify owner sign-in, passkey and data after restart. Starting the web app does not start the worker, MCP facade, heartbeat sender, Ollama or a speech service. `docs/whink-worker.plist.example` contains historical paths and is not installed by this repo.

For a built local instance use `pnpm --filter app build`, then `pnpm --filter app exec next start -H 127.0.0.1` with the configured port/origin. Keep the process on loopback. Avoid automatic builds/installs/migrations/model downloads on each user launch.

If a port is occupied, identify its owner and reuse only a verified healthy ECHELON instance or pick a configured alternate port. Do not run blanket `kill -9` commands. Stop only processes this instance owns, gracefully.

## 6. Desktop icon acceptance — pending implementation

No `.app`/`.command` launcher is tracked. Build a minimal ECHELON.app with approved icon that uses stable absolute paths/PATH, starts or reuses required services and worker, checks readiness before opening the configured URL, avoids duplicate processes, reports safe errors, and provides graceful stop. Keep secrets outside the bundle/logs. Handle Docker stopped, missing model, DB failure, port conflict, double click twice and reboot/login. Do not equate opening a browser tab with the worker or providers being ready.

Full personal-use gates remain in [the launch checklist](docs/LAUNCH-CHECKLIST.md). The icon does not postpone or close missing functionality. Mac-off operation requires a separately approved remote runtime and actual power-off test.

## 7. Validation and handoff

Use [testing.md](docs/testing.md) for isolated automated checks; never point tests/seeds at personal data. Record real setup failures and exact environment/receipt evidence without credentials. Before handing to another model, update the latest daily sync, [pending tasks](docs/pending-tasks.md), execution gates and relevant decisions/learnings. Do not package secrets or the personal database for auditors.
