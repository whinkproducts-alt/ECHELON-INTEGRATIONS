# ECHELON-CORP

ECHELON is the Founder-directed AI organization for WHINK Group. The Next.js application, database schema, workers and services are in this repository; imported KAMSI-PRIME / WHINK Ultimate names remain in source and history.

**Updated 2026-11-04: code is consolidated on `main`; full personal use is not yet accepted.** Baseline inspected: `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. At that revision GitHub CI passed typecheck, lint, database migrations, 2,345 tests (39 skipped), production build and 22 browser tests; configured security jobs passed. These do not prove live providers, full spend control or Mac-off operation.

## Start here

- **[End-to-end coding completion plan](docs/product/ECHELON-END-TO-END-COMPLETION-PLAN.md)** — remaining architecture, implementation order, contracts and acceptance.
- [Reconciliation evidence](docs/reconciliation/2026-11-04.md) · [Harness explained](docs/ENGINEERING-HARNESS.md) · [Current handoff](HANDOFF-NOTES.md).

- **[Current audit handoff](docs/ECHELON-AUDIT-HANDOFF-2026-11-04.md)** — verified work, exact revisions/checks, source/test map, limitations and four independent audit lanes.
- **[Pending work](docs/pending-tasks.md)** — current engineering order and specific Founder inputs.
- **[Readiness acceptance register](docs/ECHELON-READINESS-EXECUTION.md)** — R01–R10, what is implemented and what must still pass.
- [Token and spend priority](docs/TOKEN-AND-SPEND-PRIORITY.md) · [Service inventory](docs/SERVICE-INVENTORY.md) · [Personal launch checklist](docs/LAUNCH-CHECKLIST.md).
- [Local setup](SETUP.md) · [Testing and mock boundaries](docs/testing.md) · [Security](docs/security.md).
- [Functional architecture](docs/product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md) — build target, not proof of completion.
- [Capability Gateway](docs/CAPABILITY-GATEWAY.md) · [Restricted GitHub pilot](docs/GITHUB-GATEWAY-HANDOFF.md).
- `CLAUDE.md` and applicable `AGENTS.md` — mandatory engineering rules. [Canonical entry point](ECHELON-START-HERE.md) retains Founder goals.

Dated daily syncs/assessments and imported handoffs preserve history. Use the current audit handoff and owning code for today's status. Do not repeat source import, replay merged pilot commits or blindly recreate reported GitHub keys/App. The large master blueprint in `docs/` is an archive and is unchanged by this documentation update.

## Local development

Use Node 22 and pnpm 10.28.0 to match CI, a Docker-compatible runtime for PostgreSQL + pgvector, and an already installed Ollama model for local inference. Do not install optional speech services or download models just to read/audit the source.

```sh
git clone https://github.com/whinkproducts-alt/ECHELON-CORP.git
cd ECHELON-CORP
pnpm install --frozen-lockfile
```

Follow [SETUP.md](SETUP.md) for private environment configuration, safe migration, owner setup and separate worker startup. Never overwrite an existing `.env`/`.env.local` or reset a personal database to follow an example.

```sh
docker compose up -d postgres
pnpm --filter app exec prisma generate
pnpm --filter app exec prisma migrate status
# After checking the target database and taking a backup:
pnpm --filter app exec prisma migrate deploy
pnpm dev
```

Development binds loopback; open the configured origin (normally `http://localhost:3000`). The web process does not start the worker. A desktop ECHELON.app/icon launcher is **pending**; `docs/whink-worker.plist.example` is only a worker configuration example.

## What remains

Universal spend admission, real ordered model fallback, durable sealed-team isolation, full in-flight lockdown assurance, iMessage and two-way phone/voice, live owner/GitHub/channel acceptance, daily briefing/avatar acceptance, desktop startup/backup/restore, organizational lifecycle and Mac-off runtime. Full personal use includes these requirements; it is not reduced to a desktop shortcut or text-only pilot.

No paid service, deployment, external send or private-data export is authorized by these instructions. Verify existing approvals and actual entitlements before any live operation.
