# ECHELON functional readiness — execution gates

Updated **2026-11-04**. [Audit handoff and source map](ECHELON-AUDIT-HANDOFF-2026-11-04.md) · [Engineering backlog](pending-tasks.md) · [Target architecture](product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md).

Baseline `main`: `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. PRs #23/#24 merged. **Full personal use: NOT ACCEPTED.** Current passing automatic checks are not Founder/device/provider acceptance.

## Next action

Use [the C00–C14 completion architecture](product/ECHELON-END-TO-END-COMPLETION-PLAN.md) as the coding sequence and this R01–R10 table as the acceptance register. [Reconciliation](reconciliation/2026-11-04.md) preserves the older checkout and carries valid fixes; [harness inventory](ENGINEERING-HARNESS.md) explains the existing runtime. This does not close live/device gates.

Implement E01 dispatch admission/accounting from `pending-tasks.md` using synthetic providers and isolated DB tests, preserving required learning and request-id approvals. Configure the existing Mac instance alongside that engineering work. Do not imply all engineering waits on Victor's sign-in. Follow with real model fallback, sealed scope/lockdown, channel/voice gaps and acceptance below.

## Acceptance register

Status vocabulary: **PARTIAL** = code exists but named implementation/acceptance gaps remain; **UNVERIFIED** = no sufficient runtime evidence; **OPEN** = deliverable not completed. No R-ticket below is fully accepted. Owner means the build team unless explicitly Founder/provider dependent.

| Ticket | Current state and evidence | Required pass condition |
|---|---|---|
| R01 personal Mac baseline | PARTIAL / UNVERIFIED. Source, setup instructions and automatic auth checks exist; actual owner configuration/session/restart not verified. No desktop launcher tracked. | Migrations applied safely to the chosen instance; owner signs in, passkey tried, data survives restart. Desktop launcher starts/reuses services/worker, waits for readiness, opens correct origin, handles duplicates/port/dependency errors; backup and restore tested. |
| R02 real mission | PARTIAL. Bounded internal EAR analysis and owner-directed capability worker implemented. | Founder submits an actual task; persisted job uses canonical agent, scope, permission/budget/approval, worker and durable result/receipt; UI shows genuine states. No tools executed merely by a persona label; no uncertain side-effect retries. |
| R03 GitHub pilot | PARTIAL. Fixed-repo report provider and real-DB/MCP fixtures exist. App/key creation reported; installation/configuration not verified. | Existing App installed only on ECHELON with six read permissions; provider discovered/reviewed/granted; live worker report pinned to exact commit and receipt; wrong-repo/write attempts denied before data access, revoke and missing/failed/pending checks truthful. |
| R04 models and spend | **PARTIAL — admission (C02) and saved-order dispatch (C03) implemented (2026-11-05).** Chat passes the policy-filtered first/second/third order into the tool loop, falls back only before a tool runs or a byte is sent, stops on account-wide blocks and cancels, and pauses at a manual handoff. One unset default and one purpose-override rule. Still open: live second-provider acceptance, micro-USD holds in the usage UI, operator-confirmed release. | First/second/third order and manual handoff run through real dispatch, no side-effect replay; every inference/voice path admitted/accounted, failure holds safe; representative quality/cost measurement. Keys do not grant spend. |
| R05 Mac-off | OPEN. Mac-on first accepted; approved remote host and physical test absent from this evidence. | Authorized remote worker/host with secure configuration, limits, monitoring and backups finishes a task with Mac off; offline-host calls block and recovery works. Separate resilience/restore proof. |
| R06 communications/voice | PARTIAL. SMTP, SMS, WhatsApp, Telegram and scripted phone adapters; local/cloud STT/TTS routes. iMessage unavailable; two-way calls/inbound journey unfinished. | Every requested channel configured and authorized send/receive/receipt verified with selected recipient; conversational phone and actual hearing/speaking; uncertain outcomes stay unknown, approval/lockdown/spend at final I/O. No silent reduction to a subset. |
| R07 private team/lockdown | PARTIAL. Persisted safety module and many dispatch/client guards. Kill Team objective is local React state with non-founder view-only UI. | Durable Founder-private scope inaccessible to other accounts/personas/ordinary organization through any query/event/export/recall; real worker execution within scope; mid-flight lockdown stops new dispatch/cloud/mic/camera and leaves audit readable, including DB-failure case. |
| R08 daily briefing/avatars | PARTIAL / LIVE ACCEPTANCE OPEN. Source-based daily script/API, modal motion/voice, mouth/breathing and opt-in blink code. | Actual account facts and unavailable sources displayed correctly; local-day first entry, replay/skip/mute/autoplay failure/restart tested; real audio mouth feed labelled versus synthetic browser cadence; portrait/eye alignment, reduced motion and no regressions accepted. No encoded video artifact claimed. |
| R09 organization/HOLO | PARTIAL. Canonical registry and screens, bounded execution paths. 15/16 directorate discrepancy unresolved. | Founder resolves roster ambiguity; task allocation, lifecycle, manager notifications/takeover where approved, receipts and HOLO events reflect durable actual work. Registration is not simultaneous execution. |
| R10 operations and release | PARTIAL. CI/security and initial [service inventory](SERVICE-INVENTORY.md) available; current subscriptions/entitlements not inspected. | Exact local/free/trial/paid plan, known costs and cap coverage, backup/restore, logs/retention, dependency/license triage, independent findings and evidence for every personal-use gate; public-sale compliance remains separate. |

## Current automatic baseline

Locally verified on 2026-11-05 at `8bca36f` + `feat/c02-dispatch-admission` (pnpm 10.28.0): typecheck,
targeted lint, **155 unit files / 2288 passed / 106 skipped**, and on isolated Postgres
`whink_admission_test` the EAR integration suite (14) plus the new admission lifecycle suite (6).
The 106 local skips are DB-gated suites absent a configured test database; CI remains the full-run
reference. No live provider call was made.

GitHub main run [41574973163](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574973163): typecheck, lint, checked-in migrations on PostgreSQL + pgvector, seed, **158 files / 2345 tests passed, 39 skipped**, default production build, **22 browser tests passed**. Security [41574973158](https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41574973158): configured audit/secret scan/CodeQL jobs passed. Fixed revision, mock boundaries and skip file counts: [evidence](audits/2026-11-04/evidence.json) and [testing](testing.md). Not rerun locally in this documentation pass.

## Completion record required for each gate

Record exact app revision, environment/host identity without secrets, actual command/action, pass/fail/skipped, DB/mock/provider boundary, job/approval/receipt IDs and timestamps, negative cases, reviewer and remaining blocker. Source findings and sensitive results stay in approved storage, not audit exports. A flag, screenshot or comment alone does not establish enforcement.

For personal databases: back up, inspect migration status, and apply checked-in migrations with `pnpm --filter app exec prisma migrate deploy`; `migrate dev` is for schema development on disposable developer data. Do not reset data or rotate an existing encryption key for convenience. Live migration state was not inspected.

## Scope and authorizations

The Founder wants full personal use and a desktop icon; Mac-on is the first operating milestone, with Mac-off still required. All communication channels, hearing/speaking, real daily Board Room briefing, conditional safe avatar motion, selectable model priorities, sealed team and lockdown remain required. Ask concise A/B/C questions only for genuinely missing decisions; continue independent engineering.

No document authorizes purchase, cloud admission, deployment, real outbound communication or a proprietary export. Locate reported existing GitHub App/key securely before recreating anything. Commit/merge authorization comes from the current Founder request, not this checklist. Keep the current exact-model/per-request approvals and no-spend restrictions.
