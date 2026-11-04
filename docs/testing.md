# ECHELON testing and evidence boundaries

Updated **2026-11-04**. Exact baseline, run URLs and conclusions are in [the audit handoff](ECHELON-AUDIT-HANDOFF-2026-11-04.md) and [evidence.json](audits/2026-11-04/evidence.json). Current verified main code: `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`.

## Recorded current-main results

CI [41574973163](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574973163) passed full heavy steps: frozen install, Prisma client, typecheck, lint, checked-in migrations and seed on PostgreSQL 16 + pgvector, Vitest, default production build and Chromium E2E. **158 files passed; 2345 tests passed, 39 skipped; 22 browser tests passed.** This result was fetched from GitHub logs, not rerun locally during documentation reconciliation.

| Skipped test file (under `apps/web/lib/__tests__/`) | Count | Boundary |
|---|---:|---|
| `social.integration.test.ts` | 30 | Runtime DB/table probe catches errors and skips. No passing social SQL coverage follows from this run. |
| `approvals.integration.test.ts` | 6 | Same DB-probe skip behavior; other approval tests/E2E do not make these six passed. |
| `evaluations-tenant-isolation.test.ts` | 2 | Same DB-probe boundary. |
| `model-router.test.ts` | 1 | Real Ollama round trip requires explicit `OLLAMA_INTEGRATION_MODEL`; absent in this run. |

The shared Prisma mock is a known reason DB-probed suites can skip even with a real DB service. Source inspection and earlier notes support investigating it; this documentation pass did not unmock/rerun those suites or certify them. Do not disable assertions, remove consent requirements or relabel skips to obtain a green number. The EAR real-DB suite instead requires an explicit test DB and fails on missing migrations when enabled.

## Test layers and mocks

| Layer | Source / setup | What it establishes |
|---|---|---|
| Unit/routes and pure helpers | Vitest includes `lib/__tests__/**/*.test.ts`; global `setup/prisma-mock.ts` and `setup/lockdown-mock.ts` | Default DB and safety are test doubles; many provider/model transports are mocked. Logic/negative cases only, not SQL or live safety/provider success. |
| Explicit real-DB suites | EAR/capability/worker/readiness and dedicated lockdown suites unmock appropriate modules; examine each file | Their actual SQL/MCP/local socket scope only. EAR requires `M1_EXECUTION_DATABASE_URL == DATABASE_URL` pointing to a test DB. Do not assume every file with `integration` in its name ran SQL. |
| Migration/seed | `.github/workflows/ci.yml` uses a fresh pgvector Postgres | Fresh-schema install, not personal DB upgrade/restore or migration rollback. |
| Chromium E2E | `e2e/`, built app and real test DB | Login/authorization, approvals, projects, board roster, Integration Hub lifecycle/events and public hardening. No funded providers or full real-model mission. |
| Opt-in local Ollama | `model-router.test.ts`, `OLLAMA_INTEGRATION_MODEL` and loopback endpoint | Actual installed-model round trip when explicitly run; not current CI coverage or a model-quality benchmark. |
| NVIDIA evaluator | `lib/model-router/nvidia-trial.ts`, `scripts/evaluate-nvidia-trial.ts` | Explicit synthetic development evaluation only. Do not enable automatically or send repository/private data. Historical trial note is not production admission. |
| Manual/physical acceptance | `ECHELON-READINESS-EXECUTION.md`, `LAUNCH-CHECKLIST.md` | Founder Mac, providers, real recipients, hearing/speaking, briefing/avatar appearance, desktop launcher, backup restore and Mac-off gates. Still open. |

The common unlocked safety mock is not enforcement evidence. Dedicated lockdown tests must use the real module; require cross-process/mid-flight cases for a complete safety claim. Model fixtures, registry eligibility and `runWithFallback` tests do not establish live ordered failover.

## Reproduce with isolated data

Use Node 22 / pnpm 10.28.0 to match CI. From the repo root:

```sh
pnpm install --frozen-lockfile
pnpm --filter app exec prisma generate
pnpm --filter app typecheck
pnpm --filter app lint
# Focused deterministic tests; still subject to the setup mocks:
pnpm --filter app exec vitest run lib/__tests__/context-budget.test.ts lib/__tests__/context-engine.test.ts lib/__tests__/project-ownership.test.ts lib/__tests__/model-priority.test.ts
```

For migration/SQL tests, create a **disposable** PostgreSQL + pgvector test database; set `DATABASE_URL`/`DIRECT_URL` to it, then run `prisma migrate deploy`. Enable EAR integration with `M1_EXECUTION_DATABASE_URL` set to that exact URL. Never expose a personal DB URL or run cleanup/seed against personal data. Dedicated real-DB suites create/delete fixture users; read their guards first.

`scripts/ci/e2e-local.sh` creates and removes the fixed local test container `whink-e2e-pg`, normally on 55432, installs dependencies, migrates/seeds, runs tests/build and Chromium. Inspect it before running; it removes a preexisting container with that name and does not set the M1 opt-in flag itself. CI's unit step explicitly sets `M1_EXECUTION_DATABASE_URL="$DATABASE_URL"`; reproduce that boundary when claiming the same coverage.

E2E setup: `e2e/` is a separate package using `npm ci`; the application workspace uses pnpm. `e2e-owner@example.test` and `e2e-user-b@example.test` are throwaway fixture users, not personal accounts. Provider calls remain unconfigured/mocked where specified; no live send should be needed for automated checks.

## CI and security semantics

CI triggers on PRs and main pushes. Docs-only PRs (`docs/` or root `*.md`, including rename old paths) deliberately skip heavy steps; main pushes still run them. A green docs-only check is not a fresh application test. Concurrency may cancel earlier main runs; cite the run and exact revision, not just the latest green badge.

Security [41574973158](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574973158) passed its configured production audit (high/critical gate), full-history gitleaks with allow-list, and CodeQL analysis. `upload: never`; SARIF artifact retention 14 days, E2E artifact retention 7 days. A passing workflow does not mean zero findings, complete license review or independent security certification. Report expirations and uninspected artifacts honestly.

For staged secret checks: `pnpm --filter app security:scan`; `-- --all` scans tracked files. Never weaken a scanner to land a change or print secret files to demonstrate configuration.

## Record every result honestly

Record exact SHA, command, DB/mock/provider scope, passed/failed/skipped counts, environment gates, independent reviewer and unresolved issues. Mark tests not run as not run. Code changes need focused meaningful tests and required CI; docs-only updates need link/path/scope/secret validation and must not claim a fresh full-suite pass.
