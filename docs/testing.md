# Testing

Three layers. Each one catches things the others cannot.

| Layer | Where | Database | Browser | Command |
|---|---|---|---|---|
| Unit and route tests (vitest) | `apps/web/**/__tests__` | None. Prisma, the model router and outbound providers are mocked | No | `pnpm --filter app test` |
| Migrations and seed | `apps/web/prisma/migrations` | Real PostgreSQL 16 with pgvector | No | `prisma migrate deploy`, `prisma db seed` |
| End-to-end (Playwright) | `e2e/` | Real PostgreSQL 16 with pgvector | Real Chromium | `cd e2e && npx playwright test` |

## What is mocked and what is not

Mocked in unit tests: Prisma (so SQL is NOT exercised), the model router (no model is ever called), Twilio/SMTP/Telegram, AnythingLLM, OpenClaw, time (for the 30 second approval window).

Not mocked in e2e: the built Next.js server and its proxy (auth wall, CSRF, CSP, rate limit), Auth.js login with bcrypt, Prisma with real SQL, every migration, the permission engine, the approval flow and the ledger.

Still not covered anywhere automatic: real model replies (no key is set in e2e, so chat paths that need a model are out of scope), real message delivery (no provider is configured, so approving a message records the approval and reports "not configured"; nothing is sent), voice, AnythingLLM and the gateway, and anything that needs pgvector similarity at scale. The `approve all` e2e test needs no model because the approval handler answers before any model call.

## Run on your Mac (OrbStack)

One command does everything CI does, with a throwaway database on 127.0.0.1:55432:

    scripts/ci/e2e-local.sh

It starts `pgvector/pgvector:pg16` in Docker, applies all migrations, seeds, runs unit tests, builds, installs the Playwright Chromium browser and runs the suite. It removes the container at the end (`--keep-db` keeps it).

### Step by step

1. Database. Either Docker:

       docker run -d --name whink-e2e-pg -p 127.0.0.1:55432:5432 -e POSTGRES_USER=whink -e POSTGRES_PASSWORD=local_e2e_only -e POSTGRES_DB=whink_e2e_test pgvector/pgvector:pg16

   or Homebrew: `brew install postgresql@16 pgvector`, `brew services start postgresql@16`, then `createdb whink_e2e_test`. The database name must contain `test`, `e2e`, `ci` or `scratch`; the e2e seed refuses anything else.
2. Environment (these are dummy values, not credentials):

       export DATABASE_URL=postgresql://whink:local_e2e_only@127.0.0.1:55432/whink_e2e_test
       export DIRECT_URL=$DATABASE_URL
       export AUTH_SECRET=local-e2e-dummy-secret-not-real-0123456789 NEXTAUTH_SECRET=$AUTH_SECRET
       export AUTH_URL=http://127.0.0.1:3100 NEXTAUTH_URL=http://127.0.0.1:3100
       export WHINK_OWNER_EMAILS=e2e-owner@example.test

3. `pnpm install`, then `pnpm --filter app exec prisma generate`, `pnpm --filter app exec prisma migrate deploy`, `pnpm --filter app exec prisma db seed`.
4. `pnpm --filter app build` (the e2e suite tests the production build, so `/dev-preview` is genuinely dead there).
5. `cd e2e && npm ci && npx playwright install chromium && npx playwright test`. Useful: `--headed`, `--ui`, `npx playwright show-report`.

Never point `DATABASE_URL` at your real WHINK database. `prisma migrate deploy` and the seeds write to it.

## CI

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main` and `claude/**`: install, prisma generate, typecheck, lint, `migrate deploy` against a `pgvector/pgvector:pg16` service container, seed, unit tests, build, Playwright. Failure screenshots, traces and the HTML report are uploaded as the `e2e-report` artifact. Actions are pinned by commit SHA. The workflow has `contents: read` only and uses dummy secrets set in `env`.

## Test users

`e2e-owner@example.test` (listed in `WHINK_OWNER_EMAILS`) and `e2e-user-b@example.test`, created by `apps/web/scripts/e2e-seed.ts`. The password defaults to a test-only value in that script; override with `E2E_PASSWORD`. These accounts only exist in the throwaway database.

## Playwright stays out of the app

`e2e/` is its own package, outside the pnpm workspace. See docs/decisions.md, 2026-10-26, for the CLAUDE.md D9 interpretation that needs Victor's OK.
