# ECHELON: current state and independent audit handoff

Updated **2026-11-04** (Founder timezone: America/Edmonton). Repository: [whinkproducts-alt/ECHELON-CORP](https://github.com/whinkproducts-alt/ECHELON-CORP). This is a documentation reconciliation, not a new full code/security audit or a completed personal launch.

**Later update, 12 November 2026:** The Founder identified AI Organization and Autonomous Operations as the sixteenth directorate. Its leadership entry is on an unmerged ECHELON-INTEGRATIONS branch; ECHELON-CORP remains unchanged. The 4 November audit statements below retain their original snapshot meaning. Department, team and agent assignments for the new directorate remain open.

## 1. Read first; establish the revision

- Inspected local and remote `main`: **`99f6d7eb3f58cff9d9aae8f59641137faf755a9c`**, clean at inspection. All code claims below refer to that immutable baseline. This documentation change will have a later commit; compare application tree IDs in the [evidence snapshot](audits/2026-11-04/evidence.json).
- **Status: merged, automatically tested, partially implemented; full personal use is not accepted.** A desktop icon, green CI, mock provider response or a passed unit test cannot close a live acceptance gate.
- The previous implementation chat completed its turn; it is not actively building the remaining work at this checkpoint. Do not assume an agent is continuing offscreen.
- Read `CLAUDE.md` for mandatory engineering/security rules; this note corrects old status statements, not those rules. Then read [pending tasks](pending-tasks.md), [execution gates](ECHELON-READINESS-EXECUTION.md), [token/spend priority](TOKEN-AND-SPEND-PRIORITY.md) and only the source/tests needed for your audit.
- [Functional architecture](product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md) specifies the target. A design requirement is not implementation evidence. Old daily syncs, imported handoffs and assessments are dated history. Newer evidence supersedes their status claims; preserve the approved requirements.
- Do not read the approximately 97 MB blueprint or reprocess the full chat by default. The blueprint is an archive, not the current execution checklist. It was not changed or revalidated in this documentation pass.

## 2. Founder decisions to preserve

1. Token and usage-spend reduction comes first, while preserving correctness, memory/learning, security and required functionality. No unlimited-credit promise or automatic top-up.
2. Full personal instance is the goal. A Mac desktop launcher is a usability deliverable, not the definition of feature completion. Mac-running-first was accepted; Mac-independent operation is still a required later acceptance gate.
3. All requested channels remain in scope: email, SMS, WhatsApp, Telegram, iMessage, phone calls, hearing and speaking. Do not silently ship only text/Telegram or substitute one-way speech for a conversation.
4. Saved first/second/third model choices and selectable orders. NVIDIA-hosted Nemotron and DeepSeek remain trial/evaluation candidates; DeepSeek browser chat is manual reviewed handoff, not an automated API or production fallback.
5. A daily Board Room entrance briefing uses real tasks/approvals, motion and voice. Preserve replay/skip/mute and honest unavailable states. Confirm the presentation on the Founder's Mac; no finished video artifact is evidenced.
6. WHINK and MAMBA remain strategic peers; personas grant no extra permission. Founder-private Marcus/Tunde/Peter/Paul objectives and memory must be sealed from ordinary organization/persona access.
7. Lockdown must stop new jobs, outbound tools/cloud, microphone and camera while keeping local review/audit available. Include activation during an in-flight task, not only before a request.
8. Add blinking only while preserving existing avatar behavior; keep approved portraits, breathing, mouth motion and reduced-motion behavior. No claim of photorealistic/full-body human animation.
9. Prefer viable local/free services; verify cloud entitlements, privacy, quota and spending before use. No deployment, new paid call, live send, purchase or provider signup is authorized by this document. Existing feature code is not permission to send.
10. Concise A/B/C decisions with a recommendation when genuinely needed. No calendar-style estimates. Never ask for tokens/private keys in chat or include `.env` values in audit material.

## 3. What was delivered and where

Paths are inspected at the baseline above. Source paths beginning `lib/`, `app/`, `components/` or `scripts/` in this table are under `apps/web/` unless an explicit repo-root path is given. Test filenames are under `apps/web/lib/__tests__/`; `/api/…` denotes a URL route. Tests establish only their exercised scope.

| Work | Owning source / tests | Evidence boundary |
|---|---|---|
| Legacy source and current architecture reconciled into ECHELON | PR [#21](https://github.com/whinkproducts-alt/ECHELON-CORP/pull/21); `docs/migration/SOURCE-PROVENANCE.md`; `docs/architecture-control/08-M0-M1-EXECUTION-RECORD.md` | Imported history preserved. Do not repeat bootstrap/import or replay old pilot commits. |
| Bounded approved internal analysis | `apps/web/lib/worker/ear-execution.ts`; `ear-execution.integration.test.ts` under `apps/web/lib/__tests__/` | Durable queue/claim/approval path; constrained internal analysis, not universal autonomous agent tools. |
| Capability gateway and queued tool execution | `apps/web/lib/capability/{policy,invoke,egress,providers,heartbeat,events}.ts`; `lib/worker/capability-execution.ts`; `/api/integrations/jobs`; capability suites | Grants, account scope, review, receipts and at-most-once dispatch. Remote effects cannot be guaranteed exactly once; uncertain dispatch must not auto-retry. |
| Restricted GitHub report | `apps/web/lib/github-readonly/report.ts`; `apps/web/scripts/github-readonly-mcp.ts`; `github-readonly-report.test.ts` | Fixed configured repo/branch; pins report to a commit; rejects extra arguments; missing/pending/incomplete evidence stays UNVERIFIED. Token mint is an authentication POST; repository data operations are reads. No live App-to-worker pass recorded. |
| Deterministic context reduction, PR [#23](https://github.com/whinkproducts-alt/ECHELON-CORP/pull/23) | `lib/model-router/context-budget.ts`; `lib/context-engine.ts`; `app/api/conversations/[id]/messages/route.ts`; context-budget/context-engine/project-ownership and route taint tests | Recall default 8,000 characters; history target 24,000. Preserve system and complete current exchange. Mandatory content may exceed the target. No measured billing saving. |
| Current request/history correctness | Same chat route and PR #23 fixtures | History is before persisted current-message timestamp, then current message appended. Equal-timestamp sibling history can be omitted. No claim of total conversation ordering. |
| Unknown cost and profile eligibility, PR [#24](https://github.com/whinkproducts-alt/ECHELON-CORP/pull/24) | `lib/usage.ts`, `lib/finance/summary.ts`, `lib/briefing/daily.ts`, `lib/model-router/priority.ts`; usage/model-priority tests | Missing pricing is `null`/unknown. Known-price subtotal is an estimate. Key presence does not admit a paid profile. Explicit/background dispatch still needs enforcement. |
| Tainted learning boundary | Chat route; `lib/auto-memory.ts`, `lib/orchestrator.ts`; route taint fixtures | Prior-tainted turns do not initiate debrief. Memory extraction and agent lessons have different outputs; do not remove either just to reduce call counts. Broader inference admission remains open. |
| Scoped local EAR reservations | `lib/model-router/reservations.ts`, `lib/budget.ts`, `lib/worker/ear-execution.ts`; real-DB `ear-execution.integration.test.ts` | Locks existing account row; reserves input serialized bytes + 1,000 output allowance; settles same account/model row once using character estimates. Failed/uncertain calls retain holds in their UTC month. Not a dollar cap or provider-token guarantee. Unset/zero budget can be unlimited. |
| Model priority UI/API | `lib/model-router/{registry,priority}.ts`, `/api/models/{profiles,registry}`, `app/dashboard/settings/_components/model-priority-panel.tsx`; `model-priority.test.ts` | Saved orders and selection exist. `runWithFallback` has no production caller at this baseline; live ordered failover is unfinished. |
| Outbound channels and voice transports | `lib/comms/delivery.ts`, `/api/comms/channels`, `/api/voice/{stt,tts}`, `lib/hooks/useVoice.ts`; delivery-channels/voice-routes tests | SMTP/Twilio/Telegram adapters exist. iMessage returns unavailable; phone adapter speaks a script. No full two-way/inbound integration or live delivery acceptance. |
| Lockdown | `lib/safety/{lockdown,client-lockdown,lockdown-http}.ts`; scheduler/runner, tool/approval/capability/delivery/chat/voice boundaries; lockdown tests | Persisted epoch, fail-closed safety lookup and browser stop hooks exist. Full in-flight/all-dispatch guarantee is not established. Most suites use an unlocked test double; dedicated tests must unmock it. |
| Sealed team | `app/dashboard/kill-team/page.tsx`; `components/screens/kill-team/kill-team-screen.tsx` | Current objective/brief use local React state; non-founder gets view-only screen. Not durable sealed objectives, isolation or private worker execution. |
| Board Room and avatars | `lib/briefing/daily.ts`, `/api/briefing/daily`, `components/screens/board/daily-briefing.tsx`, `components/avatar/avatar-engine.ts`, `components/avatar/avatar-canvas.tsx`; briefing/avatar tests | Deterministic account-source script; encrypted stored script when encryption configured; motion/voice presentation and mouth feed. Blink requires flag, eye anchors and motion allowed, not a speaking-only rule. Live audio, autoplay, portrait alignment and daily behavior still need acceptance. |
| Organization / HOLO | `packages/org-kit/`, org/worker integration and HOLO screens; M0/M1 execution record | Canonical 326 agents / 163 teams / 15 directorates recorded; 15-versus-16 directorates unresolved. Registered identities do not mean 326 running models or full lifecycle autonomy. |

The reservation and unknown-price migrations are additive checked-in files:

- `apps/web/prisma/migrations/20261103010000_unknown_usage_cost/migration.sql`: makes cost nullable and historical zero ambiguous/unknown. **Information-losing:** reverting the schema does not reconstruct which old zeros meant free versus unpriced. Back up before applying to a personal database.
- `apps/web/prisma/migrations/20261103020000_usage_reservation/migration.sql`: adds `reservedTokens` and `usageBasis`.
- Existing gateway-upgrade `20261102010000_gateway_constraint_upgrade` handles older gateway constraints. Do not blindly reset a database because an old note says so; inspect migration status and use the documented forward repair/backup route.

### Immutable source anchors

These links refer to the inspected code revision, even after documentation moves on. Read surrounding code and the caller chain; the anchor alone is not a proof.

| Claim to inspect | Source at baseline |
|---|---|
| Context preservation | [apps/web/lib/model-router/context-budget.ts:14](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router/context-budget.ts#L14) |
| Recall target | [apps/web/lib/context-engine.ts:3](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/context-engine.ts#L3) |
| Persist current request | [apps/web/app/api/conversations/[id]/messages/route.ts:118](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/app/api/conversations/%5Bid%5D/messages/route.ts#L118) |
| Learning/taint sidecar gate | [apps/web/app/api/conversations/[id]/messages/route.ts:514](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/app/api/conversations/%5Bid%5D/messages/route.ts#L514) |
| Unknown-price calculation | [apps/web/lib/usage.ts:40](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/usage.ts#L40) |
| Local admission/row lock | [apps/web/lib/model-router/reservations.ts:6](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router/reservations.ts#L6) |
| Single-use settlement | [apps/web/lib/model-router/reservations.ts:19](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router/reservations.ts#L19) |
| EAR reservation caller | [apps/web/lib/worker/ear-execution.ts:138](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/worker/ear-execution.ts#L138) |
| Reservation race test | [apps/web/lib/__tests__/ear-execution.integration.test.ts:74](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/__tests__/ear-execution.integration.test.ts#L74) |
| Fallback helper | [apps/web/lib/model-router/priority.ts:125](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router/priority.ts#L125) |
| Registry default | [apps/web/lib/model-router/registry.ts:40](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router/registry.ts#L40) |
| Stream default | [apps/web/lib/model-router.ts:145](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router.ts#L145) |
| One-shot default | [apps/web/lib/model-router.ts:169](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/model-router.ts#L169) |
| Fail-closed safety state | [apps/web/lib/safety/lockdown.ts:42](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/safety/lockdown.ts#L42) |
| Private-team local state | [apps/web/components/screens/kill-team/kill-team-screen.tsx:24](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/components/screens/kill-team/kill-team-screen.tsx#L24) |
| Phone script | [apps/web/lib/comms/delivery.ts:258](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/comms/delivery.ts#L258) |
| iMessage unavailable | [apps/web/lib/comms/delivery.ts:343](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/comms/delivery.ts#L343) |
| STT cloud selector | [apps/web/app/api/voice/stt/route.ts:22](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/app/api/voice/stt/route.ts#L22) |
| TTS cloud selector | [apps/web/app/api/voice/tts/route.ts:47](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/app/api/voice/tts/route.ts#L47) |
| Blink gate | [apps/web/components/avatar/avatar-canvas.tsx:156](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/components/avatar/avatar-canvas.tsx#L156) |
| Daily briefing | [apps/web/lib/briefing/daily.ts:40](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/briefing/daily.ts#L40) |
| GitHub token scope | [apps/web/lib/github-readonly/report.ts:34](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/lib/github-readonly/report.ts#L34) |
| Test setup mocks | [apps/web/vitest.config.ts:12](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/apps/web/vitest.config.ts#L12) |
| CI heavy gate | [.github/workflows/ci.yml:59](https://github.com/whinkproducts-alt/ECHELON-CORP/blob/99f6d7eb3f58cff9d9aae8f59641137faf755a9c/.github/workflows/ci.yml#L59) |

## 4. Evidence checked against GitHub

[Machine-readable evidence](audits/2026-11-04/evidence.json) contains exact SHAs, workflow/job/step conclusions, summary lines, skipped files, branch tips and open PRs. Retrieved on 2026-11-04; workflow times there are UTC. These are recorded results, not tests rerun locally today.

| Revision | CI | Security | Scope |
|---|---|---|---|
| PR #23 head `9f97c6c6358a2bb441fcc9fcfe89aa8c05d6c584` | [41573396721](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41573396721), success | [41573396832](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41573396832), success | Merged as `9b63bce1ed6080429c1cd564fa0487ed0e351988`. |
| PR #24 head `5a571c68ba2ce9999e7bea9fed99b7f7a3636bb2` | [41574207211](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574207211), success | [41574207116](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574207116), success | Merged as `bd58401c43b8c65f1976fac7f79f19f2f6906db0`. |
| Baseline main `99f6d7eb3f58cff9d9aae8f59641137faf755a9c` | [41574973163](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574973163), success | [41574973158](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574973158), success | Full heavy steps executed, including migrated PostgreSQL, default production build and Chromium E2E. |

Main CI: **158 Vitest files passed; 2,345 tests passed, 39 skipped; 22 Playwright tests passed.** Skips: social integration 30; approvals integration 6; evaluation tenant isolation 2; real Ollama model test 1. DB-probed suites skip on failed probes (the shared-mock setup is a known concern); the real model test is opt-in. Do not convert skips into coverage. See [testing](testing.md) for reproduction and mock boundaries.

Security success means the production dependency audit passed its high/critical gate, the configured full-history secret scan passed, and CodeQL analysis ran. It does not prove zero vulnerabilities or manual security acceptance. CodeQL uses `upload: never` and retains SARIF for 14 days; E2E artifacts last 7 days. Artifact availability may expire independently of run metadata. During documentation publication GitHub's push banner reported 134 alerts (8 critical, 49 high, 58 moderate, 19 low). A separate paginated read of open Dependabot alerts returned **131** (8 critical, 49 high, 55 medium, 19 low), across six manifests including legacy locks and service packages. The difference is not reconciled; neither count is verified runtime exploitability. The passing configured production audit must be reconciled with those open alerts before security readiness. Manifest/scope counts and high/critical alert IDs are captured in the evidence snapshot. No dependency fix or dismissal was performed.

The earlier source sessions recorded independent assurance of PRs #23/#24 and local reservation race evidence. The race test now exists in the real-DB suite; current CI executes it. This documentation pass does not create a fresh security certification of that code.

## 5. Personal-use completion and desktop launch

Use [execution gates](ECHELON-READINESS-EXECUTION.md) for each pass condition and [pending tasks](pending-tasks.md) for the build order. Engineering work continues independently of provider setup: cost admission, actual fallback, sealed scope, in-flight controls, channel/inbound and voice gaps. Do not make every open item the Founder's responsibility.

Mac personal acceptance must cover owner sign-in/restart, one real mission through the worker, the live restricted GitHub report, approvals/denials/revocation, model order and spend limits, every requested channel and two-way voice, private-team isolation, lockdown during work, daily briefing/avatars, backups/restore and desktop relaunch. Mac-off remains a separate mandatory full-system gate after the agreed Mac-on first milestone.

No `.app`/`.command` desktop launcher is tracked. `docs/whink-worker.plist.example` is an uninstalled example with historical paths, not an app bundle or a running service. Add a minimal ECHELON.app/icon around the existing web product after the runtime is verified: start/reuse required local services and worker, bind loopback, check readiness, open the configured origin, avoid duplicate processes, keep secrets out of logs/bundle, provide graceful stop and actionable errors. Test double-click twice, occupied port, missing dependency, failed DB/model, restart and Mac login. Do not auto-install packages, pull models, reset data, migrate on every click or purchase services. A launcher does not close the feature gates.

## 6. Known discrepancies to challenge

- Sample `DEFAULT_MODEL` / `WHINK_LOCAL_MODEL`: `wink-qwen3.5-9b-8k`; registry uses that default. `streamChat` fallback is Qwen; `chatOnce` fallback is `llama3.1:8b` when neither explicit model, hints nor `DEFAULT_MODEL` applies. Hints can select Claude tiers; explicit/preferences/default routes are not one universal priority policy. Actual saved runtime settings were not inspected.
- `.env.example` selects cloud Deepgram STT and OpenAI TTS despite including local speech URLs. A local URL does not override an active cloud provider selector. Server and browser Local-Only flags must agree; an example is not proof of safe runtime configuration.
- No universal spend guarantee: paid default/explicit/background/embedding/voice dispatch and failures/cancellation need admission, provenance and reconciliation. `WHINK_MODEL_PRICES` config estimates are not invoices; a configured key or displayed `$0` is not free access.
- `runWithFallback` is a helper exercised by tests, not wired to production dispatch. Avoid tool/side-effect replay when implementing it.
- Blink is opt-in via `NEXT_PUBLIC_AVATAR_BLINK`, eye anchors and reduced-motion. Older notes saying only speaking/active states are inaccurate.
- A Board Room briefing modal with voice/motion is not evidence of an encoded daily video or a two-way phone conversation.
- Gateway at-most-once dispatch and exact-once approval consumption are different guarantees. Timeout/UNKNOWN needs honest status and manual resolution, not silent retry.
- Carry-forward security items include gateway CG-9/12/13/14, CG2 deferred findings, concurrent discovery/review, receipt terminal updates, approval sweeps versus long executions, OpenClaw DNS/stale routes and password reset races. These are historical review items to re-evaluate against source, not fresh confirmed findings. See decision log and remediation branch; do not delete the latter before resolving its unique work.

## 7. Branches and repository state

Observed remote: main + **11 Dependabot heads** + **`fix/remediation-2a68d1fb-185920`**. PRs #23/#24 and old merged foundation/import/integration heads are absent. Two efficiency heads were deleted in the previous consolidation (recorded in the 2026-11-02 sync). Retained remediation tip: `0105b0deb24c38972b527c171b5af9837affe882`. Exact branch tips/open PRs are in the evidence snapshot.

Open dependency PRs: #5, #6, #7, #8, #9, #11, #13, #14, #15, #16, #22. Review compatibility, licenses and behavior individually; the group has 71 proposed updates and several proposals are major versions. Mapbox #16 license concerns remain unresolved. No blanket merge or branch deletion is part of this documentation task. Branch protection, account 2FA, subscriptions and host configuration were not inspected.

## 8. Suggested four independent audit lanes

Each auditor begins with `git status`, branch, exact HEAD and baseline comparison. Read only the relevant source. Default read-only: do not change the shared checkout, dependencies, DB, providers, GitHub settings or credentials. Use isolated test data; request owner approval for real sends/spend. An auditor without GitHub access can use a complete local source export plus this guide and evidence; it must label remote evidence as supplied, not independently fetched. Never package `.env`, private keys, databases or `node_modules` with the audit.

| Lane | Inspect and challenge | Required negative cases |
|---|---|---|
| A — inference, cost and learning | Both routers, registry/priority, all chatOnce/streamChat/chatWithTools/embed callers, usage/reservations, background jobs | Explicit-model and BYOK bypasses; unknown price; account mismatch; concurrent last-capacity; cancellation/lost response; UTC month boundary; tainted memory/debrief; side-effect replay; context system/current-request preservation. |
| B — authority and private data | Auth/tenant scope, permission/protected actions, approvals, capability policy/egress, sealed scope, lockdown | Cross-account and non-owner access; expired/reused/mutated approvals; revocation in flight; DB failure; redirect/DNS changes; provider prompt injection; secrets in outputs/logs; lockdown during dispatch and browser capture. |
| C — actual functionality and UX | Mission-to-worker-to-receipt, all channel routes/delivery, STT/TTS, Board Room and avatars, org/HOLO, desktop launcher | Unconfigured vs delivered; uncertain send; restart/reload persistence; missing iMessage/two-way call; manual browser handoff; source unavailable briefing; autoplay/blocked mic; reduced motion; truthful task state. |
| D — reproducibility and operations | Workflow/test mocks/skips, migrations, setup/env loading, dependencies/licenses, retained remediation, services, backup/recovery and host design | Fresh isolated DB vs upgrade; no reset of personal data; tests actually unmock SQL/safety; reproducible default build; stale fixtures; budget/config defaults; restart/port conflict; restore; true Mac-off distinction. |

Use this finding format: **ID; severity; exact commit; path and line; observed behavior; reproduction/evidence; impact; proposed smallest fix; affected acceptance gate; confidence; not-tested boundary.** Separate confirmed defects, inferred risks and improvements. A passing test does not dismiss a concrete bypass. Do not claim a provider action happened from Codex/ChatGPT connector access: the ECHELON worker/gateway must produce its own receipt.

## 9. Next builder handoff and rollback

Next engineering slice: account-scoped dispatch admission for explicit chat and automatic sidecars, then other text paths, embeddings and voice, without enabling paid calls. Prove one refusal/race/uncertain-outcome path before expanding. Follow with actual inference-only model failover, durable sealed objectives and whole-flow lockdown, missing channels/two-way voice, personal acceptance, and launcher/backup completion. Record exact owner inputs when needed; do not reconstruct or recreate previously reported keys/App blindly.

For every slice, record revision, paths, actual commands/results, skips/failures, mock/live scope, independent review, remaining gates, rollback and one next action in the daily sync. Mark DONE only with evidence. Revert application changes through a reviewed commit; do not force-push or reset shared history. Back up before schema/data changes; restore/forward repair must account for the unknown-cost migration's information loss. This documentation-only update needs no database migration or runtime restart.
