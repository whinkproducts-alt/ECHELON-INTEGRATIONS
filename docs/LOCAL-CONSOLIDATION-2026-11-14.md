# Local consolidation — November 14, 2026

## Scope

Requested: merge ready local changes, clean redundant branches, update notes. Base: GitHub main `8e45650bfca3cb32e291f5811037af7c385dcd55`.

## November 14 consolidation status

This consolidation includes the sixteen-directorate metadata update, restores the complete standing-worker roster API broken by the earlier budget branch, documents/tests the existing account-level spend cap, and keeps the new notification helper in-app only. It does not enable paid inference, external notifications, Marcus handoff or the executive experience.

The new directorate is **AI Organization and Autonomous Operations**; existing director names, 326 agents and 163 teams are preserved. It has no staffing yet. The historical D8 daily-SMS exception is an unverified proposal, not permission to bypass exact approvals.

Held work: `feature/executive-experience` at `cc87d02` (compile errors, missing migrations, private-thread and mission contract gaps), local `fix/v3.3-spend-control` at `6e85524` (only safe config/test portions integrated; destructive table retirement and report rewrite held), and `marcus-vale-fixes` at `83b85ed` (standalone prototype, incompatible cross-service contract and incomplete acceptance). No local private configuration or standalone runtime is copied into the application.

Monthly budget reporting is **not scheduled**: the existing worker supports interval schedules, not the added cron expression. The legacy envelope tables/modules remain; no destructive migration is included. Account model-spend admission and holds remain the active budget boundary. Setting a cap does not enable paid inference. No owner settings were changed.

Promotion to ECHELON-CORP and actual Mac speech, private memory, mission execution and recovery acceptance remain separate gates.

## Review and verification

- Independent read-only assurance reviewed the source slice; its required correction was to mark the unverified daily-SMS policy override as proposed. Applied.
- Local dependencies were installed in an isolated checkout; disk exhaustion blocked copying the optional Linux Prisma engine. Only this task's temporary dependency install was removed. Existing checkouts/settings were preserved.
- Local checking uses the generated candidate Prisma types with a temporary path mapping because shared installed dependency types otherwise resolve to the source checkout's different schema. CI must generate its own normal client and run the complete migration/build/test/browser checks before merge.
- Focused regression tests: 6 files / 55 tests passed. ESLint: zero errors, six existing warnings. Full local tests and final CI are pending. No live paid requests, external sends, database migrations against personal data, deployment or ECHELON-CORP changes are part of this task.

## Redundant branch candidates (ancestry verified against base main)

| Branch | Tip before cleanup |
|---|---|
| delivery/media-voice-performance-integration | 8d1fd175d54b13a893ad91a6aaef4585338383b2 |
| feat/echelon-v3.3-budget-envelope | 2c7871008b7b3d32c7809e929c3ebd89afaabae3 |
| integration/consolidated-pending-upgrades-2026-11-12 | 444244d0a77f18dd92b41b1b741427345d48b961 |
| org/add-ai-autonomous-operations-directorate | b0a4250f1fe34cb7523b1c8a8a7b9bb61c727c3e (delete only after this merge) |

Retain dependency branches with open PRs, executive experience, standalone Marcus, and the partly integrated local spend-fix branch. A partially copied commit is not redundant. Preserve unrelated local untracked files.
