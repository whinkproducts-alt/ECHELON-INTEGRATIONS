# ECHELON: what the harness actually is

Updated 2026-11-04. "Harness" can mean the software operating the coding model, the application's agent runtime, or its test runner. This project has all three; they are different trust and execution boundaries. This inventory is based on the repository and the observed Codex session. The supplied historical handoff attributes its work to Claude Code; that is not an independently verified history of every build session.

## Development harness

- **This work:** Codex desktop, operating the local Git checkout with shell/tools and independent assurance. It is a development environment, not ECHELON's deployed execution engine.
- **Other supplied work:** Claude Code is named in the imported handoff; `.claude/agents/` contains the build/review role instructions and `.claude/settings.json` its project configuration. These files configure development roles; they do not launch the product's 326 agents.
- `AGENTS.md`, `CLAUDE.md`, current architecture, daily sync, backlog and evidence carry the execution instructions. A model consumes these instructions; the model is not itself a harness. Do not switch models or claim a switch without evidence.
- Git/GitHub hold revisions, PRs and checks. The handoff's timed-out NVIDIA safety classifier describes that other session's reported tooling; it is not evidence of an installed ECHELON runtime component or a blocker in this Codex session.

## Application/agent harness — custom ECHELON/WHINK runtime

The product does **not** use the Codex desktop chat or Claude Code CLI as its standing production worker. Its current harness is the existing custom TypeScript runtime:

| Responsibility | Owning source under `apps/web/` |
|---|---|
| Authenticated UI and entry routes | Next.js app, Auth.js/session checks, `app/api/conversations/[id]/messages/route.ts` |
| Model transports | `lib/model-router.ts`, `lib/model-router-tools.ts` (Ollama/OpenAI-compatible, Anthropic, Gemini); selection helpers under `lib/model-router/` |
| Tool iteration | `lib/tool-loop.ts` → `lib/tool-registry.ts` → permission/protected-action checks, approvals and ledger |
| Durable scheduling and execution | `scripts/worker.ts`; `lib/worker/scheduler.ts`, `runner.ts`, `ear-execution.ts`, `capability-execution.ts`; Prisma `AgentJob`/`AgentExecution` state |
| Authority, audit and inference accounting | `lib/permission-engine.ts`, `protected-actions.ts`, `approvals.ts`, `ledger.ts`, `budget.ts`, `usage.ts`, `model-router/reservations.ts` |
| Provider/grant/host boundary | `lib/capability/`, Integration Hub routes and `lib/openclaw-client.ts` |
| Memory and learning | `lib/context-engine.ts`, `auto-memory.ts`, `orchestrator.ts`, `anythingllm-client.ts`, embedding router |
| Canonical identities and teams | Repo-root `packages/org-kit/`; registered identities do not imply simultaneous active model processes |
| Authoritative persistence | PostgreSQL + pgvector through Prisma; an old diagram saying SQLite is the main action ledger is not current evidence |

`services/openclaw` is **WHINK's own MCP aggregator**, confirmed by its README/package/source. It exposes reviewed upstream tools; it is not a wholesale installation of an upstream autonomous OpenClaw agent. The Integration Hub adds separate provider/host/grant policy and receipts. Its host-agent/stdio limits must not be confused with what the separate aggregator can run. Neither gateway grants authority above the application's owner/tenant/permission system.

Existing limits: bounded internal EAR analysis and owner-directed queued capability calls, not complete universal autonomy. Profile fallback is not yet wired across production dispatch; universal spend admission and full sealed-scope/in-flight controls are incomplete. See [completion architecture](product/ECHELON-END-TO-END-COMPLETION-PLAN.md).

## Verification harness

- **Vitest:** unit, route and contract suites plus explicitly unmocked database/MCP suites. Global Prisma and unlocked-safety test doubles exist; inspect each suite before claiming SQL/live enforcement.
- **PostgreSQL 16 + pgvector:** disposable CI DB for migrations, fixtures and selected execution/gateway tests. Personal databases must not be used for seeds/tests.
- **Playwright / Chromium:** separate `e2e/` package against the built app and real test DB, including auth, approvals and Integration Hub journeys. It does not prove real paid/provider/device operation.
- **GitHub Actions:** `.github/workflows/ci.yml` and `security.yml` run typecheck, lint, migrations, tests, default build, browser tests, production audit, secret scanning and CodeQL analysis with the documented scope.
- **Manual and physical acceptance:** owner Mac, actual model/voice, approved recipients, restore and power-off tests remain separate mandatory gates.

Commands, current recorded results and mock/skip boundaries are in [testing](testing.md). `scripts/ci/e2e-local.sh` is a local test orchestration script, not the daily desktop launcher. There is no tracked production Tauri desktop bundle or general autonomous agent SDK proven as the single project harness.

## Decision for completion

Keep and finish the existing governed runtime. Add the missing admission, privacy, integration and lifecycle seams in [the completion plan](product/ECHELON-END-TO-END-COMPLETION-PLAN.md); do not replace it with another orchestration framework to finish basic personal functionality. A future framework replacement requires its own evidence and decision, not an incidental dependency upgrade.
