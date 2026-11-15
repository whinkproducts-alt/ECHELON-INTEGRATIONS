# Cross-department and cross-subsidiary requests, 2026-11-15

Committed locally unless noted in the daily sync.

## Cause of "blocked" broad requests

`lib/task-gate.ts` mapped keywords to skill names; 21 of 27 do not exist in `packages/org-kit/organization/workforce_registry.json`. The router reported each as a capability gap and the executor blocked the task.

## Changes (all in `apps/web`)

| File | Change |
|---|---|
| `lib/task-gate.ts` | Real skill ids; three keyword groups without a registry skill removed; suffix-aware matching; "compliance" no longer triggers security; `KEYWORD_SKILL_MAP` exported for the test |
| `lib/marcus/routing.ts` (new) | `matchDirectorate`, `parseSubsidiaries`, `subsidiaryContext` |
| `lib/marcus/intake.ts` | Optional `subsidiary`, `target_subsidiaries` (validated, 400 on unknown ids), `directorate` kept inside the encrypted task text |
| `lib/marcus/executor.ts` | Subsidiary line in the analysis objective, directorate steers the lead, precise blocked reason `too_many_departments` |
| `lib/__tests__/cross-department.test.ts` (new) | Every mapped skill has an eligible agent; five-department team has no gaps and passes admission; directorate steering; word forms; subsidiary names are not protected trades |
| `lib/__tests__/marcus.integration.test.ts`, `marcus-integration.test.ts` | Real-Postgres and unit cases for the above |

## Behaviour

- One skill per domain named, one specialist per department, up to 5 agents (the cap is enforced by `admittedAgents`). Six domains: blocked `too_many_departments`, approval kept, resumable after the request is split.
- Subsidiary ids come from `config/subsidiaries.json`. The agents belong to the group, so a subsidiary is a label that frames the analysis; it does not restrict which agents are chosen.

## Not done

- Marcus does not send the subsidiary fields yet: its `ALLOWED_FIELDS`, schema and task model need `subsidiary` and `target_subsidiaries` (its tables are created without migrations, so a new column needs a plan).
- No automatic splitting of requests beyond 5 domains.
- Social media, SEO and event requests match no skill and fall back to a generic reviewer.
- The chat path (task gate to approval request) gains the fixed skills but has no structured subsidiary field; a user can name subsidiaries in the text.
