# ECHELON pending work — updated 2026-11-04

Read [current audit handoff](ECHELON-AUDIT-HANDOFF-2026-11-04.md) for the fixed baseline, source/test map and CI evidence. `main` was `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`; PRs #23/#24 are merged. Full personal use remains **not accepted**. Existing code, automatic test results, real provider acceptance and Founder acceptance are separate states.

## Next action and priority

Current execution architecture: [C00–C14 completion plan](product/ECHELON-END-TO-END-COMPLETION-PLAN.md). Both working copies are being aligned after preserving the old draft; the valid provenance, approval completion and provider-log fixes are tracked in [reconciliation](reconciliation/2026-11-04.md). C01 triage and C02/E01 admission are next; C04 local configuration can proceed independently.

**First: E01, close paid-dispatch/accounting gaps without enabling paid calls.** Preserve functionality, privacy and learning. Configure and test the Mac runtime in parallel where no spend/external action is involved. Then E02–E08 and all R01–R10 gates. Do not wait for the Founder to fix engineering gaps. No calendar estimates or automatic credit top-ups.

## Engineering backlog

| ID / readiness | Pending implementation and proof | Completion evidence |
|---|---|---|
| E01 / R04,R10 | Enforce authenticated account-scoped admission/reservations at real default/explicit/BYOK chat, tool rounds, sidecars, generic worker, skills/swarm/refinement, embeddings and voice. Include known-price limits, unknown-cost refusal policy, durable failure/cancellation settlement and crash/month reconciliation. Current reservations cover local EAR only. | Bypass, concurrency, cross-account, hard-limit, provider-failure and lost-response tests; receipts show estimates vs provider usage and refusals. No paid call needed for fixture tests. |
| E02 / R04 | Wire actual first/second/third inference failover to dispatch. Handle tools, data class, cooldown, quota, credentials, manual handoff and total deadline. Resolve unset-default inconsistency (`streamChat`: Qwen; `chatOnce`: llama). | Real production-path fixture tests, no action replay, then approved local/provider acceptance. Helper-only tests do not close this. |
| E03 / R07 | Durable Founder-private objectives/worker scope and private memory/results; owner-only server enforcement. Current Kill Team objective is local state and other users see a view-only screen. | Restart persistence and deny cross-account/non-owner/general WHINK/MAMBA retrieval, tools, SSE, logs and briefing access to sealed data. |
| E04 / R07 | Independently audit and finish lockdown across in-flight jobs/model/tool/delivery and browser mic/camera/audio; fail closed on DB failure. | Real safety module + DB tests, mid-task activation, no new network/capture after cutoff, local review intact. Document unavoidable already-sent effects. |
| E05 / R06 | Finish iMessage bridge selection/integration and real two-way phone/audio; identify any required inbound message/reply paths and correlate receipts. Retain SMTP/Twilio/Telegram delivery adapters. | Per-channel configured/unconfigured, approval/denial, unknown outcome and authorized send/receive tests. Scripted Twilio call is not conversational voice. |
| E06 / R02,R03 | Real mission and restricted GitHub App-to-provider-to-gateway-to-worker acceptance; verify report bounds/injection and revocation. Retention/cleanup for interrupted encrypted inputs/results. | Exact target commit, job and gateway receipt, no writes/other-repo access, pending/failed/incomplete checks stay truthful. |
| E07 / R08,R09 | Accept Board Room daily motion/voice and avatar mouth/blink on the Mac; finish HOLO task/agent lifecycle and reconcile 15/16 directorates without inventing roles. | Source-accurate daily/replay/mute/skip behavior, actual audio vs synthetic cadence labelled, reduced motion, real lifecycle events; Founder roster decision if unresolved. |
| E08 / R01,R10 | Desktop ECHELON.app/icon, runtime readiness/start/reuse/stop, safe errors and logs, backup + tested restore. The existing plist is an example, not installed. | Double-click launch twice and after restart, port/dependency failures handled, no secret logs, no automatic reset/spend/download; data and owner session survive; restore verified. |
| E09 / R05 | Approved Mac-independent runtime, secret/bootstrap/heartbeats, budgets, monitoring, backups and recovery. Mac-on is the first milestone, not removal of Mac-off scope. | Authorized host and worker serve/finish a job with Mac powered off; prove blocked stale host and recovery, costs/privacy recorded. |

## Founder inputs and live acceptance (request only when needed)

