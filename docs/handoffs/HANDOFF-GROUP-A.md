> **Status update 2026-11-15:** Superseded in part: Marcus tasks are now executed, and the Marcus-to-ECHELON flow has been verified over real HTTP and against a real Postgres. The foreign-key bug and the proxy exemption described later are fixed. See `HANDOFF-MARCUS-EXECUTOR.md` and `../daily-syncs/2026-11-15.md`.

# Group A handoff — Marcus intake + dev-server unblock

Branch at time of work: `feature/executive-experience` (not `feat/parallel-A-blockers`). Nothing committed or pushed.

## Reality found (differs from the design docs)

- Marcus intake routes, `requireMarcusAuth`, `checkMarcusApproval` and a 20-test file already existed, pasted from `marcus-integration-build.md`. They had real bugs that mocked tests hid.
- Env var in code is `MARCUS_BEARER_TOKEN_HASH` (not `HOST_MARCUS_VALE_TOKEN_HASH`). It was missing from `.env.example`.
- `ENCRYPTION_KEY` and the gesture secret already have separate placeholders. No change needed.
- `apps/web/lib/browser/` does not exist; browser tools are not started (Group F / later).
- Marcus repo (`/Developer/marcus-vale/backend/services/hashing.py`) already produces the same hash bytes as ECHELON `canonicalJson`. Cross-checked on a unicode sample: match.

## Shipped (all in `apps/web`)

| File | Change |
|---|---|
| `next.config.js` | Server externals now match any `node:` request. Fixes the webpack `UnhandledSchemeError` (`node:child_process` via git.ts and nodemailer, `node:dns/promises` via providers). Verified: `next dev --webpack` compiles `/instrumentation` with no errors. NOTE: outside the original scope lock; it is the root cause. |
| `lib/marcus/intake.ts` | Owner resolved from `WHINK_OWNER_EMAILS` (was hardcoded `'victor-igboekwe'`, which is a FK to a cuid and would fail). Approval stored under the Marcus `approval_id` so a replay really hits 409 (before, replay detection looked up an id that was never written). Stored hash now matches what `checkMarcusApproval` recomputes. Job + approval + sealed scope + ledger row are one transaction. Ledger via `recordAction` (was direct `prisma.action.create`). Input size caps. 503 while frozen. |
| `lib/marcus/freeze.ts` (new) | Owner resolve, freeze flag, freeze/unfreeze through the ledger. |
| `app/api/integrations/marcus/{freeze,unfreeze}/route.ts` | Thin wrappers over `setMarcusFreeze`. Freeze now blocks intake. |
| `app/api/integrations/marcus/events/route.ts` | Only serves `marcus:` jobs (before, any job id leaked its ledger events). |
| `lib/permission-engine.ts` | `checkMarcusApproval` consumes with an atomic `updateMany ... executedAt: null` (was read-then-write, double-spend race). |
| `.env.example` | Added `MARCUS_BEARER_TOKEN_HASH`. |
| `lib/__tests__/marcus-integration.test.ts` | Rewritten: 15 tests on a stateful fake DB with real hashing/auth/owner lookup. Old 20 mocked `approvalContentHash` and Prisma and passed for the wrong reasons. |

## Verified

- `vitest lib/__tests__/marcus-integration.test.ts`: 15 passed.
- Full `vitest run`: 2394 passed, 24 failed, 112 skipped. The same 24 fail with my changes stashed (worker/roster: `getRoster` export missing). Not caused by Group A.
- `tsc --noEmit`: 38 errors with and without my changes; none in touched files.
- `eslint` on touched files: clean.
- Dev server: no webpack errors; Marcus route answers (403 without bearer).

## Not done / not verified

- `pnpm build` (production) not run.
- Not tested against a real Postgres or with a real Marcus request. Tests use a fake DB; run one real POST after setting `MARCUS_BEARER_TOKEN_HASH`, `WHINK_OWNER_EMAILS`, `AUTH_SECRET` and a migrated DB.
- Unauthenticated POST returned 403, code says 401. Something earlier in the stack (proxy or CSRF check) answers first; not investigated. Confirm Marcus's bearer request gets through it.
- Marcus tasks are **recorded, not executed**. The worker has no `marcus:` handler (unknown keys are parked as SKIPPED). I set `nextRunAt` far in the future so the worker leaves their status alone. Execution is Group B.
- `/events` is cursor-polled JSON, not SSE. SSE is Group B.
- Freeze flag is a sentinel `AgentJob` row to avoid a migration (marked `shortcut:` in code). Replace with a table in Group B.
- A reconfirmation approval (`PENDING`, Class C, tool `marcus_task_intake`) will show on Victor's approval list; approving it will not run anything because no executor exists for that tool yet.
- Approvals for standard tasks are `APPROVED` with a 365-day `expiresAt`. Group C should confirm the 30 s TTL sweeper does not touch them.
- Pre-existing breakage on this branch (24 tests, 38 type errors in `lib/worker/*`) blocks a clean `pnpm test` / `pnpm build` until fixed. Needs an owner.
