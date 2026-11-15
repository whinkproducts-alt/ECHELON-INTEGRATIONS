> **Status update 2026-11-15:** Superseded in part: Marcus tasks are now executed (the largest gap listed below), the proxy exemption is recorded in decisions.md (it still needs a security-reviewer pass), and the flow was verified over real HTTP with Marcus's own client. See `HANDOFF-MARCUS-EXECUTOR.md` and `../daily-syncs/2026-11-15.md`.

# Group B handoff — Marcus workflow contract, worker repair

Branch: `feature/executive-experience`. Group A is commit `ff9f4e6`. Group B is the commit after it. Nothing pushed.

## Reality found (differs from the Group B brief)

- **No `listener.ts`, no `NOTIFY`/`pg_notify` anywhere in this repo.** The audit's pg_notify bug was about a package that is not in this repo. Nothing to fix.
- **An SSE feed already existed** (`app/api/integrations/events`), ledger-backed with `Last-Event-ID` replay. I extracted its stream loop into `lib/events/sse.ts` and reused it; that route behaves as before.
- **Marcus's real client contract** (`/Developer/marcus-vale/backend/services/echelon_client.py`, `echelon_events.py`) is what ECHELON must satisfy. It needs six endpoints and an SSE feed whose event data is `{task_id, status}`. ECHELON had three. Group A's `/events` returned JSON and required `task_id`, so Marcus's stream would have got a 400.
- **The worker was broken on this branch.** Commit `c4ab37b` replaced `lib/worker/roster.ts` with a stripped file (no `getRoster`, `RosterEntry` lost fields). That caused 24 test failures and ~26 type errors. `6e85524` later removed the envelope but never restored the roster.
- **The login wall and CSRF check blocked every Marcus call.** `proxy.ts` redirects unauthenticated requests to `/login`, and CSRF rejects POSTs with no `Origin`/`Sec-Fetch-Site` (Marcus's Python client sends neither). Group A's routes were unreachable by Marcus.

## Shipped

| Area | Change |
|---|---|
| Worker repair | `lib/worker/roster.ts` restored from `77c4b83`. `monthly_budget_report` added to `JOB_TYPES`, to `SYSTEM_JOBS` (`every 1d`; the report dedupes per UTC month so it is a no-op except the first run of a month) and to `jobs/index.ts`. The cron string the broken commit used does not parse in this scheduler. `worker-scheduler.test.ts` counts updated (24 to 25 desired jobs, three system jobs). |
| Marcus endpoints | New: `GET /tasks/{id}`, `POST /tasks/{id}/confirm`, `POST /tasks/{id}/resume`. `/events` is now a true SSE stream of `{task_id, status, at}` with `Last-Event-ID` resume. Logic in `lib/marcus/tasks.ts` and `lib/marcus/feed.ts`. |
| Intake | Refuses with 503 during the existing global account lockdown (`lib/safety/lockdown`), in addition to the Marcus freeze. No second kill switch was built. |
| `proxy.ts` | Exact-match allowlist for the seven Marcus paths skips the login wall and CSRF. **Needs your review** (see below). |
| Tests | `marcus-integration.test.ts`: 22 tests (fake DB, real hashing/auth/SSE). `proxy-public-paths.test.ts`: new case covering the allowlist and the paths that must stay walled. |

## Verified

- `vitest` on Marcus, proxy, csrf, worker, roster files: all pass. Worker/roster failures went from 24 to 0.
- `tsc --noEmit`: 12 errors (was 38). None in files I touched. Remaining are in `app/executive/*`, `lib/ideas.ts`, `lib/notifications/deliver.ts`, `spend-cap-25.test.ts`, `monthly-budget-report.test.ts`.
- `eslint` clean on everything touched.
- Live dev server (webpack): unauthenticated and bad-token calls to the Marcus routes now get the route's own 401 (`Missing bearer token` / `Invalid bearer token`); `/api/integrations/providers` still redirects to login.
- Full suite varies run to run (5 to 9 failures in `gesture-latency`, `workspace-*`, `gateway-chat`, `tool-loop-providers`). They pass in isolation except two timing tests. Machine load average was ~190 during the runs. Treat as load flakiness, but re-run on a quiet machine.

## Needs your decision

1. **`proxy.ts` exemption.** The seven Marcus paths now skip the session wall and CSRF, relying on the route's bearer check. CSRF protects ambient cookies and these routes never read cookies, so I judged this safe, but it is a security boundary change and should get the security-reviewer pass. The allowlist is an exact regex, no prefix match.
2. **What Marcus's second "yes" means.** `confirm` moves a financial/proprietary task from `reconfirmation_required` to `received` and records a Class C approval row. It does **not** authorize any money or proprietary action: anything the task later does still goes through `checkPermission`, which keeps those behind ECHELON's own approval (rule 10). Confirm that is the behaviour you want.

## Not done

- **Marcus tasks are still recorded, not executed.** This is the largest remaining gap and blocks "voice to result". The worker has no `marcus:` handler, so tasks sit at `received`. The existing `ear:` path (`worker/ear-execution.ts`) needs an `AgentExecution` created from an EAR approval; mapping Marcus tasks onto it is a design decision, not a quick edit.
- **Moving Marcus's Python scheduler into the ECHELON worker: skipped on purpose.** The briefings are spoken by Marcus's own voice stack and stored in Marcus's DB; moving the trigger would split the schedule from the thing that delivers it.
- **Mission read model and `docs/receipt.md`: skipped.** No Marcus task produces a receipt yet (nothing executes), so a receipt doc would describe fields that do not exist. Build both when the executor lands.
- **No real Postgres or real Marcus-to-ECHELON run.** Tests use a fake DB. Next check: point Marcus's `ECHELON_BASE_URL` at a dev server with a migrated DB and `MARCUS_BEARER_TOKEN_HASH`, `WHINK_OWNER_EMAILS`, `AUTH_SECRET` set, and run one task through hand-off, confirm and the event stream.
- **`pnpm build` not run.**
- **Monthly report email is inert.** `lib/notifications/deliver.ts` imports `deliverEmail`, which `lib/comms/delivery.ts` does not export. The call is wrapped in try/catch, so the in-app recommendation still works and nothing crashes. I did not export it: that would open an unapproved outbound send path from a worker job.
- Freeze flag is still the sentinel `AgentJob` row from Group A (marked `shortcut:`).
