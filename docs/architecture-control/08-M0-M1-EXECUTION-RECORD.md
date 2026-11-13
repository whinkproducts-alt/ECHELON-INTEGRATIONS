# M0 reconciliation and M1 execution repair — 30 October 2026

Implementation record, not a new architecture proposal or release acceptance.
Current update (12 November 2026, America/Edmonton): the Founder later supplied the missing directorate; its leadership addition is on the unmerged Integrations branch `org/add-ai-autonomous-operations-directorate`. The M0 snapshot below remains unchanged as historical evidence. No agent or team assignment has been made to the new directorate.
Founder authorization: the implementation order in this Codex session, explicitly authorizing M0/M1 on `feat/whink-architecture-control-20261030`, PR #14, base `work`; reinforced by FDR-024..029 and the approved first ticket in `04-IMPLEMENTATION-ROADMAP.md`.

## M0 evidence

- Initial local branch `work`, HEAD `4a6763b2fcd23eae1a9feb4bebb59f465fe83939`, clean tracked/untracked status. Origin `https://github.com/whinkproducts-alt/KAMSI-PRIME.git`.
- Explicitly fetched approved feature and work refs (the checkout's fetch refspec initially covered main only). Implementation baseline `493d948fcb5d9a468c1c951edf2ffef1bce8f01d`; remote `work` and merge base `4192761bd0bb5143da92e363f11b35dba322500d`. PR #14 head matched the approved feature SHA through `git ls-remote origin refs/pull/14/head`.
- Failed automatic tracking setup left fetched documentation staged on the original branch. Creating the named branch at its verified SHA incorporated those exact committed files without discarding work; status was then clean. No worktree, reset, stash, merge or deletion of user work.
- Read architecture-control entry point, all FDRs, baseline/contracts/governance/roadmap/ADRs/traceability and both evidence reports; reconciled repository instructions and targeted source. Audit snapshots remain historical evidence, not live capability proof.
- Baseline `lib/approvals.ts:488` checked EAR permission then called `buildDispatchMessage`; `lib/approval-handler.ts:42` announced TEAM DISPATCHED without persisting any execution. `lib/worker/scheduler.ts:64` already provided database leases and SKIP LOCKED. `lib/swarm/agent-call.ts:50` already built isolated tool-free analytical prompts. HOLO's fixture source was explicit in source but not clearly labeled in the interface.
- Registry verified: 326 agents, 163 teams, 15 directorates. Workforce SHA-256 `41ffcb3933b680784df003fe81e98b1f1b5bccec78e5d79c72141661052df3f8`; team hash is pinned alongside the workforce hash in the real-DB test. Tests compare bytes, counts and canonical identities. No roster, hierarchy, model configuration or Ollama installation changed. The 15/16 discrepancy is unresolved, not repaired by inventing a directorate.
- Conflict resolution: newer explicit FDR approval permits this implementation despite older draft/no-code language. White-label work remains deferred; existing owner isolation remains mandatory. Model selection, paid providers and deployment are not authorized by this change.
- No new dependencies or upstream code imported. Existing WHINK MCP service is retained; installed upstream OpenClaw is not connected or copied. Licensing/security review of any future extraction remains M5.
- Off-device feasibility inventory: this temporary Codex environment is not an approved always-on runtime. No spare-device identity/access/uptime or eligible cloud-store entitlement is supplied here. Costs, privacy region and sustained capacity are unverified; no service is assumed free, purchased or deployed. These are M3 prerequisites, not blockers to the safe M1 seam.

## ADR-M1-001 — bounded implementation of the approved queue seam

No new execution engine: existing `AgentJob` claims dispatch a one-shot `ear:<executionId>` job. An additive `AgentExecution` row holds the lifecycle and result; `ApprovalRequest` remains the authority. Existing analytical prompt/output isolation and the model router are reused. This is the approved first M1 seam, not adoption of the entire proposed SC-01 transport or ADR-P01's system-wide consolidation.

New EARs explicitly request `internal_analysis`: drafts/reasoning only, no tools, memory retrieval/write, external sends or cloud inference. Legacy/unscoped EARs and ineligible/protected assignments fail closed rather than being silently reinterpreted. The approval card explains the scope before approval.

Approval consumption, queue insertion, execution creation and admission audit commit atomically. QUEUED is distinct from CLAIMED, RUNNING, SUCCEEDED, FAILED, CANCELLED, RETRY_SCHEDULED, BLOCKED_POLICY and BLOCKED_COST. Status/result/cancellation are owner-scoped. UI reads persisted state and never turns approval success into task completion. HOLO fixtures are explicitly DEMO.

Decision expiry is still 30 seconds. It limits the human decision and queue admission; a timely consumed activation can execute later with identical scope/hash, as for existing scheduled sends. Worker permission-engine checks run before each inference and before result persistence. A changed/denied/expired/unconsumed approval cannot activate work. No new permission to spend or disclose data follows from task activation.

Canonical approved agents execute sequential bounded analysis, sharing only sanitized outputs from the same task. No compulsory WHINK/MAMBA call, persona authority grant, new identity or registry activation write. Unknown, suspended, retired and Founder-private assignees are rejected. Temporary reassignment/manager notification beyond the exact approved team is not implemented by this slice.

Queue leases carry a generation token; attempt/status/token compare-and-set prevents duplicate invocation and stale writes. Three attempts maximum; only harmless internal inference retries. Whole attempt is bounded below the 10-minute lease. Cancellation persists first, aborts the active HTTP request on polling, fences late output and prevents further scheduling. Transport abort does not prove immediate GPU cancellation by an external daemon. Restart may recompute an uncommitted internal draft; no external side effect is authorized.

Cost admission is deliberately narrow: configured local model unchanged, Ollama endpoint and local-weight metadata required, remote/unknown/cloud models rejected. No generic loopback proxy assumption. Missing route/metadata or hard budget returns BLOCKED_COST. Every attempted inference records conservative estimated token usage; failed calls reserve the output bound, and accounting failure blocks further work instead of retrying. These are local execution protections, not a claim of universal spending enforcement across legacy routes (M2).

## File and requirement traceability

| Requirement | Founder decisions | Files / evidence |
| --- | --- | --- |
| REQ-M1-001 truthful durable admission | FDR-003/021/022/029 | `lib/approvals.ts`, `lib/approval-handler.ts`, `lib/task-gate.ts`, org-kit `src/router.ts`, schema and additive migration, `lib/ledger.ts` |
| REQ-M1-002 governed worker lifecycle/recovery | FDR-003/010/022/026 | `lib/worker/ear-execution.ts`, `lib/worker/runner.ts`, `lib/worker/scheduler.ts`, `lib/permission-engine.ts`, `lib/model-router.ts`, `lib/usage.ts` |
| REQ-M1-003 bounded canonical collaboration/private denial | FDR-002/017/018/024/025/026/028 | `ear-execution.ts`, `ear-execution.integration.test.ts`; roster hashes/counts unchanged |
| REQ-M1-004 truthful receipts and demonstration labels | FDR-013/021/029 | `app/api/executions/[id]/route.ts`, conversation `approval-card.tsx`, `lib/hooks/approval-state.ts`, `components/holo/holo-surface.tsx` |
| REQ-M1-005 repeatable verification | FDR-021/029 | `.github/workflows/ci.yml` enables real-DB suite on existing throwaway CI database; integration/route/approval-state/approval/voice/native-router tests |

Unit confirmation-code tests now mock queue admission at that seam; actual queue persistence is tested separately against PostgreSQL, never represented as live inference. Known private-repository CodeQL availability issue is unchanged; no security checks disabled.

## Verification and limits

Final local regression suite: **141 files passed, 2,038 tests passed, 38 skipped**, including **13 real-PostgreSQL execution tests**. Inference and local-model metadata are mocked in database tests. Transport tests mock HTTP; they prove cancellation propagation and metadata rejection, not a live installed model.

Passed: all checked-in migrations plus additive execution migration against a new isolated test DB; Prisma generation; TypeScript; production build; changed-file ESLint (0 errors, 3 existing warnings); diff whitespace checks. Existing warnings concern HOLO navigation and two unused router lint directives. The first test run exposed a test-cleanup foreign key; corrected only test-owned cleanup. An older voice fixture expected message-only dispatch; replaced its queue dependency with an explicit unit mock and strengthened duplicate-decision assertions. A nullable callback type error was fixed before the final passing build.

Independent assurance: separate read-only agent reviewed code; findings on stale claims, cancellation locking/abort, attempt duration, private labels, accounting failure and local-proxy assumptions were fixed and regression-tested. Final focused source review found no new blockers. Founder acceptance remains outstanding.

Not run/proven: live Ollama generation, real-model behavior, browser E2E, temporary takeover/manager notification, all 326 agents executing, HOLO live event integration, universal spending gate, central cloud memory, off-device/Mac-off operation, model benchmarks, new-task restoration, deployment. Later M2–M8 roadmap remains intact. This is the first tested M1 implementation slice, not whole-build or full-milestone acceptance.

## Operations and rollback

For a separately authorized local use, apply migrations and generate Prisma, start the existing `pnpm --filter app worker`, then approve a new internal-analysis EAR. No worker is deployed/activated by this commit. A configured, locally installed model is required; absent metadata blocks without inference. Receipts poll `/api/executions/<id>`; authenticated JSON POST `{ "action": "cancel" }` cancels work. Approval history remains the admission receipt, not a completion report.

Rollback: stop only the newly used worker before reverting the implementation commit; preserve execution/job/approval/audit records. The migration is additive and no destructive down migration is provided. Reverting code can safely leave the table for investigation. Never replay old approvals or delete organizational/work records to roll back. Merge, production migration and deployment require Founder approval.
