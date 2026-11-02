# VS Code: continue ECHELON functional readiness

Updated 2026-11-01. Start with [the architecture](product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md).
Architecture is complete as a specification, not implemented functionality. The current task changed documentation only.

Baseline at architecture authoring: branch `integration/echelon-capability-gateway`,
HEAD `ddbef568d7ae97680f574d2827ee01cdd1e91b5e`, clean working tree before documentation.
Publication reconciliation: upstream advanced to `cb4240a` with gateway security fixes. This documentation is published on top of that upstream. Earlier local pilot/model commits are preserved separately on `handoff/echelon-local-pilot-20261101` at `ddbef568d7ae97680f574d2827ee01cdd1e91b5e`. They are NOT merged into the target integration branch. VS Code must inspect/reconcile that supporting branch against current security fixes before adopting worker/provider code. Inspect live Git state; never overwrite newer fixes.

## Next action

Execute R01: inspect current owning code, config-presence flags without values, Git state,
local services and test setup. Create an isolated test database; do not reset the owner's
DB. Record baseline build/typecheck/lint/full-suite results. Then close R02/R03 with a
real harmless mission and a restricted GitHub report through the worker/gateway.

## Founder choices

- Mac running first; Mac-off acceptance remains required later.
- All communication channels plus hearing and speaking required, including iMessage feasibility and real calls. Do not reduce scope to Telegram/email without asking.
- Daily Board Room entry briefing from real tasks/approvals, with motion and voice.
- Model-priority control: selectable first/second/third and saved-order switch. Browser chat is manual handoff; NVIDIA trial restrictions and privacy/cost gates still apply.
- Avatar: add blinking if it preserves existing behavior; otherwise keep breathing/mouth animation. This is the confirmed conditional A-otherwise-B instruction, not a later rejection of blinking.
- Lockdown: stop new jobs, outbound tools, cloud calls, mic/camera; retain local review/audit.
- No elapsed-time estimates. Ask concise A/B/C questions for missing decisions, and keep independent work moving.

## Build status

| Ticket | Status | Evidence / next gate |
|---|---|---|
| R01 baseline | TODO | Current full baseline, sign-in, worker startup, DB verification |
| R02 real mission | PARTIAL | Analysis path exists; capability-worker pilot is on supporting handoff branch and requires reconciliation; live full journey needed |
| R03 GitHub pilot | PARTIAL | Provider and fixture tests; inspect App installation/key setup; live worker report missing |
| R04 models | PARTIAL | Synthetic results: Nemotron 4/4, Mistral 4/4, local Qwen 2/4; NVIDIA DeepSeek timed out. Registry/profile/fallback UI not built |
| R05 Mac-off | TODO / PROVIDER DECISION | Prepare architecture/runbook; approved remote host and physical test needed |
| R06 channels/voice | PARTIAL | SMTP/SMS code exists; other delivery adapters and live acceptance pending |
| R07 sealed team/lockdown | TODO | Client-only Kill Team brief; global lockdown absent |
| R08 briefing/avatars | PARTIAL | Avatar mouth/breathing code exists; entry briefing/blinking conditional feature pending |
| R09 organization/HOLO | PARTIAL | Canonical registry and UI exist; actual lifecycle coverage and directorate reconciliation pending |
| R10 readiness/services | TODO | Inventory, independent assurance, backups, all acceptance evidence |

Last recorded tests before architecture: targeted NVIDIA tests 4/4, typecheck and targeted lint passed.
Earlier gateway handoff records successful build/focused gateway checks but non-green broad suites.
No tests were rerun to imply current full-build success during this documentation task.

For each completed slice replace status with VERIFIED only alongside exact commit, reproducible command,
evidence level, passed/failed/skipped counts, rollback and remaining limits. Update this file and relevant notes.
Keep pending questions with ticket IDs. First provider decisions: real recipients, approved channel identities,
telephony costs, iMessage bridge, speech provider, model data ceilings/order and remote host/store.

Do not recreate credentials reported as already created; locate/configure securely with the Founder.
Never print key contents. Current App creation is conversation evidence only; validate actual installation.
Do not deploy, merge, purchase, send real messages or claim Mac-off completion from this handoff alone.

Publication-time GitHub warning: the push reported 134 default-branch vulnerability alerts (8 critical, 49 high, 58 moderate, 19 low). These are untriaged platform alerts, not independently verified reachable vulnerabilities in this branch. R01/R10 must inspect the current dependency graph and alerts, prioritize relevant fixes, and record actual audit results; do not claim security readiness from earlier audit notes.
