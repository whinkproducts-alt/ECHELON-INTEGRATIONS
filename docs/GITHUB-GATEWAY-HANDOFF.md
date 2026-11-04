# Restricted GitHub gateway: current handoff

Updated 2026-11-04; source baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. See [audit evidence](ECHELON-AUDIT-HANDOFF-2026-11-04.md) and [gateway design](CAPABILITY-GATEWAY.md). Pilot code is already reconciled on main; do not replay the old integration branch.

## Implemented and automatically tested

- Owner queues a named-agent tool call through `/api/integrations/jobs`; existing scheduler/runner dispatches through `lib/worker/capability-execution.ts` and the capability policy/grant/permission/approval/ledger paths.
- Duplicate submissions reuse a job. Atomic dispatch is at most once; expired dispatch lease/uncertain transport stays UNKNOWN, never auto-replayed. Approval exactly-once consumption is not a guarantee of exactly-once external effects.
- Queue inputs and successful bounded results are encrypted. Job status is owner-scoped and marks provider result as untrusted. Ledger stores summaries/hashes, not raw result. Approval storage has separate existing semantics; interrupted queue/result retention cleanup remains unfinished.
- `apps/web/scripts/github-readonly-mcp.ts` is a loopback facade with one no-argument `repo_build_health` tool and a separate local bearer. It rejects extra arguments/methods/tool names.
- `apps/web/lib/github-readonly/report.ts` uses fixed configuration; verifies one-repo installation-token scope/read permissions, pins branch resolution to a commit, fetches bounded GitHub data reads, refuses redirects and marks incomplete/pending evidence UNVERIFIED. App-token minting is an authentication POST; no repository write operation is provided.
- Relevant tests: `github-readonly-report.test.ts`, `capability-worker.integration.test.ts`, `capability-gateway.integration.test.ts`, `capability-policy.test.ts`, and `e2e/tests/integrations.spec.ts`. Respect each mock/DB boundary.

Current main full CI and security pass; 2345 tests passed/39 skipped/22 browser passed. The original broader-suite failures in the old pilot handoff are historical, not current-main results. That does not establish live provider acceptance.

## Current credential and live evidence boundary

The Founder reported GitHub App creation, email verification and private-key download. **Installation, actual configured credentials and one successful live ECHELON worker report remain unverified.** No key or secret file was read by this documentation pass. Locate/confirm existing setup securely; do not claim no App exists, recreate it blindly, print private keys or treat Codex's authenticated GitHub access as the app connection.

## Secure configuration and next acceptance

1. Confirm the existing private App installation is limited to `whinkproducts-alt/ECHELON-CORP`, with read Contents, Checks, Commit statuses, Actions, Issues and Pull requests (plus GitHub's required metadata). No write permission.
2. Set the provider's private environment: `ECHELON_GITHUB_OWNER`, `ECHELON_GITHUB_REPO`, `ECHELON_GITHUB_BRANCH` (current chosen baseline normally `main`), `ECHELON_GITHUB_APP_ID`, `ECHELON_GITHUB_INSTALLATION_ID`, `ECHELON_GITHUB_PRIVATE_KEY_PATH`, `ECHELON_GITHUB_PROVIDER_TOKEN`, optional `ECHELON_GITHUB_PROVIDER_PORT` (default 3197). Never commit values. Key stays outside Git with restrictive access; gateway bearer is separate from the GitHub key/token.
3. Start the facade as a separate process with those settings and its dependencies loaded, e.g. from `apps/web`: `pnpm exec tsx --require dotenv/config scripts/github-readonly-mcp.ts`. Verify intended loopback port and `/mcp` endpoint; no unauthorized upload or broad App access.
4. Start the existing worker (`WORKER_ENABLED=true`, `pnpm --filter app worker` from repo root). The web server starts neither worker nor provider. Register host/heartbeat and provider, discover, review actual definition/data/cost ceiling, enable and grant only the one tool to the intended canonical agent/mission.
5. Queue an authorized real report. Record job ID, grant, gateway receipt, resolved commit, report source links and missing/pending/failing checks. Do not fetch raw untrusted build logs into model context.
6. Prove another repo and writes cannot be requested; revoke grant/provider and show refusal; inspect bounded/untrusted result handling before model use. Verify approval-required calls separately with exact request IDs. A UI status or fixture result cannot replace this journey.
7. Record failure/UNKNOWN and manual resolution; finish encrypted interrupted input/result retention/cleanup. Mac-off is a later real host/power-off gate, not established by the local run.

This handoff grants no new spend, deployment or write access. The earlier user authorization for the read-only pilot remains the task scope; check the actual current configuration and approvals before any live step.
