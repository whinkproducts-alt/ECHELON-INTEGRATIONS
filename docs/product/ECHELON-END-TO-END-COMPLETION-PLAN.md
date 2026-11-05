# ECHELON end-to-end personal-instance completion architecture

**Updated:** 2026-11-04. **Execution contract:** the next coding agent implements and verifies this plan in bounded changes; it must not respond by only rewriting another plan. Preserve the existing architecture and current source. No calendar estimates. Target is the full personal instance, not a launcher or a reduced text-only demo.

## 1. Baseline, scope and source of truth

Starting published revision: `a515159fb2581c773c546405cf44249a4753f945`; CI [41893586859](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41893586859) and security [41893586660](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41893586660) succeeded. Merged [PR #25](https://github.com/whinkproducts-alt/ECHELON-CORP/pull/25) incorporates the valid source-provenance correction and reviewed approval/logging remediation (2348 tests passed, 39 skipped, 22 browser passed); see [reconciliation record](../reconciliation/2026-11-04.md) for the final change/PR proof. The architecture below is **remaining work**, not a claim those capabilities are finished.

Read `CLAUDE.md`, applicable `AGENTS.md`, [current audit handoff](../ECHELON-AUDIT-HANDOFF-2026-11-04.md), [backlog](../pending-tasks.md), [R01–R10 gates](../ECHELON-READINESS-EXECUTION.md) and the relevant source. [Harness inventory](../ENGINEERING-HARNESS.md) distinguishes coding, application and testing tools. Do not replay import or merge stale handoff instructions.

Full personal scope: owner account and durable useful missions; WHINK/MAMBA and canonical organization; first/second/third model preferences with real failover; token/spend control; all requested channels and two-way hearing/speaking; Founder-private team; lockdown; daily Board Room motion/voice briefing and preserved avatar motion; desktop double-click/restart; backups and restore. **Mac-on first is the accepted operating milestone; actual Mac-off independence remains mandatory afterward.** All required capabilities must have truthful pass/fail/unavailable evidence. An unavailable required channel remains an open gate.

## 2. Architecture to retain

The current flow is extended rather than replaced:

1. Authenticated UI/voice submits a task or chat request; server derives owner/account/canonical agent and declared scope.
2. Shared policy evaluates data scope, lockdown epoch, model/tool capability, owner approvals, Local-Only and budget/entitlement before transport.
3. Existing Postgres job/approval/attempt records capture intent and admission. No network call occurs inside a database lock transaction.
4. Existing worker claims a durable lease; immediately before I/O it revalidates current scope, epoch, grant/approval, model admission and reservation.
5. The existing model router and tool loop or capability/channel adapter executes a bounded attempt. Untrusted results stay bounded, scanned/wrapped and attributed.
6. Durable receipt/usage/terminal state is committed with ownership checks. Lost/uncertain side effects never silently retry. HOLO, briefing and notifications project actual persisted state.

Postgres/Prisma remains authoritative; pgvector remains the recall path; `packages/org-kit` remains the identity registry. No second queue, SQLite authority, new orchestration framework or 326 concurrent model instances. Keep provider credentials in existing encrypted/private storage and reuse protected-action approvals and the central ledger.

## 3. Shared contracts to implement

The following are **proposed interfaces**, not APIs already present. Reconcile with owning types before adding tables/files.

### 3.1 Authenticated dispatch context

Create one internal dispatch entry point under `apps/web/lib/model-router/` with a server-constructed context containing `userId`, correlation/task/job IDs, purpose, canonical subject, data scope/class, permitted local/remote policy, current safety epoch, owner approval reference if required, and cancellation/deadline. The client/provider cannot supply or widen authority. Current persistence uses `userId`; do not introduce an unrelated account identifier or infer a tenant from a request body.

Every text/tool/background/embedding/voice caller must carry this context. Inventory `streamChat`, `chatOnce`, `chatWithTools`, `embed`, direct STT/TTS and wrapper calls first. An optional missing ID must not silently select a server-funded default. Keep transport adaptation behind the current routers; add speech accounting around its existing transports.

### 3.2 Admission and accounting

Reuse `UsageEvent` where it can express the lifecycle; add a dedicated attempt relation only when schema review proves necessary. Need an account-scoped unique attempt key, purpose/model/provider, state, price/entitlement snapshot, reserved token and monetary units, actual/provider versus estimated usage, result/uncertainty and settlement identity. Store units consistently (micro currency amounts with explicit currency; avoid integer overflow and floating-point budget arithmetic).

Within a short transaction, lock the existing user/account budget row, sum participating settled usage plus holds for the period, apply configured hard limits and approve a conservative bound or refuse. **Unknown price is not zero; an API key is not spend permission; an unset/zero cap must not accidentally enable paid access.** Paid admission remains off until the Founder approves the actual policy/action. Do not create standing approval for protected money/proprietary actions. If approval semantics for metered model billing are unclear, keep it blocked and ask a concrete policy question.

Network dispatch follows commit of the reservation. Settle the same account/model attempt once from provider usage when available; otherwise label the estimate. Lost response, timeout, crash or cancellation retains a conservative hold until reconciliation proves release safe. Define month-boundary behavior so a crash cannot erase outstanding liability. Reconciliation is idempotent, auditable and never retries the external action. Existing local EAR byte holds remain explicitly different from provider token or dollar guarantees until migrated safely.

### 3.3 Safety and sealed scope

`AccountSafetyState` remains the persisted epoch/source. Recheck it at admission, claim and final dispatch; broadcast authenticated changes to clients and cancel supported transports. Capture resources and background jobs must also obey it. DB/cache errors fail closed. Define a cutoff explicitly; already-sent operations cannot be undone and stay started/unknown until real receipts resolve them.

Persist Founder-private objectives/results and memory with a server-enforced scope relation. Prefer extending task/execution ownership rather than a separate ungoverned agent subsystem. Scope checks cover list/detail/mutation, worker context, recall/vector search, briefing, SSE, exports/logs and handoff. Other accounts and ordinary WHINK/MAMBA/organization contexts cannot retrieve sealed content. A `founder` client prop, persona switch or text marker grants nothing. Privacy for sealed identities must match the Founder register; do not keep a public view-only specialist screen while claiming it is sealed.

### 3.4 Receipts, output and replay

Use the current central ledger plus execution/usage receipts; never add direct action writes elsewhere. Record counts, hashes, IDs, source/model/usage basis and fixed error categories, not private prompts/credentials or provider-controlled error fields. Approval consumption and dispatch are distinct transitions. A failed terminal compare-and-set derives its public outcome from a re-read of the persisted winner (using the existing ALREADY_DECIDED/EXPIRED/NOT_FOUND API); it cannot write a contradictory success ledger row. Preserve the current stuck sweep until a reviewed lease/uncertainty replacement exists.

Automatic model fallback is inference-only until the tool/action boundary is explicit. Once a side effect may have started, do not re-run a conversation/tool loop on another model. Require idempotency at each adapter where supported; otherwise unknown effects need manual resolution. Provider output, browser imports, documents and tool descriptions remain untrusted on every route.

## 4. Ordered implementation work packages

Each package is independently reviewed, tested, documented and merged only with required checks. Code and fixture work proceeds without real paid accounts. The dependency column permits independent configuration/engineering without treating all blockers as Founder-only.

| ID / existing gate | Implement against existing seams | Dependency / proof to close |
|---|---|---|
| C00 / reconciliation | Preserve older dirty checkout/index/history, resolve duplicate docs, move both working copies to current main, carry only valid unique fixes; refresh source provenance and harness/plan pointers. | This change's [reconciliation record](../reconciliation/2026-11-04.md), backup recovery, clean matching source HEADs, no stale handoff merged blindly. |
| C01 / R10 security and service baseline | Triage open dependency alerts by actual installed graph, manifest, runtime/dev reachability, fix availability and license; review obsolete lockfiles before removal. Complete actual active-service inventory with local/free/trial/paid and entitlement/privacy/cap evidence. | No untriaged release-critical path; fix or prove unreachable/disabled with independent evidence. Current green audit is not a reason to dismiss GitHub alerts. No blanket major upgrades. |
| C02 / E01,R04 | Implement authenticated dispatch context and atomic admission/hold/settlement/reconciliation for explicit/default/BYOK chat/tool rounds, then auto-memory/debrief, worker, skills/swarm/refinement, embeddings and voice. Preserve both learning outputs. | Bypass, cross-user, concurrent last capacity, unknown price, failed/cancelled/lost response, DB failure and UTC rollover tests. Actual refusals/usage basis visible. No live paid call needed. |
| C03 / E02,R04 | Wire saved model order to actual inference; unify unset defaults and purpose overrides. Apply data/tool/streaming/trial/spend/local/health policy before each candidate. Manual DeepSeek visibly pauses. NVIDIA trial remains isolated unless separately entitled. | Actual dispatch tests for first/second/third, 401/402/429/timeout/cancel, no eligible model, manual skip, no tool replay. Measure representative task correctness/call count/tokens before changing tiers. |
| C04 / R01 | Establish owner instance in `Documents/ECHELON PROJECT`: reconcile private env precedence, auth/passkey/origin/encryption, local DB/model, separate web/worker and optional speech. Take backup, inspect migration status, test forward migrations on a copy, then apply safely. | Real owner sign-in/passkey/restart, durable task data, worker heartbeat. Never reset/seed personal data or rotate encryption to fix setup. Existing settings remain private. Can proceed alongside C01–C03. |
| C05 / E03,R07 | Persist sealed objectives and execute within existing mission/worker scope. Enforce owner-only retrieval and prevent ordinary persona/agent memory/briefing/event leakage. | Reload/restart and cross-account/persona/query/worker/recall/SSE/export tests with real scope data; no client-only seal. C02 context and C04 instance. |
| C06 / E04,R07 | Finish all-dispatch/in-flight lockdown, cross-process epoch checks, cancelable inference and browser capture/audio shutdown. Preserve read-only local review; controlled resume has new authorization where necessary. | Activate while queue, model stream, approval, tool/channel call and mic/camera active; DB unavailable and reconnect tests. Real safety module unmocked, no newly dispatched I/O after defined cutoff. C02. |
| C07 / E06,R02,R03 | Prove one actual useful mission through persisted task/canonical agent/worker/result/HOLO. Configure the previously reported GitHub App/key/installation securely, fixed repo and main branch, review/grant one report tool, run the live gateway job. Finish interrupted input/result retention. | Real ECHELON job/receipt with commit-pinned sources, denials/expiry/revoke/other-repo/write checks, bounded untrusted output, missing/failing checks truthful. Coding connector access is not this proof. C02,C04,C06. |
| C08 / E05,R06 messages | Retain SMTP/Twilio SMS/WhatsApp/Telegram adapters. Implement required inbound/reply/status correlation, authenticated webhook/polling, dedup/account binding, approval/content checks and UNKNOWN receipt behavior. Select and prototype a secure iMessage bridge on an approved Apple host/account; keep it unavailable until proven. | Each requested channel sends/receives with exact authorized test recipient/content and real receipt; tamper, duplicate, timeout and unconfigured cases. iMessage has no assumed general official API. C02,C04,C06; actual provider/bridge inputs. |
| C09 / E05,R06 hearing/calls | Use verified local STT/TTS first (existing faster-whisper/Kokoro seams), choosing matching provider/voice settings. Complete microphone capture, transcript, spoken reply, barge-in and cleanup. Extend scripted Twilio calls with admitted two-way media/STT→router→TTS, status/hangup and duration limits; provider-specific signatures and replay guards. | Actual two-way hearing/speaking/call, interrupted audio and device error recovery; no action from ambiguous transcript, request-ID voice approvals, separate voice/call cost holds and lockdown. Local process wrapping Deepgram/Bland is still cloud use. C02,C06,C08. |
| C10 / E07,R08 | Accept deterministic task/approval-based Board Room entrance briefing as a designed daily motion/voice sequence. Reuse script/API/modal; prove source cutoff/timezone/unavailable data, seen/replay/skip/mute, safe autoplay and memory cleanup. Preserve portraits/breathing/actual audio mouth feed; blink only with opt-in anchors/motion support. | Real account facts and first-entry/restart/local-day tests; actual audio vs synthetic browser cadence labelled; both avatars visually accepted, reduced motion. If an encoded movie is still required, resolve that media requirement explicitly without inventing a paid video dependency. C04,C06,C09. |
| C11 / E07,R09 | Reconcile canonical 326 identities/163 teams and 15/16 directorates with Founder evidence. Complete needed lifecycle/task assignment, bounded takeover/manager notification and HOLO projection using persisted events. | No invented directorate or simulated task activity; lowest qualified assignment, restart/reconnect/dedup/account isolation and receipt-linked UI. C05,C07. |
| C12 / E08,R01,R10 desktop and recovery | Minimal ECHELON.app/icon around existing web app; repo launcher/runtime manager starts or reuses selected DB/model/web/worker/speech/provider services, health-checks and opens configured loopback origin, owns PIDs and stops gracefully. Add encrypted/private backup, retention and tested restore. | Double click twice, login/reboot, wrong/occupied port, stale PID, missing dependency/model, DB failure, worker crash and stop; no blanket kill/install/migrate/download/reset/spend. Restore to a separate instance and verify encrypted data readable. C04; full personal acceptance requires all feature gates, not just icon success. |
| C13 / E09,R05 remote | Produce portable web/worker/provider manifests with secure bootstrap/TLS/secret delivery, durable DB/backup, liveness, limits/lockdown, monitoring and owner review access from another device. Deploy only to a verified approved available host. | Physical Mac off while remote worker completes authorized task and produces receipt; stale local host refuses, recovery/restore and quota/cost evidence. A free cloud trial is not guaranteed 24/7 production hosting. C02,C06,C07,C12 plus host/privacy/spend decision. |
| C14 / R10 full acceptance | Run the full personal checklist and independent audit lanes. Resolve confirmed high/critical issues, record lower findings with owner/rationale, exact revision, tests/skips/failures, receipts/config/retention and rollback. | All mandatory Mac-on personal features accepted by Founder; Mac-off level separately complete before claiming full independence. No claims from fixtures, badges or a successful launcher alone. |

Shortest dependency path: C00 → C01/C02, with C04 configured independently → C03/C05/C06 → C07/C08/C09 → C10/C11/C12 → Mac-on full personal acceptance. Prepare C13 while local work progresses; only close it with an approved host and real power-off proof. C14 records both levels honestly. Do not expand into public billing or a new framework before these work packages work.

## 5. Concrete source and migration ownership

Reuse first, proposed additions second:

- Inference/accounting: `apps/web/lib/model-router/{context-budget,priority,registry,reservations}.ts`, both routers, `usage.ts`, `budget.ts`, `auto-memory.ts`, `orchestrator.ts`, worker/skills/swarm callers. Proposed `model-router/dispatch.ts` and an account-derived inference context must replace bypasses, not sit beside them unused.
- Private/safety: existing `lib/safety/`, worker/task/execution scope, `app/dashboard/kill-team/page.tsx`, `components/screens/kill-team/kill-team-screen.tsx`, recall/briefing/events. Add schema fields/relations only after current ownership reconciliation; tests must exercise server paths, not disabled UI controls.
- Messaging/voice: `lib/comms/delivery.ts`, comms/contact routes, `/api/voice/{stt,tts}`, `lib/hooks/useVoice.ts`, existing `services/voice`/`services/whink-voice` only if their provider/privacy/cost path is admitted. A proposed channel adapter contract has `send`, inbound normalization, receipt lookup and cancellation where supported; no channel implementation may bypass permission or final dispatch policy.
- Briefing/avatar/HOLO: existing `lib/briefing/daily.ts`, Board Room components, avatar engine/canvas/audio feed, canonical org-kit registry and execution events. Do not replace them with a generic dashboard or label fixtures live.
- Desktop/runtime: proposed `scripts/macos/` launcher/manager, minimal app bundle build instructions and runtime runbook. Installer/signing/distribution for others is a later product concern; no Tauri rewrite required for a local icon.
- DB changes are additive versioned migrations with backfill/upgrade/restore proof on a copy. Unknown-cost migration already loses the historical distinction between unpriced and genuinely free zeros; rollback must not claim to reconstruct it. Preserve the current encryption key securely.

## 6. Token and spend efficiency acceptance

Keep deterministic recall/history bounds; never trim mandatory system/current request or weaken taint/approval. Bound each task's tool rounds/results, output, retries, time and provider attempts. Cache only non-sensitive or correctly scoped versioned deterministic data when correctness/retention permits; never share sealed/tenant context or suppress required learning to claim a saving.

Use identical representative tasks before/after; record source revision, model/endpoint, completion correctness, calls (including sidecars/embedding/voice), provider tokens or labelled estimates, latency and known/unknown cost. A smaller character ceiling is not measured monetary savings. Choose lower-cost models only with adequate task quality. No automatic credit purchase, silent paid escalation or claim of unlimited credits. Coding agents use targeted reads/focused tests and these notes, not repeated whole-repo/chat scans.

## 7. Founder inputs — ask only at the dependent gate

| Decision/input | Required before |
|---|---|
| Existing owner identity, DB/auth/encryption settings and intended local origin, privately configured | C04 live setup; do not recreate already existing secrets |
| Existing GitHub App/install/key location and one-repo read scope | C07; creation/download reported, not proof of installation |
| Channel credentials/entitlements and exact test recipients/content; iMessage Apple-host/account/bridge privacy choice | C08/C09 live acceptance; no tokens in chat |
| Local speech/model availability; cloud data classes/retention/quota/production entitlement if desired | C03/C09; NVIDIA remains isolated until actually admitted |
| Policy for any metered inference and actual spend/action approval | Paid dispatch only; blocked by default while unclear |
| Canonical directorate/board decision; final acceptance of briefing/video interpretation | C10/C11 ambiguity only; no invented roster or media fulfillment |
| Existing suitable remote host or a concrete reviewed host/cost/privacy choice | C13 deployment and physical Mac-off acceptance |

Use concise A/B/C with a recommendation when a real choice is needed. Continue unrelated fixtures/engineering while waiting. No question or this plan itself grants permission for money, private-data sharing, live sends or deployment.

## 8. Verification, merge and handoff protocol

For each change: inspect relevant source → implement smallest correct slice → meaningful negative tests → isolated real DB/socket checks when state/transport changes → built-app E2E when flow/UI changes → independent assurance → required GitHub checks → merge with current authorization. No hidden failures or skip-to-pass edits. Preserve normal tests and security scans; do not remove a guard just to merge a bot fix.

`docs/testing.md` defines mock/real boundaries. Add fail-on-old-code tests for concrete regressions (as done for terminal approval races and provider error-name logging in this reconciliation). Current CI skips are still gaps; explicitly enable/unmock required SQL/model cases in isolated environments rather than treating a service container as coverage. Device/provider/physical acceptance remains separate.

Write exact changed paths/revision, commands/results/skips, migration/config impact, independent reviewer, live evidence boundary, rollback and one next action to daily sync/backlog/execution notes. Preserve older architecture/evidence as dated history. Multiple LLMs audit separate lanes read-only by default; only one builder owns a shared checkout at a time. Publish reviewable isolated changes; never force-push/reset another agent's work.

Rollback: use reviewed revert commits for app changes, preserved Git branches/bundles for local reconstruction, and verified backup/forward repair for schema/data. Never blindly restore an old index over a newer working copy. Full personal readiness is declared only from the named gate evidence, not from finishing this architecture document.
