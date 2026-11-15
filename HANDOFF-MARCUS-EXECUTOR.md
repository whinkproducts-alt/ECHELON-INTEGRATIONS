# Marcus task executor handoff

Committed locally, not pushed.

## What it does

A Marcus task now runs. The Marcus job drives the existing internal-analysis (EAR) executor and mirrors its state back, so there is no second runner.

1. **Intake** stores the task text encrypted (`capabilityRequestEnc`) and queues the job now (a task awaiting its second approval stays parked).
2. **Admission** (`lib/marcus/executor.ts`, dispatched from `lib/worker/runner.ts` for `marcus:` jobs): verifies the text against the approved hash, checks a local model route and budget exist, builds the team through the org-kit router, consumes the Marcus approval exactly once (atomic update), creates an EAR approval row and admits it with `enqueueApprovedEar`, registers an `EXECUTION` sealed scope, erases the stored text, and sets the job `in_progress`.
3. **Analysis** is done by the existing `runEarJob`: local model only, no tools, up to 5 agents, bounded, retried up to 3 times, with budget and cancellation checks.
4. **Polling** (every 5 s) maps the execution to the Marcus status: `SUCCEEDED` is `done`, `FAILED` is `failed`, `BLOCKED_POLICY` or `BLOCKED_COST` is `blocked`, `CANCELLED` is `cancelled`. Marcus's SSE feed carries `received`, `in_progress`, `done`, `failed`, `blocked`, `cancelled`.
5. **`GET /tasks/{id}`** returns `result` (agent outputs, capped, marked `untrusted: true`) once the task is `done`.

Provenance: the ledger row `capability_marcus_task_started` records the Marcus approval id, the EAR approval id and the execution id. The EAR approval row is created by the executor on the strength of Victor's Marcus approval; it is not a card decision by the owner.

## Behaviours worth knowing

- **Blocked, not failed, when it cannot run yet**: no local model, hard budget, or no specialist available. The approval is not consumed and the text is kept, so `resume` re-runs it.
- **Resume only works before analysis started** (`capabilityReceiptId` null). A task whose analysis already ran and was blocked cannot resume because its approval is used; submit it again.
- **Freeze** cancels a running analysis and parks the job. **Unfreeze** re-queues a task that never started; a task that had started becomes `cancelled` (its approval is used).
- **Financial and proprietary tasks** run after their second approval, as internal analysis only. Any task whose objective trips the protected-action classifier is refused at admission (`admittedAgents`). Anything beyond analysis still goes through `checkPermission`.
- **Fails closed**: no `ENCRYPTION_KEY` means intake returns 503 and stores nothing.
- Tasks that name none of the router's keywords use the fallback skill `quality_review` and still get a team (tested).

## Verified

Real Postgres (disposable container, removed afterwards; personal databases untouched), only the model stubbed:
- `marcus.integration.test.ts`: 15 passed. Covers end to end intake, admission, EAR worker, `done` with result and approval used once; the event feed order `received, in_progress, done`; blocked without a model then resume; financial then confirm then run; freeze cancelling a running analysis and unfreeze marking it cancelled; unfreeze re-queueing a task that never started; content altered after approval refused before anything is consumed; the fallback skill.
- Re-ran with the other real-database suites in parallel (ear, capability worker, capability gateway, dispatch admission): 103 passed, twice.
- Unit: 2442 passed, 0 failed, 126 skipped (DB-gated). `tsc`: 12 errors, none in touched files. `eslint` clean.

## Verified later (2026-11-15)

- **Real model and real HTTP, nothing mocked:** `scripts/marcus-e2e.py` drove Marcus's own client against a production build of ECHELON, the real worker and local Ollama (`wink-qwen3.5-9b-8k`), on a throwaway Postgres. Accepted, idempotent replay, admission in about 4 s, `done` in about 49 s with an untrusted result, second approval once (a repeat refused 409), freeze blocking intake (503), tampered hash refused (400), and Marcus's own SSE parser saw `received, in_progress, done` with no errors. Web and worker logs had no errors.
- **Injection guard:** the gap found in the first version (a hostile reply reported `done`) was a pattern that missed "ignore all previous instructions". Fixed with a qualified pattern and tests that also check ordinary sentences are not flagged. The result is still returned marked untrusted and capped; Marcus must treat it as data.
- **Build:** `next build` succeeds; `tsc` 0 errors; lint 0 errors.

## Still open

- Owner Mac with a real account, and the executive screens in a browser: not done.
- Admission consumes the approval before the execution is queued. A crash in that window ends the task `failed` (resubmit). Chosen over the opposite order, which could run a task twice.
- A task only reasons over its own text (no tools, memory or web), so "summarise my roadmap" correctly gets a refusal. Context attachment is a decision for Victor.
- The worker must be running for tasks to execute.
