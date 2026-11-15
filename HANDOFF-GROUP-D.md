> **Status update 2026-11-15:** The listed open item "Marcus task executor" is done and verified over real HTTP with a real model. See `HANDOFF-MARCUS-EXECUTOR.md` and `docs/daily-syncs/2026-11-15.md`.

# Group D handoff — autonomy: grants, local-only, dispatch

Not pushed.

## Result: the Group D deliverables were already built; the audit findings described a different draft package

The Group D brief was written from `ECHELON_CODE_AUDIT_REPORT.txt`, which reviewed an external "Complete Code Package" that was never committed. Checked against this repo's real code:

| Brief item | Reality in this repo | Evidence |
|---|---|---|
| Grant bound to agent, tool, mission, scopes (audit C-1) | Done. `lib/capability/policy.ts` matches owner, tool, revoked, expiry, invocation cap, subject (agent or team), mission plan and scopes, and ignores expired grants. | `capability-policy.test.ts`: agent B with A's grant denied; expired listed first still picks the valid one; team, mission and scope cases. Passes. |
| Tool identity / tool hijack (audit C-3) | Done. Tools are namespaced per provider id; discovery refuses to move a tool between providers. | `capability-gateway.integration.test.ts` hijack test. Passes on real Postgres. |
| METERED cost bypass (audit N-1) | Done. Any cost class other than `FREE` is blocked in the policy gate. | `it.each(['UNKNOWN','METERED','CLOUD_BILLABLE',...])` blocked. Passes. |
| At-most-once dispatch under interruption | Done. An interrupted dispatch is reported `UNKNOWN` after its lease expires and is never reclaimed; a provider timeout is `UNKNOWN` and not replayed. | `capability-worker.integration.test.ts`. Passes on real Postgres. Note: it simulates lease expiry, not a literal SIGKILL of the worker process. |
| Local-only enforcement | Present in 12 modules (`lib/local-only.ts`, model router, tool registry, gateway chat, comms, speech and others). There is no single `assertExecutionPolicy()` function, so "every call site is covered" is not proven by one check. | Not audited call-site by call-site. |
| Model fallback chain | `lib/model-router/ordered-dispatch.ts` and priority modules exist. `docs/testing.md` states fixtures do not establish live ordered failover. | Not exercised live. |
| Secret drop before memory, MAMBA hypotheses only | Covered by `auto-memory.test.ts` and `memory-engine*.test.ts`. | Pass (unit, mocked DB). |

So Group D needed verification, not code.

## Verified for real (disposable Postgres, then removed)

I started a throwaway `pgvector/pgvector:pg16` container on port 55433 (database `echelon_test`, your personal databases on 5432 and 5433 untouched), applied all repo migrations (all succeeded, including `retire_budget_envelope`), and ran the real-database suites with `M1_EXECUTION_DATABASE_URL`:

- `capability-gateway.integration`, `capability-worker.integration`, `dispatch-admission.integration`: **53 passed**.
- New `marcus.integration.test.ts`: **8 passed** (see below).
- Container removed afterwards.

## A real bug this found in my Group A and B code (already on `main`)

Marcus ledger rows set `Action.capabilityId` to the task id. `capabilityId` is a foreign key to `Tool.id`, so on a real database **every Marcus intake, freeze, confirm and resume would have thrown a foreign-key error (HTTP 500)**. The fake-database tests could not see this. Fixed: the task id now travels in `correlationId` as `marcus-task:<id>`, and the event feed reads it from there. **`main` still contains the broken version until this fix is pushed.**

New `lib/__tests__/marcus.integration.test.ts` (real Postgres, opt-in) covers: standard intake with its approval, sealed scope and ledger row; the worker never claims a Marcus job; replayed approval id gets 409 from the real unique violation and rolls back; idempotent `client_operation_id`; financial task then confirm; ten concurrent consumers of one approval, exactly one allowed; freeze blocks intake and unfreeze reopens it, with the feed reporting `received, frozen, received`; feed cursor resumes with no repeats; real account lockdown refuses intake and release reopens it.

## Gates on final code

- Unit: 2441 passed, 0 failed, 120 skipped (the DB-gated suites). Earlier 5 to 9 failures were machine load; none reproduced once load dropped.
- `tsc --noEmit`: 12 errors, none in files touched in A, B, C or D (they are in `app/executive/*`, `lib/ideas.ts`, `lib/notifications/deliver.ts`, `spend-cap-25.test.ts`, `monthly-budget-report.test.ts`).
- `eslint` clean on touched files. `pnpm build` not run.

## Still open

- A single enforced `assertExecutionPolicy()` for local-only mode, and a call-site audit of the 12 modules, if you want a proof rather than a spread of checks.
- Live ordered model failover, and a literal worker-kill chaos test.
- The Marcus task executor (tasks are recorded, not run).
