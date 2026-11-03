# ECHELON functional readiness


Current Founder priority (2026-11-02): reduce token and usage spend first, preserving correctness/security, then continue end-to-end readiness. Read TOKEN-AND-SPEND-PRIORITY.md. Paid-admission/accounting gates remain unfinished until verified.

Updated 2026-11-02. Architecture spec: [product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md](product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md).

Current main HEAD: `ccecfcf` (2026-11-02). R04/R06/R07/R08 merged. All merged branches deleted. Remaining open branches: `fix/remediation-2a68d1fb-185920` (Qodo bot, not merged by design) and Dependabot PRs (pending review).

## Next action

Victor runs own-Mac setup: supply `.env` values, run `npx prisma migrate dev`, run `pnpm dev`, sign in. This is the R01 gate — nothing can be live-accepted until this passes. See pending-tasks.md section A for the full list of what only Victor can do.

## Founder choices

- Mac running first; Mac-off acceptance remains required later.
- All communication channels plus hearing and speaking required, including iMessage feasibility and real calls. Do not reduce scope to Telegram/email without asking.
- Daily Board Room entry briefing from real tasks/approvals, with motion and voice.
- Model-priority control: selectable first/second/third and saved-order switch. Browser chat is manual handoff; NVIDIA trial restrictions and privacy/cost gates still apply.
- Avatar: add blinking if it preserves existing behavior; otherwise keep breathing/mouth animation. Blinking is now implemented conditionally (speaks/active states only).
- Lockdown: stop new jobs, outbound tools, cloud calls, mic/camera; retain local review/audit. Lockdown is now implemented.
- No elapsed-time estimates. Ask concise A/B/C questions for missing decisions, and keep independent work moving.

## Build status

| Ticket | Status | Evidence / next gate |
|---|---|---|
| R01 baseline | TODO | Victor must supply .env, run `prisma migrate dev`, run `pnpm dev`, sign in |
| R02 real mission | PARTIAL | Analysis path exists; capability-worker pilot reconciled with main; live full journey needed after R01 |
| R03 GitHub pilot | PARTIAL | Provider and fixture tests pass; App installation/key setup and live worker report need Victor |
| R04 models | BUILT — AWAITING LIVE ACCEPTANCE | Commit `cc7a8fa`. Priority logic, registry, profile CRUD API, settings panel. 2273 tests pass. Next: Victor tests model selector in running app |
| R05 Mac-off | TODO / PROVIDER DECISION | Architecture/runbook needed; approved remote host and physical test needed |
| R06 channels/voice | BUILT — AWAITING LIVE ACCEPTANCE | Commit `cc7a8fa`. Real SMTP/Twilio SMS/WhatsApp/Telegram/voice adapters. Next: Victor supplies TWILIO_* + SMTP_* and tests a real send |
| R07 sealed team/lockdown | BUILT — AWAITING LIVE ACCEPTANCE | Commit `cc7a8fa`. Full lockdown module, API, UI. Security pass still needed. Next: Victor tests lockdown toggle in running app |
| R08 briefing/avatars | BUILT — AWAITING LIVE ACCEPTANCE | Commit `cc7a8fa`. Daily briefing logic + API + Board Room UI + conditional avatar blink. Next: Victor tests Board Room in running app |
| R09 organization/HOLO | PARTIAL | Canonical registry and UI exist; lifecycle coverage and directorate reconciliation pending |
| R10 readiness/services | TODO | Inventory, independent assurance, backups, all acceptance evidence |

## Current test baseline (2026-11-02, commit `cc7a8fa`)

153 Vitest files, 2273 tests passed, 105 skipped. Lint: 0 errors, 7 pre-existing warnings. `tsc --noEmit`: clean. `next build`: compiled successfully. New migration `20261102120000_readiness_safety_models_briefing` not yet applied to any live DB — Victor must run `npx prisma migrate dev`.

## Standing rules

Do not recreate credentials reported as already created; locate/configure securely with the Founder. Never print key contents. Do not deploy, merge, purchase, send real messages or claim Mac-off completion without Victor's explicit approval.

GitHub reports 134 default-branch vulnerability alerts (8 critical, 49 high, 58 moderate, 19 low) — untriaged Dependabot alerts, not independently verified reachable vulnerabilities. R01/R10 must inspect and prioritize; do not claim security readiness from earlier audit notes alone.