- **F01 — Mac runtime:** confirm the chosen local instance and owner email; securely configure `.env`, required auth/encryption/database/model values, sign in, and test passkey/restart. Do not print values or overwrite existing secrets. Next.js `.env.local` overrides may differ from worker/Prisma `.env` loading.
- **F02 — GitHub:** App creation/private-key download were reported. Locate existing App installation ID/configuration securely and confirm one-repo read permissions. Do not recreate keys/App unless actually needed. Codex GitHub access is not proof of ECHELON access.
- **F03 — channels:** supply existing approved SMTP/Twilio/Telegram settings and chosen test recipients privately. Confirm entitlements/costs before a real send/call. iMessage bridge needs an actual compatible host/account/privacy choice; no unsupported promise.
- **F04 — models:** local/free first, verify installed model and local speech availability. NVIDIA quotas/production entitlement and privacy must be verified before any live application admission; browser DeepSeek stays manual.
- **F05 — approvals/security:** exact protected action approval stays mandatory. No standing approval for daily proprietary SMS or new expenditure; do not revive a late-approval council or add approval bypasses.
- **F06 — remote:** select/approve an actual host and any cost before deployment. Domain, Cloudflare and Hetzner were old proposals, not current purchase requirements. Reuse suitable approved infrastructure when verified.
- **F07 — organization:** reconcile directorate count and board identities/assets only from authoritative Founder data. Generated email addresses do not establish live mailboxes.
- **F08 — repository settings:** confirm branch protection/required checks, 2FA, push protection and dependency policy in the actual account. No current settings state is claimed by this pass.

## Security, quality and retained work

- **Current dependency triage:** During documentation publication GitHub's push banner reported 134 alerts (8 critical, 49 high, 58 moderate, 19 low). A separate paginated read of open Dependabot alerts returned **131** (8 critical, 49 high, 55 medium, 19 low), across six manifests including legacy locks and service packages. The difference is not reconciled; neither count is verified runtime exploitability. The passing configured production audit must be reconciled with those open alerts before security readiness. Manifest/scope counts and high/critical alert IDs are captured in the evidence snapshot. No dependency fix or dismissal was performed.

- Re-evaluate historical CG/CG2/Qodo findings against current source, especially provider output injection, review/discovery races, final receipt update, long execution approval sweeps, OpenClaw DNS/stale routes and password-reset races. See [decision history](decisions.md); these are carry-forward review items, not a new claim that every finding is still present.
- Retained remediation: terminal `finish()` fencing and fixed-category provider logging are incorporated by the reconciliation change with fail-on-old-code regression tests. The proposed stuck-sweep removal is deliberately not merged; its broader lease/unknown-outcome design remains open. Preserve branch provenance and stuck-approval protections; see the reconciliation record.
- Eleven dependency PRs remain: #5–9, #11, #13–16, #22. Review separately, including runtime/API compatibility and permitted licenses. Mapbox #16 licensing unresolved; no blanket major upgrade.
- Current main CI passes **2345 tests with 39 skipped and 22 E2E passed**. Resolve skip/probe coverage separately; skipped social/approval/evaluation/model checks are not acceptance. See [testing](testing.md).
- Fresh-db CI does not prove safe upgrade/restore of a personal DB. Use `prisma migrate status` / checked-in `migrate deploy`, take backups first. Do not run reset, db push or destructive seeds on personal data.
- Before wider release: legal/privacy/platform terms and license review, behavior/performance/accessibility/brand assurance, production screenshots, hosting/recovery and personal-data retention. Security CI is not certification.

## Longer-term or conditional requests retained

These are not silently closed: product-site editing; Gmail/Calendar/Drive/Contacts; meeting-room provider; password-change and sign-out-everywhere; installer distribution/signing; Change Request reload behavior; abandoned swarm reservations; staff mailbox provisioning and external service consolidation. Reinspect actual source before treating old defects as current. Preserve recall requirements (dimensions, dedup, HNSW, permissioned memory, citation isolation/retrieval): older claims that all of Phase 3 is untouched are false; remaining assurance is not proven. Scope public billing/white-label commercialization separately from full personal use.

## Closed / do not repeat

Source import and PR #21 reconciliation; PRs #23/#24 implementation and merge; the two merged efficiency heads and old bootstrap/import/integration branch cleanup; current-main CI and security verification. Do not rerun source import, recreate the GitHub App blindly, or report old model/DB failures as current-main results. Preserve the [historical backlog](archive/pending-tasks-through-2026-11-02.md) only as provenance.
