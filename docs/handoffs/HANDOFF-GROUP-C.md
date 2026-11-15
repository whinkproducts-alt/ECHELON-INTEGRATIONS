# Group C handoff — approval flow / org tiers

Not pushed. Decision needed from Victor (below).

## What I did not build, and why

**The 8-tier org approval chain (agent, team lead, department head, director, subsidiary director, Wink/Mamba, board, founder) with C1 to C7 and H classes.** Reasons:

1. **It conflicts with this repo's binding rules.** `CLAUDE.md` non-negotiable 4: "Class C always waits for a human. No exceptions." Protected actions: "No agent or subagent can approve on Victor's behalf." Non-negotiable 10 outranks everything else. The tier design has AI personas (team leads, directors, board) approving Class C browser actions, which is exactly what those rules forbid. Only Victor can amend those rules; I will not work around them.
2. **There is no consumer.** The code exists only as orphan files in repo-root `src/` (`src/lib/org-approval.ts`, `src/browser/*`, `src/config/tool-classes.json`). They import `@/lib/*` aliases that only resolve inside `apps/web`, import `playwright` (not an app dependency; Phase 2d D9 also bans browser-automation libraries in app dependencies), and are not compiled, linted or tested. `apps/web/lib/browser/` does not exist.
3. **Single tenant.** The only human approver is Victor. Tiers would route the same Class C request to AI approvers or back to him, so "Victor sees only H" would hide requests that must reach a human.

The same behaviour the tiers aim for ("Victor only sees money, reputation, destruction") already exists as: Class A/B run on autonomy level or delegation; protected money and proprietary actions are always Class C; everything else is gated by grants and capability policy.

## Verified already in place (no change needed)

Approval flow tests exist and pass for: a bare "approved" approving nothing, 29.9 s / 30.1 s expiry, hash lock, cross-user not found, ten concurrent approvals running once, Class C at every autonomy level and with a delegation, downgrade refused, denied cannot be approved later (17 files under `lib/__tests__/approv*`, `permission-engine`, `protected-*`, `autonomy-approval*`, `spoken-approval`). An approval dock UI exists at `components/neural-link/approval-dock.tsx`.

## Shipped (opt-in, default off)

`WHINK_TASK_GATE_ANALYSIS_AUTO=true` lets read-only directives (research, analyze, audit, review, report, compile, collect, find, plan, prepare, draft, write) that contain no side-effect word (send, email, post, pay, wire, transfer, buy, deploy, delete, hire, sign, launch, run, schedule...) skip the approval request and go to normal chat, where every tool call is still permission-gated. Anything with a side-effect word is still intercepted. Default behaviour is unchanged. Files: `lib/task-gate.ts`, `lib/__tests__/task-gate.test.ts` (5 tests), `.env.example`.

Limit: it is a keyword list, evadable by phrasing. A missed word only means a harmless request is still intercepted; an evaded one still meets `checkPermission` on every tool call.

## Decision for Victor

To get agent-tier approvals, amend `CLAUDE.md` non-negotiable 4 and the protected-actions rule to say which Class C actions an AI approver may decide, and which never. Until then the smallest autonomy gain available is the opt-in switch above. Auto-approving the EAR for internal-analysis scope (agents run with no human yes) is a separate policy change that is also yours to make; I did not do it.
