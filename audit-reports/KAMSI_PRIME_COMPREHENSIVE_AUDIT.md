# KAMSI-PRIME / WHINK Ultimate — Comprehensive Repository Audit

## Executive summary

Substantial AI application and bounded execution infrastructure; 326 workforce definitions are real, but not 326 running autonomous agents. Executive hierarchy, founder intelligence, lifecycle governance and containment have material gaps.

**Audited commit:** `4a6763b2fcd23eae1a9feb4bebb59f465fe83939`. **Exported:** 2026-10-29T04:18:29.176185+00:00.

The 326-agent count is verified as registry data. It does not establish 326 running agents. Chat tool execution, scheduled jobs and text-only swarms are distinct implementations. Generic EAR approval returns a dispatch message; Kill Team assignment remains browser state; HOLO agent activity uses fixtures. No dedicated Marcus private-intelligence service, unified lockdown or complete agent lifecycle management was found.

**Read-only boundary:** no application code/configuration changed, no dependencies installed, no application/tests/builds/migrations/agents run, no deployment or external provider validation. Only these two requested report files were created. “Verified” always means source/static-data verification unless expressly stated. Historical test reports are not current test results.

## Status and identifier conventions

| Status | Meaning |
| --- | --- |
| implemented_and_verified | Established by inspected source or static data; NOT runtime tested |
| partially_implemented | Implementation elements exist, but material gaps or external dependencies remain |
| configuration_or_mockup_only | Records/prompts/UI without the claimed operational execution |
| missing | No implementation found in inspected repository; bounded negative finding |
| unable_to_verify | Requires unavailable runtime, credentials, external settings or operational evidence |

Shared IDs: AREA = audited area; ARCH/ORG/EXEC/KILL/AUTO/MEM/PRIV/GOV/SEC/PROJ/UI/INT/FIN/TEST = component; AGENT/TEAM/SKILL/DIR/DEPT/PERSONA/BOARD/SUB/JOB/SYSJOB/DEV/DEP/API/DB = inventory entity; GAP/RISK/CONFLICT = finding; ROAD = roadmap; E = evidence. Stable source agent_id values are also preserved.

## Current architecture and technology stack

### ARCH-001 — Workspace and toolchain

**Status:** implemented_and_verified. pnpm workspace includes apps/* and packages/*. Root engines Node >=20 and pnpm >=9; web Node >=20.9. README recommends Node 22+ and pnpm 10+; CI uses Node 22 and pnpm 10.28.0. Standalone services have independent npm lockfiles.

[E001: `package.json:1`](../package.json#L1); [E002: `pnpm-workspace.yaml:1`](../pnpm-workspace.yaml#L1); [E003: `apps/web/package.json:1`](../apps/web/package.json#L1); [E004: `.github/workflows/ci.yml:1`](../.github/workflows/ci.yml#L1); [E005: `README.md:1`](../README.md#L1)

### ARCH-002 — Next.js web application

**Status:** implemented_and_verified. Next.js 16.4.3, React/react-dom 19.2.8, TypeScript 5.6.3. App Router pages and server route handlers. Next config supports optional output mode/dist directory, transpiles org-kit, and supplies security headers.

[E006: `apps/web/package.json:1`](../apps/web/package.json#L1); [E007: `apps/web/next.config.js:1`](../apps/web/next.config.js#L1)

### ARCH-003 — UI and state dependencies

**Status:** implemented_and_verified. Tailwind 3.4.0, Radix/shadcn-style components, Framer Motion, Three.js, charting; Zustand, Jotai, React Query and SWR are declared. Declaration is not proof of use in each feature.

[E008: `apps/web/package.json:1`](../apps/web/package.json#L1)

### ARCH-004 — PostgreSQL and Prisma

**Status:** implemented_and_verified. PostgreSQL 16 with pgvector, Prisma 6.7.0; 66 schema models and 37 migration SQL files. Vector fields use 768 dimensions. Includes auth, projects, memory, approvals, contacts, contracts, jobs and swarm persistence.

[E009: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1); [E010: `docker-compose.yml:1`](../docker-compose.yml#L1); [E011: `docker/postgres/init.sql:1`](../docker/postgres/init.sql#L1)

### ARCH-005 — Local service deployment

**Status:** implemented_and_verified. Root Compose provides PostgreSQL, faster-whisper and Kokoro; host ports bind to loopback. PostgreSQL credentials in this file are explicitly local-development defaults and must be rotated for shared deployment.

[E012: `docker-compose.yml:1`](../docker-compose.yml#L1)

### ARCH-006 — AnythingLLM recall service

**Status:** partially_implemented. Container configured retrieval-only (LLM_PROVIDER=none), persistent storage, authentication, loopback exposure and resource limits. Per-user workspace retrieval/upload implementation exists; live API compatibility and service health were not tested.

[E013: `services/anythingllm/docker-compose.yml:1`](../services/anythingllm/docker-compose.yml#L1); [E014: `apps/web/lib/anythingllm-client.ts:1`](../apps/web/lib/anythingllm-client.ts#L1); [E015: `apps/web/app/api/documents/upload/route.ts:1`](../apps/web/app/api/documents/upload/route.ts#L1)

### ARCH-007 — OpenClaw MCP gateway

**Status:** partially_implemented. Custom TypeScript gateway provides authentication, namespacing, tool aggregation and per-call credentials. Hardened container; default config contains dev reference plus x/instagram/tiktok stdio upstreams. Third-party MCP servers are intended to run separately over HTTP. Reference server is excluded by default from product image builds but enabled in local Compose.

[E016: `services/openclaw/src/server.ts:1`](../services/openclaw/src/server.ts#L1); [E017: `services/openclaw/src/config.ts:1`](../services/openclaw/src/config.ts#L1); [E018: `services/openclaw/config/servers.json:1`](../services/openclaw/config/servers.json#L1); [E019: `services/openclaw/docker-compose.yml:1`](../services/openclaw/docker-compose.yml#L1); [E020: `services/openclaw/Dockerfile:1`](../services/openclaw/Dockerfile#L1); [E021: `services/openclaw/README.md:1`](../services/openclaw/README.md#L1)

### ARCH-008 — Model routing and providers

**Status:** partially_implemented. Anthropic and Google SDK paths plus OpenAI-compatible and native Ollama transports exist. Cloud/provider credentials and model availability unverified. streamChat/chatOnce fallback model names differ; automatic helper includes claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5. These IDs were not validated against providers.

[E022: `apps/web/lib/model-router.ts:1`](../apps/web/lib/model-router.ts#L1); [E023: `apps/web/lib/model-router-tools.ts:1`](../apps/web/lib/model-router-tools.ts#L1); [E024: `apps/web/lib/model-policy.ts:1`](../apps/web/lib/model-policy.ts#L1)

### ARCH-009 — Cloud storage declarations

**Status:** configuration_or_mockup_only. AWS S3 and Azure Blob SDKs are declared. Inspected document upload uses AnythingLLM; functioning S3/Azure application storage workflow not established.

[E025: `apps/web/package.json:1`](../apps/web/package.json#L1); [E026: `apps/web/app/api/documents/upload/route.ts:1`](../apps/web/app/api/documents/upload/route.ts#L1)

### ARCH-010 — Standalone content analyst

**Status:** partially_implemented. Gemini video-analysis CLI with video-download analysis flow; README requires external yt-dlp. Separately packaged; no end-to-end validation or main app integration established.

[E027: `services/whink-content-analyst/README.md:1`](../services/whink-content-analyst/README.md#L1); [E028: `services/whink-content-analyst/analyst.js:1`](../services/whink-content-analyst/analyst.js#L1); [E029: `services/whink-content-analyst/package.json:1`](../services/whink-content-analyst/package.json#L1)

### ARCH-011 — Production/cloud infrastructure

**Status:** unable_to_verify. Compose, service Dockerfiles, Next build/start and macOS worker launch-agent example exist. No complete production IaC, Kubernetes/Terraform deployment, autoscaling agent fleet or disaster-recovery deployment was established. Render references do not prove an active deployment.

[E030: `apps/web/next.config.js:1`](../apps/web/next.config.js#L1); [E031: `docs/whink-worker.plist.example:1`](../docs/whink-worker.plist.example#L1); [E032: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1)

```text
Conversation UI -> authenticated messages API -> orchestrator
 -> context assembly + persona prompt -> model/tool loop
 -> permission engine -> local handler or MCP gateway
 -> action ledger + persisted messages -> SSE response

Separate bounded execution paths:
  generic org-kit task -> proposed team -> EAR approval -> dispatch text
  swarm plan -> explicit start -> DAG model tasks -> review/integration -> result
  standing roster -> PostgreSQL leases -> worker jobs -> memory/recommendations
```

## Implementation status of all 14 audited areas

### AREA-01 — Executive agents

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**EXEC-001 — WHINK** (implemented_and_verified)

Primary calm, strategic, analytical, skeptical and commercially aware persona. Shared prompt/orchestrator/tool execution architecture. CEO in leadership; Chief of Staff / Managing Director in board. Persona is not permission.

Evidence: [E049: `apps/web/prompts/persona-whink.ts:1`](../apps/web/prompts/persona-whink.ts#L1); [E050: `apps/web/prompts/build-prompt.ts:1`](../apps/web/prompts/build-prompt.ts#L1); [E051: `apps/web/lib/orchestrator.ts:1`](../apps/web/lib/orchestrator.ts#L1); [E052: `apps/web/config/board.json:1`](../apps/web/config/board.json#L1)

**EXEC-002 — MAMBA** (implemented_and_verified)

Adversarial, cold, calm, skeptical, incisive and slightly sardonic strategic persona. OBSIDIAN is the sole overlay; lawful opponent moves and mitigations. Peer Consigliere in leadership, subsystem in prompt, Chief Executive Operating Officer / Consigliere in board. No separate privilege escalation.

Evidence: [E053: `apps/web/prompts/persona-mamba.ts:1`](../apps/web/prompts/persona-mamba.ts#L1); [E054: `apps/web/prompts/mamba-modes.ts:1`](../apps/web/prompts/mamba-modes.ts#L1); [E055: `apps/web/app/api/persona/switch/route.ts:1`](../apps/web/app/api/persona/switch/route.ts#L1); [E056: `apps/web/lib/types.ts:1`](../apps/web/lib/types.ts#L1)

**EXEC-003 — Marcus Vale** (configuration_or_mockup_only)

Staff directory marks Marcus kind=human, active Executive Assistant reporting to Victor. Board seat is Chief Executive Assistant, Office of Founder; email, portrait and meeting-host role exist. No Marcus-specific AI runtime/personality, private-intelligence service or specialist reporting implementation found.

Evidence: [E057: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E058: `apps/web/config/board.json:1`](../apps/web/config/board.json#L1); [E059: `apps/web/components/screens/meeting/props.ts:1`](../apps/web/components/screens/meeting/props.ts#L1); [E060: `apps/web/lib/meetings/provider.ts:1`](../apps/web/lib/meetings/provider.ts#L1)

**EXEC-004 — Board governance workspace** (partially_implemented)

Eight records: Victor, Marcus, WHINK, MAMBA, Anthony, Dr Tinaye, Barrister Genevieve and Juliet. Board UI, per-user meetings and minutes persistence exist. Appointments are repository declarations; no autonomous board voting/deliberation established.

Evidence: [E061: `apps/web/config/board.json:1`](../apps/web/config/board.json#L1); [E062: `apps/web/lib/board-meetings.ts:1`](../apps/web/lib/board-meetings.ts#L1); [E063: `apps/web/components/screens/board/board-screen.tsx:1`](../apps/web/components/screens/board/board-screen.tsx#L1)

### AREA-02 — Organizational structure

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**ORG-001 — Canonical organization** (implemented_and_verified)

15 canonical directorates, 126 departments, 163 teams, 326 unique named workforce agents. Leadership records and department heads are organizational data, not executable authority grants.

Evidence: [E033: `packages/org-kit/organization/whink_group_leadership.json:1`](../packages/org-kit/organization/whink_group_leadership.json#L1); [E034: `packages/org-kit/organization/team_registry.json:1`](../packages/org-kit/organization/team_registry.json#L1); [E035: `packages/org-kit/organization/workforce_registry.json:1`](../packages/org-kit/organization/workforce_registry.json#L1); [E036: `packages/org-kit/manifest.json:1`](../packages/org-kit/manifest.json#L1)

**ORG-002 — Innovation and Opportunity** (partially_implemented)

Five additional named personas form a separately defined directorate: Amara Okafor, Mateo Restrepo, Priya Raghunathan, Soren O'Connell, Mei-Ling Tan. Amara reports to Victor; four report to Amara. Supports conceptual 16-directorate count, but absent from canonical org-kit. Staff records pending while jobs enabled is a separate status model.

Evidence: [E037: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E038: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E039: `CLAUDE.md:85`](../CLAUDE.md#L85)

**ORG-003 — Subsidiaries and executive authority** (configuration_or_mockup_only)

Five subsidiaries have names, service descriptions, directors and project association. Whink Consult: Victor Igboekwe; Real Estate: Whitney Brown; Trades & Investments: Juliet Igboekwe; Apps: Anthony Igboekwe; Frontliners: Dr Tinaye Lydia Muzenyi. These are recorded executives, not implemented autonomous subsidiary Managing Directors. Trading bot is described as coming soon.

Evidence: [E040: `apps/web/config/subsidiaries.json:1`](../apps/web/config/subsidiaries.json#L1); [E041: `apps/web/lib/subsidiaries.ts:1`](../apps/web/lib/subsidiaries.ts#L1)

### AREA-03 — Agent registry

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**ORG-004 — Workforce registry capabilities** (implemented_and_verified)

326 IDs and names unique; 163 Principal Specialists and 163 Analysts & Reviewers, exactly two per team. All dormant, autonomy 2, provider_binding null, tools empty. No personality/system prompt fields. permissions advice/draft/prepare; task_start/public_action/financial_commitment/material_memory_write approvals recorded. All agent skill references resolve. All reports_to_human values match corresponding department heads.

Evidence: [E042: `packages/org-kit/organization/workforce_registry.json:1`](../packages/org-kit/organization/workforce_registry.json#L1); [E043: `packages/org-kit/agents/AGENT_SCHEMA.json:1`](../packages/org-kit/agents/AGENT_SCHEMA.json#L1); [E044: `apps/web/lib/agent-loader.ts:1`](../apps/web/lib/agent-loader.ts#L1)

**ORG-005 — 570 skill definitions and validator** (partially_implemented)

570 unique skill IDs; all tools_required empty. Structured contracts, not 570 executable implementations. Validator implements 32 derived rules across seven categories; source explicitly says canonical rule list was not found. Loader checks manifest counts and does not activate agents.

Evidence: [E045: `packages/org-kit/skills/skill_registry.json:1`](../packages/org-kit/skills/skill_registry.json#L1); [E046: `packages/org-kit/skills/shared/SKILL_CONTRACT.yaml:1`](../packages/org-kit/skills/shared/SKILL_CONTRACT.yaml#L1); [E047: `apps/web/lib/agent-validator.ts:1`](../apps/web/lib/agent-validator.ts#L1); [E048: `apps/web/lib/agent-loader.ts:1`](../apps/web/lib/agent-loader.ts#L1)

### AREA-04 — Kill Team

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**KILL-001 — Five specialist personas** (partially_implemented)

PETER forensics; PAUL clean-room reconstruction; MICAH product audit; NANDI growth/revenue; SCOUT display name Michael Carrick, research/opportunities. Selectable through common chat prompt path. No separate specialist worker processes or Marcus command hierarchy.

Evidence: [E064: `apps/web/prompts/persona-peter.ts:1`](../apps/web/prompts/persona-peter.ts#L1); [E065: `apps/web/prompts/persona-paul.ts:1`](../apps/web/prompts/persona-paul.ts#L1); [E066: `apps/web/prompts/persona-micah.ts:1`](../apps/web/prompts/persona-micah.ts#L1); [E067: `apps/web/prompts/persona-nandi.ts:1`](../apps/web/prompts/persona-nandi.ts#L1); [E068: `apps/web/prompts/persona-scout.ts:1`](../apps/web/prompts/persona-scout.ts#L1); [E069: `apps/web/prompts/build-prompt.ts:1`](../apps/web/prompts/build-prompt.ts#L1)

**KILL-002 — Kill Team objective console** (configuration_or_mockup_only)

Six cards including REGISTRATION. assignObjective updates React setBrief only: no API call, persistent task or dispatch. Founder prop controls assignment UI. Allowed without another approval text is not executable policy. Main five persona switches are not founder-only.

Evidence: [E070: `apps/web/components/screens/kill-team/kill-team-screen.tsx:27`](../apps/web/components/screens/kill-team/kill-team-screen.tsx#L27); [E071: `apps/web/app/dashboard/kill-team/page.tsx:1`](../apps/web/app/dashboard/kill-team/page.tsx#L1); [E072: `apps/web/app/api/persona/switch/route.ts:1`](../apps/web/app/api/persona/switch/route.ts#L1)

**KILL-003 — Website Registration specialist** (partially_implemented)

Founder-only REGISTRATION switch; planning and guidance prompt. Explicitly no Gmail adapter, password vault or arbitrary-site automation. Cannot create accounts or verify email autonomously. Stops on billing ambiguity.

Evidence: [E073: `apps/web/prompts/persona-registration.ts:1`](../apps/web/prompts/persona-registration.ts#L1); [E074: `apps/web/app/api/persona/switch/route.ts:1`](../apps/web/app/api/persona/switch/route.ts#L1)

### AREA-05 — Autonomous operations

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**AUTO-001 — Org-kit task selection and EAR** (partially_implemented)

Keyword task gate and skill coverage router propose smallest competent team, maximum five by default. Router calls no provider. EAR approval branch returns buildDispatchMessage; it does not launch proposed workers. Generic approval EXECUTED status is not proof of completed agent task.

Evidence: [E075: `apps/web/lib/task-gate.ts:1`](../apps/web/lib/task-gate.ts#L1); [E076: `packages/org-kit/src/router.ts:1`](../packages/org-kit/src/router.ts#L1); [E077: `apps/web/lib/approvals.ts:85`](../apps/web/lib/approvals.ts#L85)

**AUTO-002 — Chat agentic tools** (implemented_and_verified)

Authenticated messages pass orchestrator/injection checks, context/prompt assembly, model policy/BYOK/local-only checks, tool resolution and tool loop. Five iterations/eight calls maximum. Tool outcomes pass permissions and ledger; unsupported tool providers can fall back to text streaming.

Evidence: [E078: `apps/web/app/api/conversations/[id]/messages/route.ts:1`](../apps/web/app/api/conversations/[id]/messages/route.ts#L1); [E079: `apps/web/lib/tool-loop.ts:1`](../apps/web/lib/tool-loop.ts#L1); [E080: `apps/web/lib/tool-registry.ts:1`](../apps/web/lib/tool-registry.ts#L1); [E081: `apps/web/lib/gateway-chat.ts:1`](../apps/web/lib/gateway-chat.ts#L1)

**AUTO-003 — Swarm engine** (partially_implemented)

Separate plan/start path; DAG workers/reviewers/redteam/integrators/lead, database claims, retries, timeout, heartbeat, cancellation and finalization. Agents receive no tools and return strict JSON; memory_read/document_search names are only an upper-bound allowlist, not supplied tools. No autonomous code deployment.

Evidence: [E082: `apps/web/lib/swarm/service.ts:1`](../apps/web/lib/swarm/service.ts#L1); [E083: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E084: `apps/web/lib/swarm/agent-call.ts:1`](../apps/web/lib/swarm/agent-call.ts#L1); [E085: `apps/web/lib/swarm/finalize.ts:1`](../apps/web/lib/swarm/finalize.ts#L1); [E086: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1)

**AUTO-004 — Standing scheduled operations** (partially_implemented)

28 roster entries: 21 enabled, seven standby; five innovation, six news, five subsidiary monitors, three security, two memory jobs enabled. Two additional system jobs skills_sweeper/swarm_resume every five minutes. Worker defaults concurrency 3; requires separate running process. PostgreSQL leases, backoff, heartbeat, discovery and budgets implemented.

Evidence: [E087: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E088: `apps/web/lib/worker/roster.ts:1`](../apps/web/lib/worker/roster.ts#L1); [E089: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1); [E090: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E091: `apps/web/scripts/worker.ts:1`](../apps/web/scripts/worker.ts#L1)

**AUTO-005 — Agent lifecycle and cloud fleet** (missing)

Governance state labels exist. No complete recruitment/provisioning, promotion, retirement/reinstatement APIs, recursive subagent hierarchy or autoscaling cloud worker fleet found. Swarm assignment/load balancer exclude suspended/retired, while reference router merely penalizes suspended and does not explicitly exclude retired.

Evidence: [E092: `packages/org-kit/governance/core_governance.yaml:1`](../packages/org-kit/governance/core_governance.yaml#L1); [E093: `packages/org-kit/src/router.ts:1`](../packages/org-kit/src/router.ts#L1); [E094: `apps/web/lib/load-balancer.ts:1`](../apps/web/lib/load-balancer.ts#L1); [E095: `apps/web/lib/swarm/assign.ts:1`](../apps/web/lib/swarm/assign.ts#L1)

**AUTO-006 — Development agents** (configuration_or_mockup_only)

13 Claude agent definition files: whink, lead-architect, backend-engineer, frontend-engineer, integrations-engineer, devops-engineer, security-reviewer, test-engineer, qa-engineer, ai-evaluator, brand-guardian, compliance-checker, performance-benchmarker. Development-tool instructions, outside workforce count; not executed during audit.

Evidence: [E096: `.claude/agents/whink.md:1`](../.claude/agents/whink.md#L1); [E097: `CLAUDE.md:67`](../CLAUDE.md#L67)

### AREA-06 — Central memory

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**MEM-001 — Central knowledge and retrieval** (implemented_and_verified)

Semantic/episodic/procedural memories, hypotheses, working memory and entities. pgvector, PostgreSQL fulltext, reciprocal-rank fusion and fallback search. Shared personas with user/project scoping. Context assembly budget is 80000 tokens by four-character approximation; actual assembled context varies.

Evidence: [E098: `apps/web/lib/memory-engine.ts:1`](../apps/web/lib/memory-engine.ts#L1); [E099: `apps/web/lib/context-engine.ts:1`](../apps/web/lib/context-engine.ts#L1); [E100: `apps/web/lib/working-memory.ts:1`](../apps/web/lib/working-memory.ts#L1); [E101: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1)

**MEM-002 — Learning and confidence firewall** (implemented_and_verified)

Auto extraction/completed-turn recording includes provenance, daily caps, secret filtering, deduplication, permission and taint checks. MAMBA hypotheses <=0.4; auto memory <=0.8. Embedding failures are nonblocking. Agent lessons and task handoffs persist.

Evidence: [E102: `apps/web/lib/auto-memory.ts:1`](../apps/web/lib/auto-memory.ts#L1); [E103: `apps/web/lib/embedding-service.ts:1`](../apps/web/lib/embedding-service.ts#L1); [E104: `apps/web/lib/agent-memory.ts:1`](../apps/web/lib/agent-memory.ts#L1); [E105: `apps/web/lib/task-handoff.ts:1`](../apps/web/lib/task-handoff.ts#L1)

**MEM-003 — Consolidation, versioning and retention** (partially_implemented)

Nightly deduplication supersedes near duplicates; stale low-confidence non-KNOWN records decay. KNOWN memories protected; curation deletes nothing. Supersession, validity and provenance fields exist, but no comprehensive retention/purge/restore or full knowledge version-control system established.

Evidence: [E106: `apps/web/lib/worker/jobs/memory-curation.ts:1`](../apps/web/lib/worker/jobs/memory-curation.ts#L1); [E107: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1)

### AREA-07 — Founder privacy

**Overall assessment:** missing. Individual capabilities below retain their more precise status.

**PRIV-001 — Founder-private intelligence** (missing)

No Marcus-specific private-intelligence store, service, prompt or restricted reporting channel found. Normal owner/account checks exist, but no dedicated founder-confidential classification/compartment model established. Missing status is bounded to repository evidence, not external systems.

Evidence: [E108: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E109: `apps/web/lib/project-access.ts:1`](../apps/web/lib/project-access.ts#L1); [E110: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1)

**PRIV-002 — Knowledge access boundaries** (partially_implemented)

Account lessons plus accountId=null global curated lessons are intentionally shared. Confidential publishing controls need explicit policy. Project ownership is enforced in inspected routes; ProjectMember schema alone does not establish department-level delegation or founder compartments.

Evidence: [E111: `apps/web/lib/agent-memory.ts:1`](../apps/web/lib/agent-memory.ts#L1); [E112: `apps/web/lib/project-access.ts:1`](../apps/web/lib/project-access.ts#L1); [E113: `apps/web/lib/context-engine.ts:1`](../apps/web/lib/context-engine.ts#L1)

### AREA-08 — Governance

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**GOV-001 — Permission and delegation engine** (implemented_and_verified)

Class A automatic; Class B with autonomy >=2 or active capability delegation; Class C explicit approval. Protected money/proprietary egress cannot be downgraded. Persona never grants permission. Governed server actions use capability classes.

Evidence: [E114: `apps/web/lib/permission-engine.ts:1`](../apps/web/lib/permission-engine.ts#L1); [E115: `apps/web/lib/protected-actions.ts:1`](../apps/web/lib/protected-actions.ts#L1); [E116: `apps/web/lib/guarded-action.ts:1`](../apps/web/lib/guarded-action.ts#L1)

**GOV-002 — Approvals and recovery states** (implemented_and_verified)

Request-specific content hashes, 30-second expiry, atomic PENDING -> EXECUTING, consumed-state checks, scheduled content/tool-definition locks. Autonomy increases require approval. Stuck EXECUTING >2min failed, not re-run. No late-approval council active in inspected path.

Evidence: [E117: `apps/web/lib/approvals.ts:1`](../apps/web/lib/approvals.ts#L1); [E118: `apps/web/lib/canonical-json.ts:1`](../apps/web/lib/canonical-json.ts#L1); [E119: `apps/web/lib/autonomy-approval.ts:1`](../apps/web/lib/autonomy-approval.ts#L1); [E120: `docs/HANDOFF.md:1`](../docs/HANDOFF.md#L1)

**GOV-003 — Audit and escalation** (partially_implemented)

Shared ledger and security summaries exist; handoffs and capability gaps can identify blockers. No unified organizational escalation chain or tamper-proof externally retained audit evidence established.

Evidence: [E121: `apps/web/lib/ledger.ts:1`](../apps/web/lib/ledger.ts#L1); [E122: `apps/web/lib/ledger-search.ts:1`](../apps/web/lib/ledger-search.ts#L1); [E123: `apps/web/lib/security-status.ts:1`](../apps/web/lib/security-status.ts#L1); [E124: `apps/web/lib/task-handoff.ts:1`](../apps/web/lib/task-handoff.ts#L1)

### AREA-09 — Security

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**SEC-001 — Authentication and secrets** (implemented_and_verified)

NextAuth credentials/bcrypt, passkeys, session-version invalidation, password reset; AES-256-GCM user-key storage. Environment-based operator credentials; no secret values inspected for audit.

Evidence: [E125: `apps/web/auth.ts:1`](../apps/web/auth.ts#L1); [E126: `apps/web/lib/key-encryption.ts:1`](../apps/web/lib/key-encryption.ts#L1); [E127: `apps/web/lib/auth/password-reset.ts:1`](../apps/web/lib/auth/password-reset.ts#L1); [E128: `apps/web/lib/passkeys/guard.ts:1`](../apps/web/lib/passkeys/guard.ts#L1)

**SEC-002 — Input, network and workspace hardening** (implemented_and_verified)

Untrusted wrappers, injection scanning, taint, CSRF/CSP/security headers, rate limits, SSRF/DNS checks, owner-only fenced read-only workspace tools, secret redaction and Local-Only enforcement exist. Source verification does not establish exhaustive security assurance.

Evidence: [E129: `apps/web/lib/content-isolation.ts:1`](../apps/web/lib/content-isolation.ts#L1); [E130: `apps/web/lib/tool-registry.ts:1`](../apps/web/lib/tool-registry.ts#L1); [E131: `apps/web/lib/csrf.ts:1`](../apps/web/lib/csrf.ts#L1); [E132: `apps/web/lib/csp.ts:1`](../apps/web/lib/csp.ts#L1); [E133: `apps/web/lib/rate-limit.ts:1`](../apps/web/lib/rate-limit.ts#L1); [E134: `apps/web/lib/workspace-tools/sandbox.ts:1`](../apps/web/lib/workspace-tools/sandbox.ts#L1); [E135: `apps/web/lib/workspace-tools/access.ts:1`](../apps/web/lib/workspace-tools/access.ts#L1); [E136: `apps/web/lib/local-only.ts:1`](../apps/web/lib/local-only.ts#L1)

**SEC-003 — Emergency stop, lockdown and reinstatement** (missing)

No unified durable containment state across chat/tools/workers/swarms/outbound services found. Swarm cancellation is local to runs; Local-Only is configuration, not incident-response credential revocation. No full recovery/reinstatement workflow or restoration evidence established.

Evidence: [E137: `apps/web/lib/swarm/service.ts:1`](../apps/web/lib/swarm/service.ts#L1); [E138: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E139: `apps/web/lib/local-only.ts:1`](../apps/web/lib/local-only.ts#L1); [E140: `apps/web/lib/security-status.ts:1`](../apps/web/lib/security-status.ts#L1)

**SEC-004 — Threat monitoring** (partially_implemented)

Security watch jobs and security dashboard inspect ledger events and write recommendations. Does not establish active endpoint protection, external SIEM, automated containment or vulnerability remediation.

Evidence: [E141: `apps/web/lib/worker/jobs/security-watch.ts:1`](../apps/web/lib/worker/jobs/security-watch.ts#L1); [E142: `apps/web/lib/security-status.ts:1`](../apps/web/lib/security-status.ts#L1); [E143: `apps/web/components/screens/security/security-screen.tsx:1`](../apps/web/components/screens/security/security-screen.tsx#L1)

### AREA-10 — Project management

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**PROJ-001 — Subsidiary project management** (partially_implemented)

Project owner/subsidiary association, task status/priority/assignee text/dependencies/due dates, milestones, decisions, risks, questions and reports implemented. Assignee text is not executable agent dispatch. No enforced subsidiary-MD authority graph.

Evidence: [E144: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1); [E145: `apps/web/app/api/projects/route.ts:1`](../apps/web/app/api/projects/route.ts#L1); [E146: `apps/web/app/api/tasks/route.ts:1`](../apps/web/app/api/tasks/route.ts#L1); [E147: `apps/web/app/api/projects/[id]/report/route.ts:1`](../apps/web/app/api/projects/[id]/report/route.ts#L1)

**PROJ-002 — Budgets, contracts and expenditure** (partially_implemented)

Contract CRUD/value/renewal analytics and user token budgets exist. No complete project expenditure/purchase/reconciliation ledger established. Usage has no project/swarm linkage for subsidiary attribution; finance explicitly reports omission.

Evidence: [E148: `apps/web/lib/contracts/service.ts:1`](../apps/web/lib/contracts/service.ts#L1); [E149: `apps/web/lib/finance/summary.ts:1`](../apps/web/lib/finance/summary.ts#L1); [E150: `apps/web/lib/budget.ts:1`](../apps/web/lib/budget.ts#L1); [E151: `apps/web/lib/usage.ts:1`](../apps/web/lib/usage.ts#L1)

### AREA-11 — Executive interface

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**UI-001 — Founder dashboard and HOLO** (partially_implemented)

Rich dashboard/HOLO rendering, avatars, real ledger and approval requests. HOLO agent activity explicitly uses fixtureAgents and fixtureTick, not a live registry/execution feed.

Evidence: [E152: `apps/web/components/holo/holo-surface.tsx:109`](../apps/web/components/holo/holo-surface.tsx#L109); [E153: `apps/web/components/holo/holo-fixtures.ts:1`](../apps/web/components/holo/holo-fixtures.ts#L1); [E154: `apps/web/components/holo/holo-orb-field.tsx:1`](../apps/web/components/holo/holo-orb-field.tsx#L1)

**UI-002 — Interactive organizational chart** (partially_implemented)

Search/filter/cards/drawers and keyboard navigation implemented. Server supplies STAFF_DIRECTORY (seven entries, two directory groups), not 326 canonical workforce records.

Evidence: [E155: `apps/web/app/dashboard/directory/page.tsx:1`](../apps/web/app/dashboard/directory/page.tsx#L1); [E156: `apps/web/components/screens/directory/directory-screen.tsx:1`](../apps/web/components/screens/directory/directory-screen.tsx#L1); [E157: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1)

**UI-003 — Meeting rooms** (partially_implemented)

Authenticated permission-checked quick start mints random room URL under configured self-hosted HTTPS/loopback provider. No provider network call, automatic participant invitation or Marcus attendance. Without configuration returns no room.

Evidence: [E158: `apps/web/lib/meetings/provider.ts:1`](../apps/web/lib/meetings/provider.ts#L1); [E159: `apps/web/app/api/meetings/quick-start/route.ts:1`](../apps/web/app/api/meetings/quick-start/route.ts#L1); [E160: `apps/web/components/screens/meeting/meeting-screen.tsx:1`](../apps/web/components/screens/meeting/meeting-screen.tsx#L1)

**UI-004 — Avatars, voice and gesture interaction** (partially_implemented)

Avatar state/transition and mouth/audio-related code/assets, browser/server voice hook, gesture recognition/validation/HMAC/dispatch paths exist. Hardware performance and end-to-end voice not tested. Animations/transitions exist; no complete command-driven executive cinematic sequence established.

Evidence: [E161: `apps/web/components/avatar/avatar-engine.ts:1`](../apps/web/components/avatar/avatar-engine.ts#L1); [E162: `apps/web/lib/hooks/useVoice.ts:1`](../apps/web/lib/hooks/useVoice.ts#L1); [E163: `apps/web/app/api/voice/stt/route.ts:1`](../apps/web/app/api/voice/stt/route.ts#L1); [E164: `apps/web/app/api/voice/tts/route.ts:1`](../apps/web/app/api/voice/tts/route.ts#L1); [E165: `apps/web/lib/gesture/recognize.ts:1`](../apps/web/lib/gesture/recognize.ts#L1); [E166: `apps/web/lib/gesture/hmac.ts:1`](../apps/web/lib/gesture/hmac.ts#L1); [E167: `apps/web/lib/gesture/dispatch.ts:1`](../apps/web/lib/gesture/dispatch.ts#L1)

### AREA-12 — Infrastructure

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**ARCH-001 — Workspace and toolchain** (implemented_and_verified)

pnpm workspace includes apps/* and packages/*. Root engines Node >=20 and pnpm >=9; web Node >=20.9. README recommends Node 22+ and pnpm 10+; CI uses Node 22 and pnpm 10.28.0. Standalone services have independent npm lockfiles.

Evidence: [E001: `package.json:1`](../package.json#L1); [E002: `pnpm-workspace.yaml:1`](../pnpm-workspace.yaml#L1); [E003: `apps/web/package.json:1`](../apps/web/package.json#L1); [E004: `.github/workflows/ci.yml:1`](../.github/workflows/ci.yml#L1); [E005: `README.md:1`](../README.md#L1)

**ARCH-002 — Next.js web application** (implemented_and_verified)

Next.js 16.4.3, React/react-dom 19.2.8, TypeScript 5.6.3. App Router pages and server route handlers. Next config supports optional output mode/dist directory, transpiles org-kit, and supplies security headers.

Evidence: [E006: `apps/web/package.json:1`](../apps/web/package.json#L1); [E007: `apps/web/next.config.js:1`](../apps/web/next.config.js#L1)

**ARCH-003 — UI and state dependencies** (implemented_and_verified)

Tailwind 3.4.0, Radix/shadcn-style components, Framer Motion, Three.js, charting; Zustand, Jotai, React Query and SWR are declared. Declaration is not proof of use in each feature.

Evidence: [E008: `apps/web/package.json:1`](../apps/web/package.json#L1)

**ARCH-004 — PostgreSQL and Prisma** (implemented_and_verified)

PostgreSQL 16 with pgvector, Prisma 6.7.0; 66 schema models and 37 migration SQL files. Vector fields use 768 dimensions. Includes auth, projects, memory, approvals, contacts, contracts, jobs and swarm persistence.

Evidence: [E009: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1); [E010: `docker-compose.yml:1`](../docker-compose.yml#L1); [E011: `docker/postgres/init.sql:1`](../docker/postgres/init.sql#L1)

**ARCH-005 — Local service deployment** (implemented_and_verified)

Root Compose provides PostgreSQL, faster-whisper and Kokoro; host ports bind to loopback. PostgreSQL credentials in this file are explicitly local-development defaults and must be rotated for shared deployment.

Evidence: [E012: `docker-compose.yml:1`](../docker-compose.yml#L1)

**ARCH-006 — AnythingLLM recall service** (partially_implemented)

Container configured retrieval-only (LLM_PROVIDER=none), persistent storage, authentication, loopback exposure and resource limits. Per-user workspace retrieval/upload implementation exists; live API compatibility and service health were not tested.

Evidence: [E013: `services/anythingllm/docker-compose.yml:1`](../services/anythingllm/docker-compose.yml#L1); [E014: `apps/web/lib/anythingllm-client.ts:1`](../apps/web/lib/anythingllm-client.ts#L1); [E015: `apps/web/app/api/documents/upload/route.ts:1`](../apps/web/app/api/documents/upload/route.ts#L1)

**ARCH-007 — OpenClaw MCP gateway** (partially_implemented)

Custom TypeScript gateway provides authentication, namespacing, tool aggregation and per-call credentials. Hardened container; default config contains dev reference plus x/instagram/tiktok stdio upstreams. Third-party MCP servers are intended to run separately over HTTP. Reference server is excluded by default from product image builds but enabled in local Compose.

Evidence: [E016: `services/openclaw/src/server.ts:1`](../services/openclaw/src/server.ts#L1); [E017: `services/openclaw/src/config.ts:1`](../services/openclaw/src/config.ts#L1); [E018: `services/openclaw/config/servers.json:1`](../services/openclaw/config/servers.json#L1); [E019: `services/openclaw/docker-compose.yml:1`](../services/openclaw/docker-compose.yml#L1); [E020: `services/openclaw/Dockerfile:1`](../services/openclaw/Dockerfile#L1); [E021: `services/openclaw/README.md:1`](../services/openclaw/README.md#L1)

**ARCH-008 — Model routing and providers** (partially_implemented)

Anthropic and Google SDK paths plus OpenAI-compatible and native Ollama transports exist. Cloud/provider credentials and model availability unverified. streamChat/chatOnce fallback model names differ; automatic helper includes claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5. These IDs were not validated against providers.

Evidence: [E022: `apps/web/lib/model-router.ts:1`](../apps/web/lib/model-router.ts#L1); [E023: `apps/web/lib/model-router-tools.ts:1`](../apps/web/lib/model-router-tools.ts#L1); [E024: `apps/web/lib/model-policy.ts:1`](../apps/web/lib/model-policy.ts#L1)

**ARCH-009 — Cloud storage declarations** (configuration_or_mockup_only)

AWS S3 and Azure Blob SDKs are declared. Inspected document upload uses AnythingLLM; functioning S3/Azure application storage workflow not established.

Evidence: [E025: `apps/web/package.json:1`](../apps/web/package.json#L1); [E026: `apps/web/app/api/documents/upload/route.ts:1`](../apps/web/app/api/documents/upload/route.ts#L1)

**ARCH-010 — Standalone content analyst** (partially_implemented)

Gemini video-analysis CLI with video-download analysis flow; README requires external yt-dlp. Separately packaged; no end-to-end validation or main app integration established.

Evidence: [E027: `services/whink-content-analyst/README.md:1`](../services/whink-content-analyst/README.md#L1); [E028: `services/whink-content-analyst/analyst.js:1`](../services/whink-content-analyst/analyst.js#L1); [E029: `services/whink-content-analyst/package.json:1`](../services/whink-content-analyst/package.json#L1)

**ARCH-011 — Production/cloud infrastructure** (unable_to_verify)

Compose, service Dockerfiles, Next build/start and macOS worker launch-agent example exist. No complete production IaC, Kubernetes/Terraform deployment, autoscaling agent fleet or disaster-recovery deployment was established. Render references do not prove an active deployment.

Evidence: [E030: `apps/web/next.config.js:1`](../apps/web/next.config.js#L1); [E031: `docs/whink-worker.plist.example:1`](../docs/whink-worker.plist.example#L1); [E032: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1)

**INT-001 — Connector catalog versus runtime evidence** (partially_implemented)

18 catalog entries. Gmail/Google Calendar/Drive have no adapter. Slack/GitHub/Figma/Notion/Linear/Stripe require separately configured gateway upstreams absent from default config. Connected can mean credentials/connection records, not successful functional request. Native GitHub change-request submission is separate from MCP connector.

Evidence: [E168: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1); [E169: `apps/web/lib/connectors/registry.ts:1`](../apps/web/lib/connectors/registry.ts#L1); [E170: `services/openclaw/config/servers.json:1`](../services/openclaw/config/servers.json#L1); [E171: `apps/web/lib/change-requests/github.ts:1`](../apps/web/lib/change-requests/github.ts#L1)

**INT-002 — Social providers** (partially_implemented)

X official API implementation exists with per-user credentials/OAuth. Instagram and TikTok upstream return not_implemented pending platform review; TikTok has no DM tools. OAuth rows/catalog do not prove posting works.

Evidence: [E172: `services/openclaw/upstreams/social/src/server.ts:1`](../services/openclaw/upstreams/social/src/server.ts#L1); [E173: `services/openclaw/upstreams/social/src/x.ts:1`](../services/openclaw/upstreams/social/src/x.ts#L1); [E174: `apps/web/lib/social/oauth.ts:1`](../apps/web/lib/social/oauth.ts#L1); [E175: `apps/web/lib/social/scheduler.ts:1`](../apps/web/lib/social/scheduler.ts#L1)

**INT-003 — Communications delivery** (partially_implemented)

SMTP email via nodemailer and Twilio SMS REST implementations exist. WhatsApp, Telegram and app phone calls return not-implemented results. Catalog Twilio SMS description and older documentation lag delivery implementation. Credentials/delivery unverified.

Evidence: [E176: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1); [E177: `apps/web/lib/twilio-adapter.ts:1`](../apps/web/lib/twilio-adapter.ts#L1); [E178: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1)

**INT-004 — Separate voice implementations** (partially_implemented)

Deepgram-backed Express ADA shim requires token with timing-safe comparison. Separate Bland.ai HTTP service uses webhook secret to initiate paid calls, outside app permission/ledger imports; logs full phone and provider result. Does not complete app PHONE_CALL stub.

Evidence: [E179: `services/voice/server.js:1`](../services/voice/server.js#L1); [E180: `services/voice/docker-compose.yml:1`](../services/voice/docker-compose.yml#L1); [E181: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1); [E182: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1)

### AREA-13 — Financial efficiency

**Overall assessment:** partially_implemented. Individual capabilities below retain their more precise status.

**FIN-001 — Token budgets and model efficiency** (partially_implemented)

Monthly budgets default unlimited when unset/zero; 80/100 percent soft/hard defaults. Main chat model=request then preference then env/default, not universally cheapest helper. Local models/fallback can reduce cloud costs when available. Prices optional and zero means unknown; usage fire-and-forget is not transactional reservation.

Evidence: [E183: `apps/web/lib/budget.ts:1`](../apps/web/lib/budget.ts#L1); [E184: `apps/web/lib/usage.ts:1`](../apps/web/lib/usage.ts#L1); [E185: `apps/web/lib/model-router.ts:1`](../apps/web/lib/model-router.ts#L1); [E186: `apps/web/app/api/conversations/[id]/messages/route.ts:258`](../apps/web/app/api/conversations/[id]/messages/route.ts#L258); [E187: `apps/web/lib/offline.ts:1`](../apps/web/lib/offline.ts#L1)

**FIN-002 — Continuous workload exposure** (partially_implemented)

Swarm 50-120 agents; concurrency 8 (hard clamp 20), up to 3 million token run cap, two concurrent runs setting, two retries. Standing model-job schedule upper bound: 288 news calls +24 hourly scout +4+4 six-hourly scouts +2 twice-daily scout =322/day/user, plus weekly brief. Actual calls may be skipped. Conflicts with smallest-team objective.

Evidence: [E188: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1); [E189: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E190: `apps/web/lib/worker/roster.ts:1`](../apps/web/lib/worker/roster.ts#L1); [E191: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1)

**FIN-003 — Paid dependencies and spend authority** (partially_implemented)

Cloud models, Deepgram, Twilio, Bland.ai and some social APIs can incur cost. Protected payment/commitment tools require approval; ordinary configured model inference is not individually approved as payment. Local services still consume compute/storage. No provider invoice reconciliation established.

Evidence: [E192: `apps/web/lib/protected-actions.ts:1`](../apps/web/lib/protected-actions.ts#L1); [E193: `apps/web/lib/model-router.ts:1`](../apps/web/lib/model-router.ts#L1); [E194: `apps/web/lib/usage.ts:1`](../apps/web/lib/usage.ts#L1); [E195: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1)

### AREA-14 — Testing and reliability

**Overall assessment:** unable_to_verify. Individual capabilities below retain their more precise status.

**TEST-001 — Test and CI inventory** (implemented_and_verified)

139 top-level web library .test.ts files; service gateway/social tests; six Playwright .spec.ts files. CI config installs frozen dependencies, generates Prisma, checks types/lint, migrates real pgvector database, seeds, tests, builds and runs browser tests. Security includes production audit, Gitleaks and CodeQL.

Evidence: [E196: `.github/workflows/ci.yml:1`](../.github/workflows/ci.yml#L1); [E197: `.github/workflows/security.yml:1`](../.github/workflows/security.yml#L1); [E198: `e2e/playwright.config.ts:1`](../e2e/playwright.config.ts#L1); [E199: `docs/testing.md:1`](../docs/testing.md#L1)

**TEST-002 — Current operational readiness** (unable_to_verify)

No app, tests, build, migrations, providers, deployment, load, restore or uptime checks executed in this audit. HANDOFF historical pass counts refer to earlier commits, not current audited commit. Worker/swarm retry and lease mechanisms are source verified; provider cancellation and distributed concurrency remain limitations.

Evidence: [E200: `docs/HANDOFF.md:1`](../docs/HANDOFF.md#L1); [E201: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E202: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E203: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1)

## Complete organizational and agent inventory

### Registry verification

| Check | Observed static result |
| --- | --- |
| workforce_records | 326 |
| unique_agent_ids | 326 |
| unique_agent_names | 326 |
| canonical_directorates | 15 |
| additional_directorates | 1 |
| canonical_departments | 126 |
| teams | 163 |
| skills | 570 |
| unique_skill_ids | 570 |
| agents_per_team | {"2": 163} |
| states | {"dormant": 326} |
| autonomy_levels | {"2": 326} |
| provider_bindings_null | 326 |
| agent_tool_lists_empty | 326 |
| skill_required_tool_lists_empty | 570 |
| personality_fields_present | False |
| reporting_mismatches | [] |
| unregistered_agent_skills | [] |
| standing_roster_entries | 28 |
| standing_roster_enabled | 21 |
| standing_roster_disabled | 7 |
| api_route_files | 95 |
| prisma_models | 66 |
| migrations | 37 |
| web_library_test_files | 139 |
| board_records | 8 |
| subsidiaries | 5 |
| development_agents | 13 |
| chat_personas | 8 |

Every workforce entry is a configured dormant role. The swarm can explicitly assign these records to text-only model tasks; the audit observed no agent execution. No per-agent personality prompt exists in the workforce records. The JSON contains each complete original record, augmented with audit identifiers and evidence. All tools_required lists in the 570 skill definitions are empty.

### Directorates, directors and counts

| ID | Directorate | Recorded director | Departments | Workforce agents | Evidence |
| --- | --- | --- | --- | --- | --- |
| DIR-01 | Executive Office & Corporate Strategy | Dr. Tinaye Muzenyi-Igboekwe | 6 | 12 | [E693: `packages/org-kit/organization/whink_group_leadership.json:29`](../packages/org-kit/organization/whink_group_leadership.json#L29) |
| DIR-02 | WHINK Group Marketing Intelligence | Tai Tamminga | 2 | 78 | [E700: `packages/org-kit/organization/whink_group_leadership.json:41`](../packages/org-kit/organization/whink_group_leadership.json#L41) |
| DIR-03 | Sales & Revenue | Juliet Uchechukwu Igboekwe (JP) | 7 | 14 | [E703: `packages/org-kit/organization/whink_group_leadership.json:49`](../packages/org-kit/organization/whink_group_leadership.json#L49) |
| DIR-04 | Product | Atika Emmanuel | 7 | 14 | [E711: `packages/org-kit/organization/whink_group_leadership.json:62`](../packages/org-kit/organization/whink_group_leadership.json#L62) |
| DIR-05 | Engineering & Technology | Luke Mellors | 10 | 20 | [E719: `packages/org-kit/organization/whink_group_leadership.json:75`](../packages/org-kit/organization/whink_group_leadership.json#L75) |
| DIR-06 | Data & Artificial Intelligence | Dr. Amara Okafor | 12 | 24 | [E730: `packages/org-kit/organization/whink_group_leadership.json:91`](../packages/org-kit/organization/whink_group_leadership.json#L91) |
| DIR-07 | Research & Development | Dr. Elena Varga | 10 | 20 | [E743: `packages/org-kit/organization/whink_group_leadership.json:109`](../packages/org-kit/organization/whink_group_leadership.json#L109) |
| DIR-08 | Information Technology | Alejandro Ruiz | 10 | 20 | [E754: `packages/org-kit/organization/whink_group_leadership.json:125`](../packages/org-kit/organization/whink_group_leadership.json#L125) |
| DIR-09 | Cybersecurity & Resilience | Anthony C Igboekwe | 12 | 24 | [E765: `packages/org-kit/organization/whink_group_leadership.json:141`](../packages/org-kit/organization/whink_group_leadership.json#L141) |
| DIR-10 | Finance & Accounting | Charles Soludo | 8 | 16 | [E778: `packages/org-kit/organization/whink_group_leadership.json:159`](../packages/org-kit/organization/whink_group_leadership.json#L159) |
| DIR-11 | Legal, Risk & Governance | Genevieve Igboekwe | 9 | 18 | [E787: `packages/org-kit/organization/whink_group_leadership.json:173`](../packages/org-kit/organization/whink_group_leadership.json#L173) |
| DIR-12 | People & Culture | Victoria Ngozi Igboekwe | 10 | 20 | [E797: `packages/org-kit/organization/whink_group_leadership.json:188`](../packages/org-kit/organization/whink_group_leadership.json#L188) |
| DIR-13 | Operations & Procurement | Bruno Fernades | 8 | 16 | [E808: `packages/org-kit/organization/whink_group_leadership.json:204`](../packages/org-kit/organization/whink_group_leadership.json#L204) |
| DIR-14 | Customer Organization | Zaleena BeeHarry | 8 | 16 | [E817: `packages/org-kit/organization/whink_group_leadership.json:218`](../packages/org-kit/organization/whink_group_leadership.json#L218) |
| DIR-15 | Internal Audit & Assurance | Francis Lampard | 7 | 14 | [E826: `packages/org-kit/organization/whink_group_leadership.json:232`](../packages/org-kit/organization/whink_group_leadership.json#L232) |
| DIR-16 | Innovation & Opportunity | Amara Okafor | 0 | 0 | [E834: `apps/web/lib/staff-directory.ts:71`](../apps/web/lib/staff-directory.ts#L71) |

DIR-16 is separately configured and adds five innovation personas, not canonical workforce agents. Zero canonical departments/agents in that row means “not represented in that registry,” not absent work. Reporting from department head to director is organizational membership, not a verified executable authority grant. No enforced team-lead/subagent/MD chain was established.

### All departments and recorded heads

| ID | Directorate | Department | Recorded head | Workforce IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| DEPT-001 | DIR-01 | Office of the CEO & Executive Operations | Whitney Brown | AGENT-001, AGENT-002 | [E694: `packages/org-kit/organization/whink_group_leadership.json:32`](../packages/org-kit/organization/whink_group_leadership.json#L32) |
| DEPT-002 | DIR-01 | Corporate Strategy & Strategic Planning | Chux Onwusah | AGENT-003, AGENT-004 | [E695: `packages/org-kit/organization/whink_group_leadership.json:33`](../packages/org-kit/organization/whink_group_leadership.json#L33) |
| DEPT-003 | DIR-01 | Corporate Development & Strategic Investments | Tosin (Suki) Suara | AGENT-005, AGENT-006 | [E696: `packages/org-kit/organization/whink_group_leadership.json:34`](../packages/org-kit/organization/whink_group_leadership.json#L34) |
| DEPT-004 | DIR-01 | Enterprise Transformation & Strategic Programs | Nimat Omobolanle | AGENT-007, AGENT-008 | [E697: `packages/org-kit/organization/whink_group_leadership.json:35`](../packages/org-kit/organization/whink_group_leadership.json#L35) |
| DEPT-005 | DIR-01 | Enterprise Business Intelligence & Performance | Jideofor Nnaji | AGENT-009, AGENT-010 | [E698: `packages/org-kit/organization/whink_group_leadership.json:36`](../packages/org-kit/organization/whink_group_leadership.json#L36) |
| DEPT-006 | DIR-01 | Strategic Portfolio & PMO | Pat Johnson | AGENT-011, AGENT-012 | [E699: `packages/org-kit/organization/whink_group_leadership.json:37`](../packages/org-kit/organization/whink_group_leadership.json#L37) |
| DEPT-007 | DIR-02 | Brand, Media & Audience Intelligence | Sonia Bantu | AGENT-013, AGENT-014, AGENT-015, AGENT-016, AGENT-017, AGENT-018, AGENT-019, AGENT-020, AGENT-021, AGENT-022, AGENT-023, AGENT-024, AGENT-025, AGENT-026, AGENT-027, AGENT-028, AGENT-029, AGENT-030, AGENT-031, AGENT-032, AGENT-033, AGENT-034, AGENT-035, AGENT-036, AGENT-037, AGENT-038, AGENT-039, AGENT-040, AGENT-041, AGENT-042, AGENT-043, AGENT-044, AGENT-045, AGENT-046, AGENT-047, AGENT-048, AGENT-049, AGENT-050, AGENT-051, AGENT-052, AGENT-053, AGENT-054, AGENT-055, AGENT-056, AGENT-057, AGENT-058 | [E701: `packages/org-kit/organization/whink_group_leadership.json:44`](../packages/org-kit/organization/whink_group_leadership.json#L44) |
| DEPT-008 | DIR-02 | Commercial & Growth Marketing Intelligence | David Eniolade | AGENT-059, AGENT-060, AGENT-061, AGENT-062, AGENT-063, AGENT-064, AGENT-065, AGENT-066, AGENT-067, AGENT-068, AGENT-069, AGENT-070, AGENT-071, AGENT-072, AGENT-073, AGENT-074, AGENT-075, AGENT-076, AGENT-077, AGENT-078, AGENT-079, AGENT-080, AGENT-081, AGENT-082, AGENT-083, AGENT-084, AGENT-085, AGENT-086, AGENT-087, AGENT-088, AGENT-089, AGENT-090 | [E702: `packages/org-kit/organization/whink_group_leadership.json:45`](../packages/org-kit/organization/whink_group_leadership.json#L45) |
| DEPT-009 | DIR-03 | Enterprise Sales | Ijie Alpha | AGENT-091, AGENT-092 | [E704: `packages/org-kit/organization/whink_group_leadership.json:52`](../packages/org-kit/organization/whink_group_leadership.json#L52) |
| DEPT-010 | DIR-03 | SMB & Mid-Market Sales | Muyiwa Agoro | AGENT-093, AGENT-094 | [E705: `packages/org-kit/organization/whink_group_leadership.json:53`](../packages/org-kit/organization/whink_group_leadership.json#L53) |
| DEPT-011 | DIR-03 | Sales Development & Pipeline Generation | Mosope Talabi | AGENT-095, AGENT-096 | [E706: `packages/org-kit/organization/whink_group_leadership.json:54`](../packages/org-kit/organization/whink_group_leadership.json#L54) |
| DEPT-012 | DIR-03 | Solutions & Technical Sales | Matthew Okonunfua | AGENT-097, AGENT-098 | [E707: `packages/org-kit/organization/whink_group_leadership.json:55`](../packages/org-kit/organization/whink_group_leadership.json#L55) |
| DEPT-013 | DIR-03 | Channel & Partner Sales | Oluwaseun Lambo | AGENT-099, AGENT-100 | [E708: `packages/org-kit/organization/whink_group_leadership.json:56`](../packages/org-kit/organization/whink_group_leadership.json#L56) |
| DEPT-014 | DIR-03 | Account Management & Expansion | Sam Patel | AGENT-101, AGENT-102 | [E709: `packages/org-kit/organization/whink_group_leadership.json:57`](../packages/org-kit/organization/whink_group_leadership.json#L57) |
| DEPT-015 | DIR-03 | Revenue Operations & Sales Intelligence | Sylvester Anyanwu | AGENT-103, AGENT-104 | [E710: `packages/org-kit/organization/whink_group_leadership.json:58`](../packages/org-kit/organization/whink_group_leadership.json#L58) |
| DEPT-016 | DIR-04 | Product Strategy & Portfolio | Dee Jay Khaled | AGENT-105, AGENT-106 | [E712: `packages/org-kit/organization/whink_group_leadership.json:65`](../packages/org-kit/organization/whink_group_leadership.json#L65) |
| DEPT-017 | DIR-04 | Product Management | Kamsiyochukwu Igboekwe | AGENT-107, AGENT-108 | [E713: `packages/org-kit/organization/whink_group_leadership.json:66`](../packages/org-kit/organization/whink_group_leadership.json#L66) |
| DEPT-018 | DIR-04 | Product Operations | Kiki Palmer | AGENT-109, AGENT-110 | [E714: `packages/org-kit/organization/whink_group_leadership.json:67`](../packages/org-kit/organization/whink_group_leadership.json#L67) |
| DEPT-019 | DIR-04 | Product Research & Customer Discovery | Denzel Washington | AGENT-111, AGENT-112 | [E715: `packages/org-kit/organization/whink_group_leadership.json:68`](../packages/org-kit/organization/whink_group_leadership.json#L68) |
| DEPT-020 | DIR-04 | Product Analytics & Intelligence | Kaisochukwu Nnaji | AGENT-113, AGENT-114 | [E716: `packages/org-kit/organization/whink_group_leadership.json:69`](../packages/org-kit/organization/whink_group_leadership.json#L69) |
| DEPT-021 | DIR-04 | User Experience & Service Design | Inaas Abdul | AGENT-115, AGENT-116 | [E717: `packages/org-kit/organization/whink_group_leadership.json:70`](../packages/org-kit/organization/whink_group_leadership.json#L70) |
| DEPT-022 | DIR-04 | Release & Product Lifecycle Management | Abiodun Iseniyi | AGENT-117, AGENT-118 | [E718: `packages/org-kit/organization/whink_group_leadership.json:71`](../packages/org-kit/organization/whink_group_leadership.json#L71) |
| DEPT-023 | DIR-05 | Software Engineering | Sofoluwe Coker | AGENT-119, AGENT-120 | [E720: `packages/org-kit/organization/whink_group_leadership.json:78`](../packages/org-kit/organization/whink_group_leadership.json#L78) |
| DEPT-024 | DIR-05 | Mobile & Client Platforms | Ernest Abhulimehn | AGENT-121, AGENT-122 | [E721: `packages/org-kit/organization/whink_group_leadership.json:79`](../packages/org-kit/organization/whink_group_leadership.json#L79) |
| DEPT-025 | DIR-05 | Platform Engineering & Core Infrastructure | Tinashe Muzenyi | AGENT-123, AGENT-124 | [E722: `packages/org-kit/organization/whink_group_leadership.json:80`](../packages/org-kit/organization/whink_group_leadership.json#L80) |
| DEPT-026 | DIR-05 | Architecture & Technical Strategy | Sophia Mercurri | AGENT-125, AGENT-126 | [E723: `packages/org-kit/organization/whink_group_leadership.json:81`](../packages/org-kit/organization/whink_group_leadership.json#L81) |
| DEPT-027 | DIR-05 | API, Integrations & Developer Ecosystem | Omolara Suara | AGENT-127, AGENT-128 | [E724: `packages/org-kit/organization/whink_group_leadership.json:82`](../packages/org-kit/organization/whink_group_leadership.json#L82) |
| DEPT-028 | DIR-05 | DevOps, SRE & Cloud Engineering | Raven May Mei | AGENT-129, AGENT-130 | [E725: `packages/org-kit/organization/whink_group_leadership.json:83`](../packages/org-kit/organization/whink_group_leadership.json#L83) |
| DEPT-029 | DIR-05 | Quality Engineering & Test Automation | Terhemba Ahile | AGENT-131, AGENT-132 | [E726: `packages/org-kit/organization/whink_group_leadership.json:84`](../packages/org-kit/organization/whink_group_leadership.json#L84) |
| DEPT-030 | DIR-05 | Release Engineering & Configuration Management | Rebecca Johnson | AGENT-133, AGENT-134 | [E727: `packages/org-kit/organization/whink_group_leadership.json:85`](../packages/org-kit/organization/whink_group_leadership.json#L85) |
| DEPT-031 | DIR-05 | Engineering Productivity & Developer Experience | Étienne Moreau | AGENT-135, AGENT-136 | [E728: `packages/org-kit/organization/whink_group_leadership.json:86`](../packages/org-kit/organization/whink_group_leadership.json#L86) |
| DEPT-032 | DIR-05 | Technical Documentation & Engineering Knowledge | Leila Haddad | AGENT-137, AGENT-138 | [E729: `packages/org-kit/organization/whink_group_leadership.json:87`](../packages/org-kit/organization/whink_group_leadership.json#L87) |
| DEPT-033 | DIR-06 | AI Engineering & Applied Intelligence | Lukas Schneider | AGENT-139, AGENT-140 | [E731: `packages/org-kit/organization/whink_group_leadership.json:94`](../packages/org-kit/organization/whink_group_leadership.json#L94) |
| DEPT-034 | DIR-06 | Agent Architecture & AI Workforce Systems | Hanae Nakamura | AGENT-141, AGENT-142 | [E732: `packages/org-kit/organization/whink_group_leadership.json:95`](../packages/org-kit/organization/whink_group_leadership.json#L95) |
| DEPT-035 | DIR-06 | Skill Engineering & Tool Orchestration | Mateo Fernández | AGENT-143, AGENT-144 | [E733: `packages/org-kit/organization/whink_group_leadership.json:96`](../packages/org-kit/organization/whink_group_leadership.json#L96) |
| DEPT-036 | DIR-06 | Machine Learning & Model Development | Dr. Priyanka Rao | AGENT-145, AGENT-146 | [E734: `packages/org-kit/organization/whink_group_leadership.json:97`](../packages/org-kit/organization/whink_group_leadership.json#L97) |
| DEPT-037 | DIR-06 | Model Evaluation, Reliability & Intelligence Quality | Elias Haddad | AGENT-147, AGENT-148 | [E735: `packages/org-kit/organization/whink_group_leadership.json:98`](../packages/org-kit/organization/whink_group_leadership.json#L98) |
| DEPT-038 | DIR-06 | Model Routing & AI Infrastructure | Ingrid Bergström | AGENT-149, AGENT-150 | [E736: `packages/org-kit/organization/whink_group_leadership.json:99`](../packages/org-kit/organization/whink_group_leadership.json#L99) |
| DEPT-039 | DIR-06 | Data Engineering & Data Platforms | Kwesi Boateng | AGENT-151, AGENT-152 | [E737: `packages/org-kit/organization/whink_group_leadership.json:100`](../packages/org-kit/organization/whink_group_leadership.json#L100) |
| DEPT-040 | DIR-06 | Data Science & Decision Intelligence | Dr. Sofia Petrovic | AGENT-153, AGENT-154 | [E738: `packages/org-kit/organization/whink_group_leadership.json:101`](../packages/org-kit/organization/whink_group_leadership.json#L101) |
| DEPT-041 | DIR-06 | Knowledge Systems & Enterprise Memory | Leila Ben Youssef | AGENT-155, AGENT-156 | [E739: `packages/org-kit/organization/whink_group_leadership.json:102`](../packages/org-kit/organization/whink_group_leadership.json#L102) |
| DEPT-042 | DIR-06 | AI Governance Technology & Responsible AI Systems | Amina El-Sayed | AGENT-157, AGENT-158 | [E740: `packages/org-kit/organization/whink_group_leadership.json:103`](../packages/org-kit/organization/whink_group_leadership.json#L103) |
| DEPT-043 | DIR-06 | AI FinOps & Usage Intelligence | Gabriel Costa | AGENT-159, AGENT-160 | [E741: `packages/org-kit/organization/whink_group_leadership.json:104`](../packages/org-kit/organization/whink_group_leadership.json#L104) |
| DEPT-044 | DIR-06 | AI Platform Operations & Observability | Min-jun Park | AGENT-161, AGENT-162 | [E742: `packages/org-kit/organization/whink_group_leadership.json:105`](../packages/org-kit/organization/whink_group_leadership.json#L105) |
| DEPT-045 | DIR-07 | Applied Research | Dr. Tendai Muchengeti | AGENT-163, AGENT-164 | [E744: `packages/org-kit/organization/whink_group_leadership.json:112`](../packages/org-kit/organization/whink_group_leadership.json#L112) |
| DEPT-046 | DIR-07 | Emerging Technologies & Future Systems | Kenji Mori | AGENT-165, AGENT-166 | [E745: `packages/org-kit/organization/whink_group_leadership.json:113`](../packages/org-kit/organization/whink_group_leadership.json#L113) |
| DEPT-047 | DIR-07 | Experimental Engineering & Prototyping | Andrés Valdés | AGENT-167, AGENT-168 | [E746: `packages/org-kit/organization/whink_group_leadership.json:114`](../packages/org-kit/organization/whink_group_leadership.json#L114) |
| DEPT-048 | DIR-07 | AI & Autonomous Systems Research | Dr. Samira Qureshi | AGENT-169, AGENT-170 | [E747: `packages/org-kit/organization/whink_group_leadership.json:115`](../packages/org-kit/organization/whink_group_leadership.json#L115) |
| DEPT-049 | DIR-07 | Human–Computer Interaction & Future Interfaces | Freja Lindholm | AGENT-171, AGENT-172 | [E748: `packages/org-kit/organization/whink_group_leadership.json:116`](../packages/org-kit/organization/whink_group_leadership.json#L116) |
| DEPT-050 | DIR-07 | Advanced Computing & Systems Research | Dr. Kwame Asante | AGENT-173, AGENT-174 | [E749: `packages/org-kit/organization/whink_group_leadership.json:117`](../packages/org-kit/organization/whink_group_leadership.json#L117) |
| DEPT-051 | DIR-07 | Research Partnerships & Academic Collaboration | Claire Dubois | AGENT-175, AGENT-176 | [E750: `packages/org-kit/organization/whink_group_leadership.json:118`](../packages/org-kit/organization/whink_group_leadership.json#L118) |
| DEPT-052 | DIR-07 | Innovation Incubation & Technology Transfer | Rafael Mendes | AGENT-177, AGENT-178 | [E751: `packages/org-kit/organization/whink_group_leadership.json:119`](../packages/org-kit/organization/whink_group_leadership.json#L119) |
| DEPT-053 | DIR-07 | Intellectual Property Discovery & Invention Management | Noura Al-Mansouri | AGENT-179, AGENT-180 | [E752: `packages/org-kit/organization/whink_group_leadership.json:120`](../packages/org-kit/organization/whink_group_leadership.json#L120) |
| DEPT-054 | DIR-07 | Research Intelligence & Scientific Foresight | Dr. Ji-won Seo | AGENT-181, AGENT-182 | [E753: `packages/org-kit/organization/whink_group_leadership.json:121`](../packages/org-kit/organization/whink_group_leadership.json#L121) |
| DEPT-055 | DIR-08 | Enterprise Applications & Business Systems | Grace Kimani | AGENT-183, AGENT-184 | [E755: `packages/org-kit/organization/whink_group_leadership.json:128`](../packages/org-kit/organization/whink_group_leadership.json#L128) |
| DEPT-056 | DIR-08 | End-User Computing & Workplace Technology | Yuki Tanaka | AGENT-185, AGENT-186 | [E756: `packages/org-kit/organization/whink_group_leadership.json:129`](../packages/org-kit/organization/whink_group_leadership.json#L129) |
| DEPT-057 | DIR-08 | IT Service Management & Service Desk | Michael O'Connor | AGENT-187, AGENT-188 | [E757: `packages/org-kit/organization/whink_group_leadership.json:130`](../packages/org-kit/organization/whink_group_leadership.json#L130) |
| DEPT-058 | DIR-08 | Cloud & Infrastructure Operations | Ananya Deshmukh | AGENT-189, AGENT-190 | [E758: `packages/org-kit/organization/whink_group_leadership.json:131`](../packages/org-kit/organization/whink_group_leadership.json#L131) |
| DEPT-059 | DIR-08 | Network & Connectivity Services | Chinedu Eze | AGENT-191, AGENT-192 | [E759: `packages/org-kit/organization/whink_group_leadership.json:132`](../packages/org-kit/organization/whink_group_leadership.json#L132) |
| DEPT-060 | DIR-08 | Identity & Access Administration | Katarina Novak | AGENT-193, AGENT-194 | [E760: `packages/org-kit/organization/whink_group_leadership.json:133`](../packages/org-kit/organization/whink_group_leadership.json#L133) |
| DEPT-061 | DIR-08 | Collaboration & Productivity Platforms | Farah Rahman | AGENT-195, AGENT-196 | [E761: `packages/org-kit/organization/whink_group_leadership.json:134`](../packages/org-kit/organization/whink_group_leadership.json#L134) |
| DEPT-062 | DIR-08 | IT Asset & Configuration Management | João Ferreira | AGENT-197, AGENT-198 | [E762: `packages/org-kit/organization/whink_group_leadership.json:135`](../packages/org-kit/organization/whink_group_leadership.json#L135) |
| DEPT-063 | DIR-08 | Enterprise Systems Administration | Thabo Mokoena | AGENT-199, AGENT-200 | [E763: `packages/org-kit/organization/whink_group_leadership.json:136`](../packages/org-kit/organization/whink_group_leadership.json#L136) |
| DEPT-064 | DIR-08 | IT Architecture & Technology Standards | Dr. Elise van der Meer | AGENT-201, AGENT-202 | [E764: `packages/org-kit/organization/whink_group_leadership.json:137`](../packages/org-kit/organization/whink_group_leadership.json#L137) |
| DEPT-065 | DIR-09 | Security Operations & Incident Response | Marcus Lund | AGENT-203, AGENT-204 | [E766: `packages/org-kit/organization/whink_group_leadership.json:144`](../packages/org-kit/organization/whink_group_leadership.json#L144) |
| DEPT-066 | DIR-09 | Threat Intelligence & Threat Hunting | Olumide Adekunle | AGENT-205, AGENT-206 | [E767: `packages/org-kit/organization/whink_group_leadership.json:145`](../packages/org-kit/organization/whink_group_leadership.json#L145) |
| DEPT-067 | DIR-09 | Identity Security & Privileged Access | Camille Tremblay | AGENT-207, AGENT-208 | [E768: `packages/org-kit/organization/whink_group_leadership.json:146`](../packages/org-kit/organization/whink_group_leadership.json#L146) |
| DEPT-068 | DIR-09 | Security Engineering | Arjun Mehra | AGENT-209, AGENT-210 | [E769: `packages/org-kit/organization/whink_group_leadership.json:147`](../packages/org-kit/organization/whink_group_leadership.json#L147) |
| DEPT-069 | DIR-09 | Cloud & Infrastructure Security | Sofia Dimitrova | AGENT-211, AGENT-212 | [E770: `packages/org-kit/organization/whink_group_leadership.json:148`](../packages/org-kit/organization/whink_group_leadership.json#L148) |
| DEPT-070 | DIR-09 | Application & Product Security | Diego Morales | AGENT-213, AGENT-214 | [E771: `packages/org-kit/organization/whink_group_leadership.json:149`](../packages/org-kit/organization/whink_group_leadership.json#L149) |
| DEPT-071 | DIR-09 | Security Architecture | Dr. Miriam Kessler | AGENT-215, AGENT-216 | [E772: `packages/org-kit/organization/whink_group_leadership.json:150`](../packages/org-kit/organization/whink_group_leadership.json#L150) |
| DEPT-072 | DIR-09 | Vulnerability & Exposure Management | Bongani Dlamini | AGENT-217, AGENT-218 | [E773: `packages/org-kit/organization/whink_group_leadership.json:151`](../packages/org-kit/organization/whink_group_leadership.json#L151) |
| DEPT-073 | DIR-09 | Data Security & Information Protection | Noor Al-Khatib | AGENT-219, AGENT-220 | [E774: `packages/org-kit/organization/whink_group_leadership.json:152`](../packages/org-kit/organization/whink_group_leadership.json#L152) |
| DEPT-074 | DIR-09 | Third-Party & Supply Chain Security | Haruka Watanabe | AGENT-221, AGENT-222 | [E775: `packages/org-kit/organization/whink_group_leadership.json:153`](../packages/org-kit/organization/whink_group_leadership.json#L153) |
| DEPT-075 | DIR-09 | Cyber Risk & Security Governance | Gabriela Torres | AGENT-223, AGENT-224 | [E776: `packages/org-kit/organization/whink_group_leadership.json:154`](../packages/org-kit/organization/whink_group_leadership.json#L154) |
| DEPT-076 | DIR-09 | Business Continuity, Disaster Recovery & Cyber Resilience | Henrik Sørensen | AGENT-225, AGENT-226 | [E777: `packages/org-kit/organization/whink_group_leadership.json:155`](../packages/org-kit/organization/whink_group_leadership.json#L155) |
| DEPT-077 | DIR-10 | Accounting & Close | Helena Costa | AGENT-227, AGENT-228 | [E779: `packages/org-kit/organization/whink_group_leadership.json:162`](../packages/org-kit/organization/whink_group_leadership.json#L162) |
| DEPT-078 | DIR-10 | Financial Reporting & Consolidation | Kwabena Mensah | AGENT-229, AGENT-230 | [E780: `packages/org-kit/organization/whink_group_leadership.json:163`](../packages/org-kit/organization/whink_group_leadership.json#L163) |
| DEPT-079 | DIR-10 | FP&A, Budgeting & Forecasting | Priya Raman | AGENT-231, AGENT-232 | [E781: `packages/org-kit/organization/whink_group_leadership.json:164`](../packages/org-kit/organization/whink_group_leadership.json#L164) |
| DEPT-080 | DIR-10 | Treasury & Capital Management | Mikhail Petrov | AGENT-233, AGENT-234 | [E782: `packages/org-kit/organization/whink_group_leadership.json:165`](../packages/org-kit/organization/whink_group_leadership.json#L165) |
| DEPT-081 | DIR-10 | Tax | Aisha Bello | AGENT-235, AGENT-236 | [E783: `packages/org-kit/organization/whink_group_leadership.json:166`](../packages/org-kit/organization/whink_group_leadership.json#L166) |
| DEPT-082 | DIR-10 | Billing, Accounts Receivable & Accounts Payable | Camila Ferreira | AGENT-237, AGENT-238 | [E784: `packages/org-kit/organization/whink_group_leadership.json:167`](../packages/org-kit/organization/whink_group_leadership.json#L167) |
| DEPT-083 | DIR-10 | Payroll Finance | Thandiwe Ncube | AGENT-239, AGENT-240 | [E785: `packages/org-kit/organization/whink_group_leadership.json:168`](../packages/org-kit/organization/whink_group_leadership.json#L168) |
| DEPT-084 | DIR-10 | Financial Controls & Management Accounting | Giulia Romano | AGENT-241, AGENT-242 | [E786: `packages/org-kit/organization/whink_group_leadership.json:169`](../packages/org-kit/organization/whink_group_leadership.json#L169) |
| DEPT-085 | DIR-11 | Corporate & Commercial Legal | Marcus Feldman | AGENT-243, AGENT-244 | [E788: `packages/org-kit/organization/whink_group_leadership.json:176`](../packages/org-kit/organization/whink_group_leadership.json#L176) |
| DEPT-086 | DIR-11 | Contracts & Transactions | Zainab Bakare | AGENT-245, AGENT-246 | [E789: `packages/org-kit/organization/whink_group_leadership.json:177`](../packages/org-kit/organization/whink_group_leadership.json#L177) |
| DEPT-087 | DIR-11 | Intellectual Property & Technology Legal | Dr. Lucía Herrera | AGENT-247, AGENT-248 | [E790: `packages/org-kit/organization/whink_group_leadership.json:178`](../packages/org-kit/organization/whink_group_leadership.json#L178) |
| DEPT-088 | DIR-11 | Employment Legal | Daniel Cho | AGENT-249, AGENT-250 | [E791: `packages/org-kit/organization/whink_group_leadership.json:179`](../packages/org-kit/organization/whink_group_leadership.json#L179) |
| DEPT-089 | DIR-11 | Privacy & Data Protection | Amélie Laurent | AGENT-251, AGENT-252 | [E792: `packages/org-kit/organization/whink_group_leadership.json:180`](../packages/org-kit/organization/whink_group_leadership.json#L180) |
| DEPT-090 | DIR-11 | Enterprise Risk Management | Sipho Dlamini | AGENT-253, AGENT-254 | [E793: `packages/org-kit/organization/whink_group_leadership.json:181`](../packages/org-kit/organization/whink_group_leadership.json#L181) |
| DEPT-091 | DIR-11 | Governance & Board Affairs | Ingrid Madsen | AGENT-255, AGENT-256 | [E794: `packages/org-kit/organization/whink_group_leadership.json:182`](../packages/org-kit/organization/whink_group_leadership.json#L182) |
| DEPT-092 | DIR-11 | Regulatory Compliance & Ethics | Farida El-Masri | AGENT-257, AGENT-258 | [E795: `packages/org-kit/organization/whink_group_leadership.json:183`](../packages/org-kit/organization/whink_group_leadership.json#L183) |
| DEPT-093 | DIR-11 | Records & Information Governance | Tomasz Kowalski | AGENT-259, AGENT-260 | [E796: `packages/org-kit/organization/whink_group_leadership.json:184`](../packages/org-kit/organization/whink_group_leadership.json#L184) |
| DEPT-094 | DIR-12 | HR Business Partnering & People Operations | Nneka Eze | AGENT-261, AGENT-262 | [E798: `packages/org-kit/organization/whink_group_leadership.json:191`](../packages/org-kit/organization/whink_group_leadership.json#L191) |
| DEPT-095 | DIR-12 | Talent Acquisition | Sofia Lindström | AGENT-263, AGENT-264 | [E799: `packages/org-kit/organization/whink_group_leadership.json:192`](../packages/org-kit/organization/whink_group_leadership.json#L192) |
| DEPT-096 | DIR-12 | Onboarding & Employee Experience | Javier Morales | AGENT-265, AGENT-266 | [E800: `packages/org-kit/organization/whink_group_leadership.json:193`](../packages/org-kit/organization/whink_group_leadership.json#L193) |
| DEPT-097 | DIR-12 | Employee Relations | Amina Yusuf | AGENT-267, AGENT-268 | [E801: `packages/org-kit/organization/whink_group_leadership.json:194`](../packages/org-kit/organization/whink_group_leadership.json#L194) |
| DEPT-098 | DIR-12 | Total Rewards, Compensation & Benefits | Claire Beaumont | AGENT-269, AGENT-270 | [E802: `packages/org-kit/organization/whink_group_leadership.json:195`](../packages/org-kit/organization/whink_group_leadership.json#L195) |
| DEPT-099 | DIR-12 | Performance & Talent Management | Kofi Agyeman | AGENT-271, AGENT-272 | [E803: `packages/org-kit/organization/whink_group_leadership.json:196`](../packages/org-kit/organization/whink_group_leadership.json#L196) |
| DEPT-100 | DIR-12 | Learning & Development | Hana Suzuki | AGENT-273, AGENT-274 | [E804: `packages/org-kit/organization/whink_group_leadership.json:197`](../packages/org-kit/organization/whink_group_leadership.json#L197) |
| DEPT-101 | DIR-12 | Organizational Design & Workforce Planning | Rajiv Menon | AGENT-275, AGENT-276 | [E805: `packages/org-kit/organization/whink_group_leadership.json:198`](../packages/org-kit/organization/whink_group_leadership.json#L198) |
| DEPT-102 | DIR-12 | People Analytics | Elena Popescu | AGENT-277, AGENT-278 | [E806: `packages/org-kit/organization/whink_group_leadership.json:199`](../packages/org-kit/organization/whink_group_leadership.json#L199) |
| DEPT-103 | DIR-12 | AI Workforce & Organizational Intelligence | Dr. Maya Kilonzo | AGENT-279, AGENT-280 | [E807: `packages/org-kit/organization/whink_group_leadership.json:200`](../packages/org-kit/organization/whink_group_leadership.json#L200) |
| DEPT-104 | DIR-13 | Corporate Operations | Nadia Petrescu | AGENT-281, AGENT-282 | [E809: `packages/org-kit/organization/whink_group_leadership.json:207`](../packages/org-kit/organization/whink_group_leadership.json#L207) |
| DEPT-105 | DIR-13 | Business Process & Continuous Improvement | Samuel Adekunle | AGENT-283, AGENT-284 | [E810: `packages/org-kit/organization/whink_group_leadership.json:208`](../packages/org-kit/organization/whink_group_leadership.json#L208) |
| DEPT-106 | DIR-13 | Procurement & Strategic Sourcing | Linh Nguyen | AGENT-285, AGENT-286 | [E811: `packages/org-kit/organization/whink_group_leadership.json:209`](../packages/org-kit/organization/whink_group_leadership.json#L209) |
| DEPT-107 | DIR-13 | Vendor & Supplier Management | Matteo Ricci | AGENT-287, AGENT-288 | [E812: `packages/org-kit/organization/whink_group_leadership.json:210`](../packages/org-kit/organization/whink_group_leadership.json#L210) |
| DEPT-108 | DIR-13 | Facilities & Workplace | Chloe Martin | AGENT-289, AGENT-290 | [E813: `packages/org-kit/organization/whink_group_leadership.json:211`](../packages/org-kit/organization/whink_group_leadership.json#L211) |
| DEPT-109 | DIR-13 | Real Estate & Physical Infrastructure | Ahmed Al-Hassan | AGENT-291, AGENT-292 | [E814: `packages/org-kit/organization/whink_group_leadership.json:212`](../packages/org-kit/organization/whink_group_leadership.json#L212) |
| DEPT-110 | DIR-13 | Quality Management | Dr. Eva Horváth | AGENT-293, AGENT-294 | [E815: `packages/org-kit/organization/whink_group_leadership.json:213`](../packages/org-kit/organization/whink_group_leadership.json#L213) |
| DEPT-111 | DIR-13 | Operational Performance & Service Excellence | Bongiwe Khumalo | AGENT-295, AGENT-296 | [E816: `packages/org-kit/organization/whink_group_leadership.json:214`](../packages/org-kit/organization/whink_group_leadership.json#L214) |
| DEPT-112 | DIR-14 | Customer Success | Sofia Mendes | AGENT-297, AGENT-298 | [E818: `packages/org-kit/organization/whink_group_leadership.json:221`](../packages/org-kit/organization/whink_group_leadership.json#L221) |
| DEPT-113 | DIR-14 | Customer Onboarding & Implementation | Caleb Nwosu | AGENT-299, AGENT-300 | [E819: `packages/org-kit/organization/whink_group_leadership.json:222`](../packages/org-kit/organization/whink_group_leadership.json#L222) |
| DEPT-114 | DIR-14 | Professional Services | Aiko Fujimoto | AGENT-301, AGENT-302 | [E820: `packages/org-kit/organization/whink_group_leadership.json:223`](../packages/org-kit/organization/whink_group_leadership.json#L223) |
| DEPT-115 | DIR-14 | Technical Account Management | Lars Petersen | AGENT-303, AGENT-304 | [E821: `packages/org-kit/organization/whink_group_leadership.json:224`](../packages/org-kit/organization/whink_group_leadership.json#L224) |
| DEPT-116 | DIR-14 | Customer Support & Service Desk | Naomi Chen | AGENT-305, AGENT-306 | [E822: `packages/org-kit/organization/whink_group_leadership.json:225`](../packages/org-kit/organization/whink_group_leadership.json#L225) |
| DEPT-117 | DIR-14 | Customer Education & Adoption | Fatima Zahra | AGENT-307, AGENT-308 | [E823: `packages/org-kit/organization/whink_group_leadership.json:226`](../packages/org-kit/organization/whink_group_leadership.json#L226) |
| DEPT-118 | DIR-14 | Renewals & Expansion | Diego Fernandes | AGENT-309, AGENT-310 | [E824: `packages/org-kit/organization/whink_group_leadership.json:227`](../packages/org-kit/organization/whink_group_leadership.json#L227) |
| DEPT-119 | DIR-14 | Customer Health & Escalation Management | Grace Owusu | AGENT-311, AGENT-312 | [E825: `packages/org-kit/organization/whink_group_leadership.json:228`](../packages/org-kit/organization/whink_group_leadership.json#L228) |
| DEPT-120 | DIR-15 | Financial Audit & Assurance | Helena Novak | AGENT-313, AGENT-314 | [E827: `packages/org-kit/organization/whink_group_leadership.json:235`](../packages/org-kit/organization/whink_group_leadership.json#L235) |
| DEPT-121 | DIR-15 | Technology Audit | Dr. Marcus Chen | AGENT-315, AGENT-316 | [E828: `packages/org-kit/organization/whink_group_leadership.json:236`](../packages/org-kit/organization/whink_group_leadership.json#L236) |
| DEPT-122 | DIR-15 | Cybersecurity Assurance | Leila Haddad-Sayegh | AGENT-317, AGENT-318 | [E829: `packages/org-kit/organization/whink_group_leadership.json:237`](../packages/org-kit/organization/whink_group_leadership.json#L237) |
| DEPT-123 | DIR-15 | Operational Audit | Tawanda Moyo | AGENT-319, AGENT-320 | [E830: `packages/org-kit/organization/whink_group_leadership.json:238`](../packages/org-kit/organization/whink_group_leadership.json#L238) |
| DEPT-124 | DIR-15 | Compliance & Governance Audit | Ingrid Solberg | AGENT-321, AGENT-322 | [E831: `packages/org-kit/organization/whink_group_leadership.json:239`](../packages/org-kit/organization/whink_group_leadership.json#L239) |
| DEPT-125 | DIR-15 | Controls Assurance | Priya Kapoor | AGENT-323, AGENT-324 | [E832: `packages/org-kit/organization/whink_group_leadership.json:240`](../packages/org-kit/organization/whink_group_leadership.json#L240) |
| DEPT-126 | DIR-15 | AI Systems & Agent Governance Audit | Dr. Kojo Mensima | AGENT-325, AGENT-326 | [E833: `packages/org-kit/organization/whink_group_leadership.json:241`](../packages/org-kit/organization/whink_group_leadership.json#L241) |

### All 326 workforce agents

Common fields: state=dormant; autonomy_level=2; provider_binding=null; tools=[]; data_access=minimum_required_by_task; permissions=advice/draft/prepare. Human approval declarations include task start, public action, financial commitment and material memory writes. Completion criteria and KPIs are preserved verbatim in JSON. Skills and responsibilities below are declared capabilities, not independent executable implementations.

#### DIR-01 — Executive Office & Corporate Strategy

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-001 / Aarav Kapoor | Principal Specialist — Office of the CEO & Executive Operations | Office of the CEO & Executive Operations / Office of the CEO & Executive Operations Core | Whitney Brown | Skills: executive_briefing, decision_tracking, executive_coordination, priority_management, web_research, source_verification, quality_review; Responsibilities: executive_briefing, decision_tracking, executive_coordination, priority_management, leadership_meeting_ops | [E204: `packages/org-kit/organization/workforce_registry.json:3`](../packages/org-kit/organization/workforce_registry.json#L3) |
| AGENT-002 / Amina Diallo | Analyst & Reviewer — Office of the CEO & Executive Operations | Office of the CEO & Executive Operations / Office of the CEO & Executive Operations Core | Whitney Brown | Skills: executive_briefing, decision_tracking, executive_coordination, priority_management, web_research, source_verification, quality_review; Responsibilities: executive_briefing, decision_tracking, executive_coordination, priority_management, leadership_meeting_ops | [E205: `packages/org-kit/organization/workforce_registry.json:59`](../packages/org-kit/organization/workforce_registry.json#L59) |
| AGENT-003 / Lucía Navarro | Principal Specialist — Corporate Strategy & Strategic Planning | Corporate Strategy & Strategic Planning / Corporate Strategy & Strategic Planning Core | Chux Onwusah | Skills: corporate_strategy, scenario_planning, strategic_prioritization, annual_planning, web_research, source_verification, quality_review; Responsibilities: corporate_strategy, scenario_planning, strategic_prioritization, annual_planning, competitive_positioning | [E206: `packages/org-kit/organization/workforce_registry.json:115`](../packages/org-kit/organization/workforce_registry.json#L115) |
| AGENT-004 / Mikael Johansson | Analyst & Reviewer — Corporate Strategy & Strategic Planning | Corporate Strategy & Strategic Planning / Corporate Strategy & Strategic Planning Core | Chux Onwusah | Skills: corporate_strategy, scenario_planning, strategic_prioritization, annual_planning, web_research, source_verification, quality_review; Responsibilities: corporate_strategy, scenario_planning, strategic_prioritization, annual_planning, competitive_positioning | [E207: `packages/org-kit/organization/workforce_registry.json:171`](../packages/org-kit/organization/workforce_registry.json#L171) |
| AGENT-005 / Nadia Rahman | Principal Specialist — Corporate Development & Strategic Investments | Corporate Development & Strategic Investments / Corporate Development & Strategic Investments Core | Tosin (Suki) Suara | Skills: deal_screening, investment_thesis, valuation_support, due_diligence_coordination, web_research, source_verification, quality_review; Responsibilities: deal_screening, investment_thesis, valuation_support, due_diligence_coordination, joint_venture_analysis | [E208: `packages/org-kit/organization/workforce_registry.json:227`](../packages/org-kit/organization/workforce_registry.json#L227) |
| AGENT-006 / Kofi Mensah | Analyst & Reviewer — Corporate Development & Strategic Investments | Corporate Development & Strategic Investments / Corporate Development & Strategic Investments Core | Tosin (Suki) Suara | Skills: deal_screening, investment_thesis, valuation_support, due_diligence_coordination, web_research, source_verification, quality_review; Responsibilities: deal_screening, investment_thesis, valuation_support, due_diligence_coordination, joint_venture_analysis | [E209: `packages/org-kit/organization/workforce_registry.json:283`](../packages/org-kit/organization/workforce_registry.json#L283) |
| AGENT-007 / Soo-jin Park | Principal Specialist — Enterprise Transformation & Strategic Programs | Enterprise Transformation & Strategic Programs / Enterprise Transformation & Strategic Programs Core | Nimat Omobolanle | Skills: transformation_design, program_governance, change_enablement, cross_functional_delivery, web_research, source_verification, quality_review; Responsibilities: transformation_design, program_governance, change_enablement, cross_functional_delivery, benefits_realization | [E210: `packages/org-kit/organization/workforce_registry.json:339`](../packages/org-kit/organization/workforce_registry.json#L339) |
| AGENT-008 / Mateo Silva | Analyst & Reviewer — Enterprise Transformation & Strategic Programs | Enterprise Transformation & Strategic Programs / Enterprise Transformation & Strategic Programs Core | Nimat Omobolanle | Skills: transformation_design, program_governance, change_enablement, cross_functional_delivery, web_research, source_verification, quality_review; Responsibilities: transformation_design, program_governance, change_enablement, cross_functional_delivery, benefits_realization | [E211: `packages/org-kit/organization/workforce_registry.json:395`](../packages/org-kit/organization/workforce_registry.json#L395) |
| AGENT-009 / Leila Haddad | Principal Specialist — Enterprise Business Intelligence & Performance | Enterprise Business Intelligence & Performance / Enterprise Business Intelligence & Performance Core | Jideofor Nnaji | Skills: executive_dashboarding, kpi_design, performance_analysis, decision_support, web_research, source_verification, quality_review; Responsibilities: executive_dashboarding, kpi_design, performance_analysis, decision_support, forecast_synthesis | [E212: `packages/org-kit/organization/workforce_registry.json:451`](../packages/org-kit/organization/workforce_registry.json#L451) |
| AGENT-010 / Thabo Mbeki | Analyst & Reviewer — Enterprise Business Intelligence & Performance | Enterprise Business Intelligence & Performance / Enterprise Business Intelligence & Performance Core | Jideofor Nnaji | Skills: executive_dashboarding, kpi_design, performance_analysis, decision_support, web_research, source_verification, quality_review; Responsibilities: executive_dashboarding, kpi_design, performance_analysis, decision_support, forecast_synthesis | [E213: `packages/org-kit/organization/workforce_registry.json:507`](../packages/org-kit/organization/workforce_registry.json#L507) |
| AGENT-011 / Aya Nakamura | Principal Specialist — Strategic Portfolio & PMO | Strategic Portfolio & PMO / Strategic Portfolio & PMO Core | Pat Johnson | Skills: portfolio_management, program_management, dependency_tracking, resource_prioritization, web_research, source_verification, quality_review; Responsibilities: portfolio_management, program_management, dependency_tracking, resource_prioritization, value_realization | [E214: `packages/org-kit/organization/workforce_registry.json:563`](../packages/org-kit/organization/workforce_registry.json#L563) |
| AGENT-012 / Santiago Rojas | Analyst & Reviewer — Strategic Portfolio & PMO | Strategic Portfolio & PMO / Strategic Portfolio & PMO Core | Pat Johnson | Skills: portfolio_management, program_management, dependency_tracking, resource_prioritization, web_research, source_verification, quality_review; Responsibilities: portfolio_management, program_management, dependency_tracking, resource_prioritization, value_realization | [E215: `packages/org-kit/organization/workforce_registry.json:619`](../packages/org-kit/organization/workforce_registry.json#L619) |

#### DIR-02 — WHINK Group Marketing Intelligence

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-013 / Ingrid Larsen | Principal Specialist — ATLAS | Brand, Media & Audience Intelligence / ATLAS | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E216: `packages/org-kit/organization/workforce_registry.json:675`](../packages/org-kit/organization/workforce_registry.json#L675) |
| AGENT-014 / Zainab Okeke | Analyst & Reviewer — ATLAS | Brand, Media & Audience Intelligence / ATLAS | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E217: `packages/org-kit/organization/workforce_registry.json:726`](../packages/org-kit/organization/workforce_registry.json#L726) |
| AGENT-015 / Ravi Subramanian | Principal Specialist — NOVA | Brand, Media & Audience Intelligence / NOVA | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E218: `packages/org-kit/organization/workforce_registry.json:777`](../packages/org-kit/organization/workforce_registry.json#L777) |
| AGENT-016 / Maya Cohen | Analyst & Reviewer — NOVA | Brand, Media & Audience Intelligence / NOVA | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E219: `packages/org-kit/organization/workforce_registry.json:828`](../packages/org-kit/organization/workforce_registry.json#L828) |
| AGENT-017 / Jelena Marković | Principal Specialist — VANTA | Brand, Media & Audience Intelligence / VANTA | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E220: `packages/org-kit/organization/workforce_registry.json:879`](../packages/org-kit/organization/workforce_registry.json#L879) |
| AGENT-018 / Noah Williams | Analyst & Reviewer — VANTA | Brand, Media & Audience Intelligence / VANTA | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E221: `packages/org-kit/organization/workforce_registry.json:930`](../packages/org-kit/organization/workforce_registry.json#L930) |
| AGENT-019 / Fatou Diop | Principal Specialist — ORACLE | Brand, Media & Audience Intelligence / ORACLE | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E222: `packages/org-kit/organization/workforce_registry.json:981`](../packages/org-kit/organization/workforce_registry.json#L981) |
| AGENT-020 / Kenji Sato | Analyst & Reviewer — ORACLE | Brand, Media & Audience Intelligence / ORACLE | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E223: `packages/org-kit/organization/workforce_registry.json:1032`](../packages/org-kit/organization/workforce_registry.json#L1032) |
| AGENT-021 / Sofia Alvarez | Principal Specialist — QUANTA | Brand, Media & Audience Intelligence / QUANTA | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E224: `packages/org-kit/organization/workforce_registry.json:1083`](../packages/org-kit/organization/workforce_registry.json#L1083) |
| AGENT-022 / Kwame Boateng | Analyst & Reviewer — QUANTA | Brand, Media & Audience Intelligence / QUANTA | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E225: `packages/org-kit/organization/workforce_registry.json:1134`](../packages/org-kit/organization/workforce_registry.json#L1134) |
| AGENT-023 / Anika Patel | Principal Specialist — PULSE | Brand, Media & Audience Intelligence / PULSE | Sonia Bantu | Skills: reputation_intelligence, web_research, source_verification, quality_review; Responsibilities: reputation_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E226: `packages/org-kit/organization/workforce_registry.json:1185`](../packages/org-kit/organization/workforce_registry.json#L1185) |
| AGENT-024 / Lars Andersen | Analyst & Reviewer — PULSE | Brand, Media & Audience Intelligence / PULSE | Sonia Bantu | Skills: reputation_intelligence, web_research, source_verification, quality_review; Responsibilities: reputation_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E227: `packages/org-kit/organization/workforce_registry.json:1236`](../packages/org-kit/organization/workforce_registry.json#L1236) |
| AGENT-025 / Amara Nwosu | Principal Specialist — VERITY | Brand, Media & Audience Intelligence / VERITY | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E228: `packages/org-kit/organization/workforce_registry.json:1287`](../packages/org-kit/organization/workforce_registry.json#L1287) |
| AGENT-026 / Diego Martínez | Analyst & Reviewer — VERITY | Brand, Media & Audience Intelligence / VERITY | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E229: `packages/org-kit/organization/workforce_registry.json:1338`](../packages/org-kit/organization/workforce_registry.json#L1338) |
| AGENT-027 / Mariam El-Sayed | Principal Specialist — FORGE | Brand, Media & Audience Intelligence / FORGE | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E230: `packages/org-kit/organization/workforce_registry.json:1389`](../packages/org-kit/organization/workforce_registry.json#L1389) |
| AGENT-028 / João Pereira | Analyst & Reviewer — FORGE | Brand, Media & Audience Intelligence / FORGE | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E231: `packages/org-kit/organization/workforce_registry.json:1440`](../packages/org-kit/organization/workforce_registry.json#L1440) |
| AGENT-029 / Tariro Moyo | Principal Specialist — RHODES | Brand, Media & Audience Intelligence / RHODES | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E232: `packages/org-kit/organization/workforce_registry.json:1491`](../packages/org-kit/organization/workforce_registry.json#L1491) |
| AGENT-030 / Eun-ji Kim | Analyst & Reviewer — RHODES | Brand, Media & Audience Intelligence / RHODES | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E233: `packages/org-kit/organization/workforce_registry.json:1542`](../packages/org-kit/organization/workforce_registry.json#L1542) |
| AGENT-031 / Isabella Rossi | Principal Specialist — PRISM | Brand, Media & Audience Intelligence / PRISM | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E234: `packages/org-kit/organization/workforce_registry.json:1593`](../packages/org-kit/organization/workforce_registry.json#L1593) |
| AGENT-032 / Omar Farouk | Analyst & Reviewer — PRISM | Brand, Media & Audience Intelligence / PRISM | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E235: `packages/org-kit/organization/workforce_registry.json:1644`](../packages/org-kit/organization/workforce_registry.json#L1644) |
| AGENT-033 / Nia Robinson | Principal Specialist — HALO | Brand, Media & Audience Intelligence / HALO | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E236: `packages/org-kit/organization/workforce_registry.json:1695`](../packages/org-kit/organization/workforce_registry.json#L1695) |
| AGENT-034 / Arjun Mehta | Analyst & Reviewer — HALO | Brand, Media & Audience Intelligence / HALO | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E237: `packages/org-kit/organization/workforce_registry.json:1746`](../packages/org-kit/organization/workforce_registry.json#L1746) |
| AGENT-035 / Camille Tremblay | Principal Specialist — TITAN | Brand, Media & Audience Intelligence / TITAN | Sonia Bantu | Skills: reputation_intelligence, web_research, source_verification, quality_review; Responsibilities: reputation_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E238: `packages/org-kit/organization/workforce_registry.json:1797`](../packages/org-kit/organization/workforce_registry.json#L1797) |
| AGENT-036 / Tomas Novák | Analyst & Reviewer — TITAN | Brand, Media & Audience Intelligence / TITAN | Sonia Bantu | Skills: reputation_intelligence, web_research, source_verification, quality_review; Responsibilities: reputation_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E239: `packages/org-kit/organization/workforce_registry.json:1848`](../packages/org-kit/organization/workforce_registry.json#L1848) |
| AGENT-037 / Aisha Bello | Principal Specialist — MAGNET | Brand, Media & Audience Intelligence / MAGNET | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E240: `packages/org-kit/organization/workforce_registry.json:1899`](../packages/org-kit/organization/workforce_registry.json#L1899) |
| AGENT-038 / Hugo Moreau | Analyst & Reviewer — MAGNET | Brand, Media & Audience Intelligence / MAGNET | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E241: `packages/org-kit/organization/workforce_registry.json:1950`](../packages/org-kit/organization/workforce_registry.json#L1950) |
| AGENT-039 / Priya Shah | Principal Specialist — FLUX | Brand, Media & Audience Intelligence / FLUX | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E242: `packages/org-kit/organization/workforce_registry.json:2001`](../packages/org-kit/organization/workforce_registry.json#L2001) |
| AGENT-040 / Bongani Khumalo | Analyst & Reviewer — FLUX | Brand, Media & Audience Intelligence / FLUX | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E243: `packages/org-kit/organization/workforce_registry.json:2052`](../packages/org-kit/organization/workforce_registry.json#L2052) |
| AGENT-041 / Lina Nguyen | Principal Specialist — LIVEWIRE | Brand, Media & Audience Intelligence / LIVEWIRE | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E244: `packages/org-kit/organization/workforce_registry.json:2103`](../packages/org-kit/organization/workforce_registry.json#L2103) |
| AGENT-042 / Gabriel Costa | Analyst & Reviewer — LIVEWIRE | Brand, Media & Audience Intelligence / LIVEWIRE | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E245: `packages/org-kit/organization/workforce_registry.json:2154`](../packages/org-kit/organization/workforce_registry.json#L2154) |
| AGENT-043 / Samira Qureshi | Principal Specialist — ECHO | Brand, Media & Audience Intelligence / ECHO | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E246: `packages/org-kit/organization/workforce_registry.json:2205`](../packages/org-kit/organization/workforce_registry.json#L2205) |
| AGENT-044 / Elias Petrov | Analyst & Reviewer — ECHO | Brand, Media & Audience Intelligence / ECHO | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E247: `packages/org-kit/organization/workforce_registry.json:2256`](../packages/org-kit/organization/workforce_registry.json#L2256) |
| AGENT-045 / Yara Mansour | Principal Specialist — CUT | Brand, Media & Audience Intelligence / CUT | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E248: `packages/org-kit/organization/workforce_registry.json:2307`](../packages/org-kit/organization/workforce_registry.json#L2307) |
| AGENT-046 / Emeka Eze | Analyst & Reviewer — CUT | Brand, Media & Audience Intelligence / CUT | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E249: `packages/org-kit/organization/workforce_registry.json:2358`](../packages/org-kit/organization/workforce_registry.json#L2358) |
| AGENT-047 / Marta Kowalska | Principal Specialist — SONIC | Brand, Media & Audience Intelligence / SONIC | Sonia Bantu | Skills: reputation_intelligence, web_research, source_verification, quality_review; Responsibilities: reputation_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E250: `packages/org-kit/organization/workforce_registry.json:2409`](../packages/org-kit/organization/workforce_registry.json#L2409) |
| AGENT-048 / Min-ho Lee | Analyst & Reviewer — SONIC | Brand, Media & Audience Intelligence / SONIC | Sonia Bantu | Skills: reputation_intelligence, web_research, source_verification, quality_review; Responsibilities: reputation_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E251: `packages/org-kit/organization/workforce_registry.json:2460`](../packages/org-kit/organization/workforce_registry.json#L2460) |
| AGENT-049 / Chloe Bennett | Principal Specialist — SIGNAL | Brand, Media & Audience Intelligence / SIGNAL | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E252: `packages/org-kit/organization/workforce_registry.json:2511`](../packages/org-kit/organization/workforce_registry.json#L2511) |
| AGENT-050 / Rafael Mendes | Analyst & Reviewer — SIGNAL | Brand, Media & Audience Intelligence / SIGNAL | Sonia Bantu | Skills: brand_strategy, web_research, source_verification, quality_review; Responsibilities: brand_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E253: `packages/org-kit/organization/workforce_registry.json:2562`](../packages/org-kit/organization/workforce_registry.json#L2562) |
| AGENT-051 / Noura Al-Mansouri | Principal Specialist — MOSAIC | Brand, Media & Audience Intelligence / MOSAIC | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E254: `packages/org-kit/organization/workforce_registry.json:2613`](../packages/org-kit/organization/workforce_registry.json#L2613) |
| AGENT-052 / Tendai Muchengeti | Analyst & Reviewer — MOSAIC | Brand, Media & Audience Intelligence / MOSAIC | Sonia Bantu | Skills: content_strategy, web_research, source_verification, quality_review; Responsibilities: content_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E255: `packages/org-kit/organization/workforce_registry.json:2664`](../packages/org-kit/organization/workforce_registry.json#L2664) |
| AGENT-053 / Freja Lindholm | Principal Specialist — CHORUS | Brand, Media & Audience Intelligence / CHORUS | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E256: `packages/org-kit/organization/workforce_registry.json:2715`](../packages/org-kit/organization/workforce_registry.json#L2715) |
| AGENT-054 / Dario Conti | Analyst & Reviewer — CHORUS | Brand, Media & Audience Intelligence / CHORUS | Sonia Bantu | Skills: audience_intelligence, web_research, source_verification, quality_review; Responsibilities: audience_intelligence, evidence_or_assumption_labeling, handoff_ready_outputs | [E257: `packages/org-kit/organization/workforce_registry.json:2766`](../packages/org-kit/organization/workforce_registry.json#L2766) |
| AGENT-055 / Mei Lin | Principal Specialist — SHIELD | Brand, Media & Audience Intelligence / SHIELD | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E258: `packages/org-kit/organization/workforce_registry.json:2817`](../packages/org-kit/organization/workforce_registry.json#L2817) |
| AGENT-056 / Grace Owusu | Analyst & Reviewer — SHIELD | Brand, Media & Audience Intelligence / SHIELD | Sonia Bantu | Skills: creative_direction, web_research, source_verification, quality_review; Responsibilities: creative_direction, evidence_or_assumption_labeling, handoff_ready_outputs | [E259: `packages/org-kit/organization/workforce_registry.json:2868`](../packages/org-kit/organization/workforce_registry.json#L2868) |
| AGENT-057 / Alejandro Ruiz | Principal Specialist — MIRROR | Brand, Media & Audience Intelligence / MIRROR | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E260: `packages/org-kit/organization/workforce_registry.json:2919`](../packages/org-kit/organization/workforce_registry.json#L2919) |
| AGENT-058 / Sana Khan | Analyst & Reviewer — MIRROR | Brand, Media & Audience Intelligence / MIRROR | Sonia Bantu | Skills: media_distribution, web_research, source_verification, quality_review; Responsibilities: media_distribution, evidence_or_assumption_labeling, handoff_ready_outputs | [E261: `packages/org-kit/organization/workforce_registry.json:2970`](../packages/org-kit/organization/workforce_registry.json#L2970) |
| AGENT-059 / Theo Martin | Principal Specialist — VECTOR | Commercial & Growth Marketing Intelligence / VECTOR | David Eniolade | Skills: product_marketing, web_research, source_verification, quality_review; Responsibilities: product_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E262: `packages/org-kit/organization/workforce_registry.json:3021`](../packages/org-kit/organization/workforce_registry.json#L3021) |
| AGENT-060 / Nneka Obi | Analyst & Reviewer — VECTOR | Commercial & Growth Marketing Intelligence / VECTOR | David Eniolade | Skills: product_marketing, web_research, source_verification, quality_review; Responsibilities: product_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E263: `packages/org-kit/organization/workforce_registry.json:3072`](../packages/org-kit/organization/workforce_registry.json#L3072) |
| AGENT-061 / Yuki Tanaka | Principal Specialist — NEXUS | Commercial & Growth Marketing Intelligence / NEXUS | David Eniolade | Skills: demand_generation, web_research, source_verification, quality_review; Responsibilities: demand_generation, evidence_or_assumption_labeling, handoff_ready_outputs | [E264: `packages/org-kit/organization/workforce_registry.json:3123`](../packages/org-kit/organization/workforce_registry.json#L3123) |
| AGENT-062 / Andrés Valdés | Analyst & Reviewer — NEXUS | Commercial & Growth Marketing Intelligence / NEXUS | David Eniolade | Skills: demand_generation, web_research, source_verification, quality_review; Responsibilities: demand_generation, evidence_or_assumption_labeling, handoff_ready_outputs | [E265: `packages/org-kit/organization/workforce_registry.json:3174`](../packages/org-kit/organization/workforce_registry.json#L3174) |
| AGENT-063 / Claire Dubois | Principal Specialist — LEDGER | Commercial & Growth Marketing Intelligence / LEDGER | David Eniolade | Skills: growth_strategy, web_research, source_verification, quality_review; Responsibilities: growth_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E266: `packages/org-kit/organization/workforce_registry.json:3225`](../packages/org-kit/organization/workforce_registry.json#L3225) |
| AGENT-064 / Sipho Dlamini | Analyst & Reviewer — LEDGER | Commercial & Growth Marketing Intelligence / LEDGER | David Eniolade | Skills: growth_strategy, web_research, source_verification, quality_review; Responsibilities: growth_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E267: `packages/org-kit/organization/workforce_registry.json:3276`](../packages/org-kit/organization/workforce_registry.json#L3276) |
| AGENT-065 / Helena Varga | Principal Specialist — CONDUCTOR | Commercial & Growth Marketing Intelligence / CONDUCTOR | David Eniolade | Skills: marketing_operations, web_research, source_verification, quality_review; Responsibilities: marketing_operations, evidence_or_assumption_labeling, handoff_ready_outputs | [E268: `packages/org-kit/organization/workforce_registry.json:3327`](../packages/org-kit/organization/workforce_registry.json#L3327) |
| AGENT-066 / Rajiv Menon | Analyst & Reviewer — CONDUCTOR | Commercial & Growth Marketing Intelligence / CONDUCTOR | David Eniolade | Skills: marketing_operations, web_research, source_verification, quality_review; Responsibilities: marketing_operations, evidence_or_assumption_labeling, handoff_ready_outputs | [E269: `packages/org-kit/organization/workforce_registry.json:3378`](../packages/org-kit/organization/workforce_registry.json#L3378) |
| AGENT-067 / Farah Hussein | Principal Specialist — SENTINEL | Commercial & Growth Marketing Intelligence / SENTINEL | David Eniolade | Skills: sales_enablement, web_research, source_verification, quality_review; Responsibilities: sales_enablement, evidence_or_assumption_labeling, handoff_ready_outputs | [E270: `packages/org-kit/organization/workforce_registry.json:3429`](../packages/org-kit/organization/workforce_registry.json#L3429) |
| AGENT-068 / Caleb Adebayo | Analyst & Reviewer — SENTINEL | Commercial & Growth Marketing Intelligence / SENTINEL | David Eniolade | Skills: sales_enablement, web_research, source_verification, quality_review; Responsibilities: sales_enablement, evidence_or_assumption_labeling, handoff_ready_outputs | [E271: `packages/org-kit/organization/workforce_registry.json:3480`](../packages/org-kit/organization/workforce_registry.json#L3480) |
| AGENT-069 / Elena Popescu | Principal Specialist — MUSE | Commercial & Growth Marketing Intelligence / MUSE | David Eniolade | Skills: customer_marketing, web_research, source_verification, quality_review; Responsibilities: customer_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E272: `packages/org-kit/organization/workforce_registry.json:3531`](../packages/org-kit/organization/workforce_registry.json#L3531) |
| AGENT-070 / Marcus Chen | Analyst & Reviewer — MUSE | Commercial & Growth Marketing Intelligence / MUSE | David Eniolade | Skills: customer_marketing, web_research, source_verification, quality_review; Responsibilities: customer_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E273: `packages/org-kit/organization/workforce_registry.json:3582`](../packages/org-kit/organization/workforce_registry.json#L3582) |
| AGENT-071 / Aiko Fujimoto | Principal Specialist — PROPEL | Commercial & Growth Marketing Intelligence / PROPEL | David Eniolade | Skills: product_marketing, web_research, source_verification, quality_review; Responsibilities: product_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E274: `packages/org-kit/organization/workforce_registry.json:3633`](../packages/org-kit/organization/workforce_registry.json#L3633) |
| AGENT-072 / Javier Morales | Analyst & Reviewer — PROPEL | Commercial & Growth Marketing Intelligence / PROPEL | David Eniolade | Skills: product_marketing, web_research, source_verification, quality_review; Responsibilities: product_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E275: `packages/org-kit/organization/workforce_registry.json:3684`](../packages/org-kit/organization/workforce_registry.json#L3684) |
| AGENT-073 / Naomi Ito | Principal Specialist — DEMAND | Commercial & Growth Marketing Intelligence / DEMAND | David Eniolade | Skills: demand_generation, web_research, source_verification, quality_review; Responsibilities: demand_generation, evidence_or_assumption_labeling, handoff_ready_outputs | [E276: `packages/org-kit/organization/workforce_registry.json:3735`](../packages/org-kit/organization/workforce_registry.json#L3735) |
| AGENT-074 / Kojo Asante | Analyst & Reviewer — DEMAND | Commercial & Growth Marketing Intelligence / DEMAND | David Eniolade | Skills: demand_generation, web_research, source_verification, quality_review; Responsibilities: demand_generation, evidence_or_assumption_labeling, handoff_ready_outputs | [E277: `packages/org-kit/organization/workforce_registry.json:3786`](../packages/org-kit/organization/workforce_registry.json#L3786) |
| AGENT-075 / Sven Bergström | Principal Specialist — REVOPS | Commercial & Growth Marketing Intelligence / REVOPS | David Eniolade | Skills: growth_strategy, web_research, source_verification, quality_review; Responsibilities: growth_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E278: `packages/org-kit/organization/workforce_registry.json:3837`](../packages/org-kit/organization/workforce_registry.json#L3837) |
| AGENT-076 / Dalia Habib | Analyst & Reviewer — REVOPS | Commercial & Growth Marketing Intelligence / REVOPS | David Eniolade | Skills: growth_strategy, web_research, source_verification, quality_review; Responsibilities: growth_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E279: `packages/org-kit/organization/workforce_registry.json:3888`](../packages/org-kit/organization/workforce_registry.json#L3888) |
| AGENT-077 / Ife Ogunleye | Principal Specialist — LIFECYCLE | Commercial & Growth Marketing Intelligence / LIFECYCLE | David Eniolade | Skills: marketing_operations, web_research, source_verification, quality_review; Responsibilities: marketing_operations, evidence_or_assumption_labeling, handoff_ready_outputs | [E280: `packages/org-kit/organization/workforce_registry.json:3939`](../packages/org-kit/organization/workforce_registry.json#L3939) |
| AGENT-078 / Pavel Horák | Analyst & Reviewer — LIFECYCLE | Commercial & Growth Marketing Intelligence / LIFECYCLE | David Eniolade | Skills: marketing_operations, web_research, source_verification, quality_review; Responsibilities: marketing_operations, evidence_or_assumption_labeling, handoff_ready_outputs | [E281: `packages/org-kit/organization/workforce_registry.json:3990`](../packages/org-kit/organization/workforce_registry.json#L3990) |
| AGENT-079 / Sora Choi | Principal Specialist — CONVERT | Commercial & Growth Marketing Intelligence / CONVERT | David Eniolade | Skills: sales_enablement, web_research, source_verification, quality_review; Responsibilities: sales_enablement, evidence_or_assumption_labeling, handoff_ready_outputs | [E282: `packages/org-kit/organization/workforce_registry.json:4041`](../packages/org-kit/organization/workforce_registry.json#L4041) |
| AGENT-080 / Luca Romano | Analyst & Reviewer — CONVERT | Commercial & Growth Marketing Intelligence / CONVERT | David Eniolade | Skills: sales_enablement, web_research, source_verification, quality_review; Responsibilities: sales_enablement, evidence_or_assumption_labeling, handoff_ready_outputs | [E283: `packages/org-kit/organization/workforce_registry.json:4092`](../packages/org-kit/organization/workforce_registry.json#L4092) |
| AGENT-081 / Amélie Laurent | Principal Specialist — AUTHORITY | Commercial & Growth Marketing Intelligence / AUTHORITY | David Eniolade | Skills: customer_marketing, web_research, source_verification, quality_review; Responsibilities: customer_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E284: `packages/org-kit/organization/workforce_registry.json:4143`](../packages/org-kit/organization/workforce_registry.json#L4143) |
| AGENT-082 / Katarina Novak | Analyst & Reviewer — AUTHORITY | Commercial & Growth Marketing Intelligence / AUTHORITY | David Eniolade | Skills: customer_marketing, web_research, source_verification, quality_review; Responsibilities: customer_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E285: `packages/org-kit/organization/workforce_registry.json:4194`](../packages/org-kit/organization/workforce_registry.json#L4194) |
| AGENT-083 / Mikhail Sokolov | Principal Specialist — ENABLE | Commercial & Growth Marketing Intelligence / ENABLE | David Eniolade | Skills: product_marketing, web_research, source_verification, quality_review; Responsibilities: product_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E286: `packages/org-kit/organization/workforce_registry.json:4245`](../packages/org-kit/organization/workforce_registry.json#L4245) |
| AGENT-084 / Hana Suzuki | Analyst & Reviewer — ENABLE | Commercial & Growth Marketing Intelligence / ENABLE | David Eniolade | Skills: product_marketing, web_research, source_verification, quality_review; Responsibilities: product_marketing, evidence_or_assumption_labeling, handoff_ready_outputs | [E287: `packages/org-kit/organization/workforce_registry.json:4296`](../packages/org-kit/organization/workforce_registry.json#L4296) |
| AGENT-085 / Samuel Okoro | Principal Specialist — ADVOCATE | Commercial & Growth Marketing Intelligence / ADVOCATE | David Eniolade | Skills: demand_generation, web_research, source_verification, quality_review; Responsibilities: demand_generation, evidence_or_assumption_labeling, handoff_ready_outputs | [E288: `packages/org-kit/organization/workforce_registry.json:4347`](../packages/org-kit/organization/workforce_registry.json#L4347) |
| AGENT-086 / Léa Bernard | Analyst & Reviewer — ADVOCATE | Commercial & Growth Marketing Intelligence / ADVOCATE | David Eniolade | Skills: demand_generation, web_research, source_verification, quality_review; Responsibilities: demand_generation, evidence_or_assumption_labeling, handoff_ready_outputs | [E289: `packages/org-kit/organization/workforce_registry.json:4398`](../packages/org-kit/organization/workforce_registry.json#L4398) |
| AGENT-087 / Nicolás Fernández | Principal Specialist — FIELD | Commercial & Growth Marketing Intelligence / FIELD | David Eniolade | Skills: growth_strategy, web_research, source_verification, quality_review; Responsibilities: growth_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E290: `packages/org-kit/organization/workforce_registry.json:4449`](../packages/org-kit/organization/workforce_registry.json#L4449) |
| AGENT-088 / Rania Khalil | Analyst & Reviewer — FIELD | Commercial & Growth Marketing Intelligence / FIELD | David Eniolade | Skills: growth_strategy, web_research, source_verification, quality_review; Responsibilities: growth_strategy, evidence_or_assumption_labeling, handoff_ready_outputs | [E291: `packages/org-kit/organization/workforce_registry.json:4500`](../packages/org-kit/organization/workforce_registry.json#L4500) |
| AGENT-089 / Zuri Kamau | Principal Specialist — COMPASS | Commercial & Growth Marketing Intelligence / COMPASS | David Eniolade | Skills: marketing_operations, web_research, source_verification, quality_review; Responsibilities: marketing_operations, evidence_or_assumption_labeling, handoff_ready_outputs | [E292: `packages/org-kit/organization/workforce_registry.json:4551`](../packages/org-kit/organization/workforce_registry.json#L4551) |
| AGENT-090 / Viktor Meyer | Analyst & Reviewer — COMPASS | Commercial & Growth Marketing Intelligence / COMPASS | David Eniolade | Skills: marketing_operations, web_research, source_verification, quality_review; Responsibilities: marketing_operations, evidence_or_assumption_labeling, handoff_ready_outputs | [E293: `packages/org-kit/organization/workforce_registry.json:4602`](../packages/org-kit/organization/workforce_registry.json#L4602) |

#### DIR-03 — Sales & Revenue

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-091 / Adewale Bakare | Principal Specialist — Enterprise Sales | Enterprise Sales / Enterprise Sales Core | Ijie Alpha | Skills: enterprise_sales_strategy, account_planning, complex_deal_management, executive_selling, web_research, source_verification, quality_review; Responsibilities: enterprise_sales_strategy, account_planning, complex_deal_management, executive_selling, pipeline_management | [E294: `packages/org-kit/organization/workforce_registry.json:4653`](../packages/org-kit/organization/workforce_registry.json#L4653) |
| AGENT-092 / Giulia Bianchi | Analyst & Reviewer — Enterprise Sales | Enterprise Sales / Enterprise Sales Core | Ijie Alpha | Skills: enterprise_sales_strategy, account_planning, complex_deal_management, executive_selling, web_research, source_verification, quality_review; Responsibilities: enterprise_sales_strategy, account_planning, complex_deal_management, executive_selling, pipeline_management | [E295: `packages/org-kit/organization/workforce_registry.json:4709`](../packages/org-kit/organization/workforce_registry.json#L4709) |
| AGENT-093 / Noor Al-Khatib | Principal Specialist — SMB & Mid-Market Sales | SMB & Mid-Market Sales / SMB & Mid-Market Sales Core | Muyiwa Agoro | Skills: commercial_sales, high_velocity_pipeline, territory_management, deal_qualification, web_research, source_verification, quality_review; Responsibilities: commercial_sales, high_velocity_pipeline, territory_management, deal_qualification, sales_forecasting | [E296: `packages/org-kit/organization/workforce_registry.json:4765`](../packages/org-kit/organization/workforce_registry.json#L4765) |
| AGENT-094 / Ren Watanabe | Analyst & Reviewer — SMB & Mid-Market Sales | SMB & Mid-Market Sales / SMB & Mid-Market Sales Core | Muyiwa Agoro | Skills: commercial_sales, high_velocity_pipeline, territory_management, deal_qualification, web_research, source_verification, quality_review; Responsibilities: commercial_sales, high_velocity_pipeline, territory_management, deal_qualification, sales_forecasting | [E297: `packages/org-kit/organization/workforce_registry.json:4821`](../packages/org-kit/organization/workforce_registry.json#L4821) |
| AGENT-095 / Mpho Ndlovu | Principal Specialist — Sales Development & Pipeline Generation | Sales Development & Pipeline Generation / Sales Development & Pipeline Generation Core | Mosope Talabi | Skills: prospecting, lead_qualification, outbound_sequence_design, inbound_triage, web_research, source_verification, quality_review; Responsibilities: prospecting, lead_qualification, outbound_sequence_design, inbound_triage, meeting_generation | [E298: `packages/org-kit/organization/workforce_registry.json:4877`](../packages/org-kit/organization/workforce_registry.json#L4877) |
| AGENT-096 / Carmen Ortega | Analyst & Reviewer — Sales Development & Pipeline Generation | Sales Development & Pipeline Generation / Sales Development & Pipeline Generation Core | Mosope Talabi | Skills: prospecting, lead_qualification, outbound_sequence_design, inbound_triage, web_research, source_verification, quality_review; Responsibilities: prospecting, lead_qualification, outbound_sequence_design, inbound_triage, meeting_generation | [E299: `packages/org-kit/organization/workforce_registry.json:4933`](../packages/org-kit/organization/workforce_registry.json#L4933) |
| AGENT-097 / Yusuf Karim | Principal Specialist — Solutions & Technical Sales | Solutions & Technical Sales / Solutions & Technical Sales Core | Matthew Okonunfua | Skills: technical_discovery, solution_design, demo_strategy, pre_sales_architecture, web_research, source_verification, quality_review; Responsibilities: technical_discovery, solution_design, demo_strategy, pre_sales_architecture, technical_validation | [E300: `packages/org-kit/organization/workforce_registry.json:4989`](../packages/org-kit/organization/workforce_registry.json#L4989) |
| AGENT-098 / Bruno Costa | Analyst & Reviewer — Solutions & Technical Sales | Solutions & Technical Sales / Solutions & Technical Sales Core | Matthew Okonunfua | Skills: technical_discovery, solution_design, demo_strategy, pre_sales_architecture, web_research, source_verification, quality_review; Responsibilities: technical_discovery, solution_design, demo_strategy, pre_sales_architecture, technical_validation | [E301: `packages/org-kit/organization/workforce_registry.json:5045`](../packages/org-kit/organization/workforce_registry.json#L5045) |
| AGENT-099 / Lena Schmidt | Principal Specialist — Channel & Partner Sales | Channel & Partner Sales / Channel & Partner Sales Core | Oluwaseun Lambo | Skills: channel_strategy, partner_recruitment, partner_enablement, co_sell_planning, web_research, source_verification, quality_review; Responsibilities: channel_strategy, partner_recruitment, partner_enablement, co_sell_planning, channel_pipeline | [E302: `packages/org-kit/organization/workforce_registry.json:5101`](../packages/org-kit/organization/workforce_registry.json#L5101) |
| AGENT-100 / Tobi Akinola | Analyst & Reviewer — Channel & Partner Sales | Channel & Partner Sales / Channel & Partner Sales Core | Oluwaseun Lambo | Skills: channel_strategy, partner_recruitment, partner_enablement, co_sell_planning, web_research, source_verification, quality_review; Responsibilities: channel_strategy, partner_recruitment, partner_enablement, co_sell_planning, channel_pipeline | [E303: `packages/org-kit/organization/workforce_registry.json:5157`](../packages/org-kit/organization/workforce_registry.json#L5157) |
| AGENT-101 / Ana Petrescu | Principal Specialist — Account Management & Expansion | Account Management & Expansion / Account Management & Expansion Core | Sam Patel | Skills: account_growth, renewal_strategy, upsell_cross_sell, relationship_management, web_research, source_verification, quality_review; Responsibilities: account_growth, renewal_strategy, upsell_cross_sell, relationship_management, account_health | [E304: `packages/org-kit/organization/workforce_registry.json:5213`](../packages/org-kit/organization/workforce_registry.json#L5213) |
| AGENT-102 / Daisuke Mori | Analyst & Reviewer — Account Management & Expansion | Account Management & Expansion / Account Management & Expansion Core | Sam Patel | Skills: account_growth, renewal_strategy, upsell_cross_sell, relationship_management, web_research, source_verification, quality_review; Responsibilities: account_growth, renewal_strategy, upsell_cross_sell, relationship_management, account_health | [E305: `packages/org-kit/organization/workforce_registry.json:5269`](../packages/org-kit/organization/workforce_registry.json#L5269) |
| AGENT-103 / Imani Carter | Principal Specialist — Revenue Operations & Sales Intelligence | Revenue Operations & Sales Intelligence / Revenue Operations & Sales Intelligence Core | Sylvester Anyanwu | Skills: crm_governance, sales_forecasting, pipeline_analytics, territory_design, web_research, source_verification, quality_review; Responsibilities: crm_governance, sales_forecasting, pipeline_analytics, territory_design, sales_process | [E306: `packages/org-kit/organization/workforce_registry.json:5325`](../packages/org-kit/organization/workforce_registry.json#L5325) |
| AGENT-104 / Mina Hosseini | Analyst & Reviewer — Revenue Operations & Sales Intelligence | Revenue Operations & Sales Intelligence / Revenue Operations & Sales Intelligence Core | Sylvester Anyanwu | Skills: crm_governance, sales_forecasting, pipeline_analytics, territory_design, web_research, source_verification, quality_review; Responsibilities: crm_governance, sales_forecasting, pipeline_analytics, territory_design, sales_process | [E307: `packages/org-kit/organization/workforce_registry.json:5381`](../packages/org-kit/organization/workforce_registry.json#L5381) |

#### DIR-04 — Product

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-105 / Leandro Souza | Principal Specialist — Product Strategy & Portfolio | Product Strategy & Portfolio / Product Strategy & Portfolio Core | Dee Jay Khaled | Skills: product_strategy, portfolio_prioritization, product_vision, market_fit_analysis, web_research, source_verification, quality_review; Responsibilities: product_strategy, portfolio_prioritization, product_vision, market_fit_analysis, investment_prioritization | [E308: `packages/org-kit/organization/workforce_registry.json:5437`](../packages/org-kit/organization/workforce_registry.json#L5437) |
| AGENT-106 / Saanvi Rao | Analyst & Reviewer — Product Strategy & Portfolio | Product Strategy & Portfolio / Product Strategy & Portfolio Core | Dee Jay Khaled | Skills: product_strategy, portfolio_prioritization, product_vision, market_fit_analysis, web_research, source_verification, quality_review; Responsibilities: product_strategy, portfolio_prioritization, product_vision, market_fit_analysis, investment_prioritization | [E309: `packages/org-kit/organization/workforce_registry.json:5493`](../packages/org-kit/organization/workforce_registry.json#L5493) |
| AGENT-107 / Osei Agyeman | Principal Specialist — Product Management | Product Management / Product Management Core | Kamsiyochukwu Igboekwe | Skills: requirements_management, roadmap_management, feature_prioritization, product_discovery, web_research, source_verification, quality_review; Responsibilities: requirements_management, roadmap_management, feature_prioritization, product_discovery, stakeholder_alignment | [E310: `packages/org-kit/organization/workforce_registry.json:5549`](../packages/org-kit/organization/workforce_registry.json#L5549) |
| AGENT-108 / Marina Kovač | Analyst & Reviewer — Product Management | Product Management / Product Management Core | Kamsiyochukwu Igboekwe | Skills: requirements_management, roadmap_management, feature_prioritization, product_discovery, web_research, source_verification, quality_review; Responsibilities: requirements_management, roadmap_management, feature_prioritization, product_discovery, stakeholder_alignment | [E311: `packages/org-kit/organization/workforce_registry.json:5605`](../packages/org-kit/organization/workforce_registry.json#L5605) |
| AGENT-109 / Hassan Bashir | Principal Specialist — Product Operations | Product Operations / Product Operations Core | Kiki Palmer | Skills: product_planning_ops, release_readiness, decision_tracking, product_process_design, web_research, source_verification, quality_review; Responsibilities: product_planning_ops, release_readiness, decision_tracking, product_process_design, cross_functional_coordination | [E312: `packages/org-kit/organization/workforce_registry.json:5661`](../packages/org-kit/organization/workforce_registry.json#L5661) |
| AGENT-110 / Erika Sørensen | Analyst & Reviewer — Product Operations | Product Operations / Product Operations Core | Kiki Palmer | Skills: product_planning_ops, release_readiness, decision_tracking, product_process_design, web_research, source_verification, quality_review; Responsibilities: product_planning_ops, release_readiness, decision_tracking, product_process_design, cross_functional_coordination | [E313: `packages/org-kit/organization/workforce_registry.json:5717`](../packages/org-kit/organization/workforce_registry.json#L5717) |
| AGENT-111 / Kelechi Umeh | Principal Specialist — Product Research & Customer Discovery | Product Research & Customer Discovery / Product Research & Customer Discovery Core | Denzel Washington | Skills: user_research, customer_interviews, problem_validation, persona_research, web_research, source_verification, quality_review; Responsibilities: user_research, customer_interviews, problem_validation, persona_research, jobs_to_be_done | [E314: `packages/org-kit/organization/workforce_registry.json:5773`](../packages/org-kit/organization/workforce_registry.json#L5773) |
| AGENT-112 / Adriana Paz | Analyst & Reviewer — Product Research & Customer Discovery | Product Research & Customer Discovery / Product Research & Customer Discovery Core | Denzel Washington | Skills: user_research, customer_interviews, problem_validation, persona_research, web_research, source_verification, quality_review; Responsibilities: user_research, customer_interviews, problem_validation, persona_research, jobs_to_be_done | [E315: `packages/org-kit/organization/workforce_registry.json:5829`](../packages/org-kit/organization/workforce_registry.json#L5829) |
| AGENT-113 / Victor Liu | Principal Specialist — Product Analytics & Intelligence | Product Analytics & Intelligence / Product Analytics & Intelligence Core | Kaisochukwu Nnaji | Skills: product_analytics, adoption_analysis, retention_analysis, experiment_design, web_research, source_verification, quality_review; Responsibilities: product_analytics, adoption_analysis, retention_analysis, experiment_design, feature_usage_analysis | [E316: `packages/org-kit/organization/workforce_registry.json:5885`](../packages/org-kit/organization/workforce_registry.json#L5885) |
| AGENT-114 / Mariam Ncube | Analyst & Reviewer — Product Analytics & Intelligence | Product Analytics & Intelligence / Product Analytics & Intelligence Core | Kaisochukwu Nnaji | Skills: product_analytics, adoption_analysis, retention_analysis, experiment_design, web_research, source_verification, quality_review; Responsibilities: product_analytics, adoption_analysis, retention_analysis, experiment_design, feature_usage_analysis | [E317: `packages/org-kit/organization/workforce_registry.json:5941`](../packages/org-kit/organization/workforce_registry.json#L5941) |
| AGENT-115 / Fiona MacLeod | Principal Specialist — User Experience & Service Design | User Experience & Service Design / User Experience & Service Design Core | Inaas Abdul | Skills: ux_strategy, journey_mapping, service_design, usability_research, web_research, source_verification, quality_review; Responsibilities: ux_strategy, journey_mapping, service_design, usability_research, accessibility_review | [E318: `packages/org-kit/organization/workforce_registry.json:5997`](../packages/org-kit/organization/workforce_registry.json#L5997) |
| AGENT-116 / Ximena Torres | Analyst & Reviewer — User Experience & Service Design | User Experience & Service Design / User Experience & Service Design Core | Inaas Abdul | Skills: ux_strategy, journey_mapping, service_design, usability_research, web_research, source_verification, quality_review; Responsibilities: ux_strategy, journey_mapping, service_design, usability_research, accessibility_review | [E319: `packages/org-kit/organization/workforce_registry.json:6053`](../packages/org-kit/organization/workforce_registry.json#L6053) |
| AGENT-117 / Seyi Adeyemi | Principal Specialist — Release & Product Lifecycle Management | Release & Product Lifecycle Management / Release & Product Lifecycle Management Core | Abiodun Iseniyi | Skills: release_governance, lifecycle_management, launch_readiness, deprecation_planning, web_research, source_verification, quality_review; Responsibilities: release_governance, lifecycle_management, launch_readiness, deprecation_planning, change_coordination | [E320: `packages/org-kit/organization/workforce_registry.json:6109`](../packages/org-kit/organization/workforce_registry.json#L6109) |
| AGENT-118 / Nikolai Ivanov | Analyst & Reviewer — Release & Product Lifecycle Management | Release & Product Lifecycle Management / Release & Product Lifecycle Management Core | Abiodun Iseniyi | Skills: release_governance, lifecycle_management, launch_readiness, deprecation_planning, web_research, source_verification, quality_review; Responsibilities: release_governance, lifecycle_management, launch_readiness, deprecation_planning, change_coordination | [E321: `packages/org-kit/organization/workforce_registry.json:6165`](../packages/org-kit/organization/workforce_registry.json#L6165) |

#### DIR-05 — Engineering & Technology

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-119 / Hye-jin Seo | Principal Specialist — Software Engineering | Software Engineering / Software Engineering Core | Sofoluwe Coker | Skills: frontend_engineering, backend_engineering, application_architecture, code_review, web_research, source_verification, quality_review; Responsibilities: frontend_engineering, backend_engineering, application_architecture, code_review, software_design | [E322: `packages/org-kit/organization/workforce_registry.json:6221`](../packages/org-kit/organization/workforce_registry.json#L6221) |
| AGENT-120 / Salma Zahra | Analyst & Reviewer — Software Engineering | Software Engineering / Software Engineering Core | Sofoluwe Coker | Skills: frontend_engineering, backend_engineering, application_architecture, code_review, web_research, source_verification, quality_review; Responsibilities: frontend_engineering, backend_engineering, application_architecture, code_review, software_design | [E323: `packages/org-kit/organization/workforce_registry.json:6277`](../packages/org-kit/organization/workforce_registry.json#L6277) |
| AGENT-121 / Daniel Cho | Principal Specialist — Mobile & Client Platforms | Mobile & Client Platforms / Mobile & Client Platforms Core | Ernest Abhulimehn | Skills: mobile_engineering, desktop_clients, cross_platform_architecture, client_performance, web_research, source_verification, quality_review; Responsibilities: mobile_engineering, desktop_clients, cross_platform_architecture, client_performance, device_integration | [E324: `packages/org-kit/organization/workforce_registry.json:6333`](../packages/org-kit/organization/workforce_registry.json#L6333) |
| AGENT-122 / Ariane Beaumont | Analyst & Reviewer — Mobile & Client Platforms | Mobile & Client Platforms / Mobile & Client Platforms Core | Ernest Abhulimehn | Skills: mobile_engineering, desktop_clients, cross_platform_architecture, client_performance, web_research, source_verification, quality_review; Responsibilities: mobile_engineering, desktop_clients, cross_platform_architecture, client_performance, device_integration | [E325: `packages/org-kit/organization/workforce_registry.json:6389`](../packages/org-kit/organization/workforce_registry.json#L6389) |
| AGENT-123 / Felix Weber | Principal Specialist — Platform Engineering & Core Infrastructure | Platform Engineering & Core Infrastructure / Platform Engineering & Core Infrastructure Core | Tinashe Muzenyi | Skills: platform_engineering, shared_services, developer_platforms, runtime_architecture, web_research, source_verification, quality_review; Responsibilities: platform_engineering, shared_services, developer_platforms, runtime_architecture, service_frameworks | [E326: `packages/org-kit/organization/workforce_registry.json:6445`](../packages/org-kit/organization/workforce_registry.json#L6445) |
| AGENT-124 / Talia Green | Analyst & Reviewer — Platform Engineering & Core Infrastructure | Platform Engineering & Core Infrastructure / Platform Engineering & Core Infrastructure Core | Tinashe Muzenyi | Skills: platform_engineering, shared_services, developer_platforms, runtime_architecture, web_research, source_verification, quality_review; Responsibilities: platform_engineering, shared_services, developer_platforms, runtime_architecture, service_frameworks | [E327: `packages/org-kit/organization/workforce_registry.json:6501`](../packages/org-kit/organization/workforce_registry.json#L6501) |
| AGENT-125 / Rami Aziz | Principal Specialist — Architecture & Technical Strategy | Architecture & Technical Strategy / Architecture & Technical Strategy Core | Sophia Mercurri | Skills: enterprise_architecture, solution_architecture, technology_standards, architecture_review, web_research, source_verification, quality_review; Responsibilities: enterprise_architecture, solution_architecture, technology_standards, architecture_review, scalability_design | [E328: `packages/org-kit/organization/workforce_registry.json:6557`](../packages/org-kit/organization/workforce_registry.json#L6557) |
| AGENT-126 / Sophie Müller | Analyst & Reviewer — Architecture & Technical Strategy | Architecture & Technical Strategy / Architecture & Technical Strategy Core | Sophia Mercurri | Skills: enterprise_architecture, solution_architecture, technology_standards, architecture_review, web_research, source_verification, quality_review; Responsibilities: enterprise_architecture, solution_architecture, technology_standards, architecture_review, scalability_design | [E329: `packages/org-kit/organization/workforce_registry.json:6613`](../packages/org-kit/organization/workforce_registry.json#L6613) |
| AGENT-127 / Olu Afolayan | Principal Specialist — API, Integrations & Developer Ecosystem | API, Integrations & Developer Ecosystem / API, Integrations & Developer Ecosystem Core | Omolara Suara | Skills: api_design, integration_architecture, sdk_design, partner_integrations, web_research, source_verification, quality_review; Responsibilities: api_design, integration_architecture, sdk_design, partner_integrations, developer_experience | [E330: `packages/org-kit/organization/workforce_registry.json:6669`](../packages/org-kit/organization/workforce_registry.json#L6669) |
| AGENT-128 / Marisol Vega | Analyst & Reviewer — API, Integrations & Developer Ecosystem | API, Integrations & Developer Ecosystem / API, Integrations & Developer Ecosystem Core | Omolara Suara | Skills: api_design, integration_architecture, sdk_design, partner_integrations, web_research, source_verification, quality_review; Responsibilities: api_design, integration_architecture, sdk_design, partner_integrations, developer_experience | [E331: `packages/org-kit/organization/workforce_registry.json:6725`](../packages/org-kit/organization/workforce_registry.json#L6725) |
| AGENT-129 / Joon Kang | Principal Specialist — DevOps, SRE & Cloud Engineering | DevOps, SRE & Cloud Engineering / DevOps, SRE & Cloud Engineering Core | Raven May Mei | Skills: cicd, site_reliability, cloud_infrastructure, observability, web_research, source_verification, quality_review; Responsibilities: cicd, site_reliability, cloud_infrastructure, observability, capacity_management | [E332: `packages/org-kit/organization/workforce_registry.json:6781`](../packages/org-kit/organization/workforce_registry.json#L6781) |
| AGENT-130 / Abena Ofori | Analyst & Reviewer — DevOps, SRE & Cloud Engineering | DevOps, SRE & Cloud Engineering / DevOps, SRE & Cloud Engineering Core | Raven May Mei | Skills: cicd, site_reliability, cloud_infrastructure, observability, web_research, source_verification, quality_review; Responsibilities: cicd, site_reliability, cloud_infrastructure, observability, capacity_management | [E333: `packages/org-kit/organization/workforce_registry.json:6837`](../packages/org-kit/organization/workforce_registry.json#L6837) |
| AGENT-131 / Sebastian Keller | Principal Specialist — Quality Engineering & Test Automation | Quality Engineering & Test Automation / Quality Engineering & Test Automation Core | Terhemba Ahile | Skills: test_strategy, test_automation, performance_testing, regression_testing, web_research, source_verification, quality_review; Responsibilities: test_strategy, test_automation, performance_testing, regression_testing, quality_gates | [E334: `packages/org-kit/organization/workforce_registry.json:6893`](../packages/org-kit/organization/workforce_registry.json#L6893) |
| AGENT-132 / Laila Benali | Analyst & Reviewer — Quality Engineering & Test Automation | Quality Engineering & Test Automation / Quality Engineering & Test Automation Core | Terhemba Ahile | Skills: test_strategy, test_automation, performance_testing, regression_testing, web_research, source_verification, quality_review; Responsibilities: test_strategy, test_automation, performance_testing, regression_testing, quality_gates | [E335: `packages/org-kit/organization/workforce_registry.json:6949`](../packages/org-kit/organization/workforce_registry.json#L6949) |
| AGENT-133 / Chiamaka Nnaji | Principal Specialist — Release Engineering & Configuration Management | Release Engineering & Configuration Management / Release Engineering & Configuration Management Core | Rebecca Johnson | Skills: build_systems, release_packaging, versioning, configuration_management, web_research, source_verification, quality_review; Responsibilities: build_systems, release_packaging, versioning, configuration_management, rollback_planning | [E336: `packages/org-kit/organization/workforce_registry.json:7005`](../packages/org-kit/organization/workforce_registry.json#L7005) |
| AGENT-134 / Milan Jovanović | Analyst & Reviewer — Release Engineering & Configuration Management | Release Engineering & Configuration Management / Release Engineering & Configuration Management Core | Rebecca Johnson | Skills: build_systems, release_packaging, versioning, configuration_management, web_research, source_verification, quality_review; Responsibilities: build_systems, release_packaging, versioning, configuration_management, rollback_planning | [E337: `packages/org-kit/organization/workforce_registry.json:7061`](../packages/org-kit/organization/workforce_registry.json#L7061) |
| AGENT-135 / Reina Matsuda | Principal Specialist — Engineering Productivity & Developer Experience | Engineering Productivity & Developer Experience / Engineering Productivity & Developer Experience Core | Étienne Moreau | Skills: developer_productivity, engineering_tooling, dev_environment_design, coding_standards, web_research, source_verification, quality_review; Responsibilities: developer_productivity, engineering_tooling, dev_environment_design, coding_standards, workflow_automation | [E338: `packages/org-kit/organization/workforce_registry.json:7117`](../packages/org-kit/organization/workforce_registry.json#L7117) |
| AGENT-136 / Owen Murphy | Analyst & Reviewer — Engineering Productivity & Developer Experience | Engineering Productivity & Developer Experience / Engineering Productivity & Developer Experience Core | Étienne Moreau | Skills: developer_productivity, engineering_tooling, dev_environment_design, coding_standards, web_research, source_verification, quality_review; Responsibilities: developer_productivity, engineering_tooling, dev_environment_design, coding_standards, workflow_automation | [E339: `packages/org-kit/organization/workforce_registry.json:7173`](../packages/org-kit/organization/workforce_registry.json#L7173) |
| AGENT-137 / Adjoa Quartey | Principal Specialist — Technical Documentation & Engineering Knowledge | Technical Documentation & Engineering Knowledge / Technical Documentation & Engineering Knowledge Core | Leila Haddad | Skills: technical_writing, architecture_documentation, runbook_design, developer_docs, web_research, source_verification, quality_review; Responsibilities: technical_writing, architecture_documentation, runbook_design, developer_docs, knowledge_management | [E340: `packages/org-kit/organization/workforce_registry.json:7229`](../packages/org-kit/organization/workforce_registry.json#L7229) |
| AGENT-138 / Luis Herrera | Analyst & Reviewer — Technical Documentation & Engineering Knowledge | Technical Documentation & Engineering Knowledge / Technical Documentation & Engineering Knowledge Core | Leila Haddad | Skills: technical_writing, architecture_documentation, runbook_design, developer_docs, web_research, source_verification, quality_review; Responsibilities: technical_writing, architecture_documentation, runbook_design, developer_docs, knowledge_management | [E341: `packages/org-kit/organization/workforce_registry.json:7285`](../packages/org-kit/organization/workforce_registry.json#L7285) |

#### DIR-06 — Data & Artificial Intelligence

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-139 / Neha Desai | Principal Specialist — AI Engineering & Applied Intelligence | AI Engineering & Applied Intelligence / AI Engineering & Applied Intelligence Core | Lukas Schneider | Skills: llm_integration, ai_application_engineering, inference_workflows, ai_automation, web_research, source_verification, quality_review; Responsibilities: llm_integration, ai_application_engineering, inference_workflows, ai_automation, production_ai | [E342: `packages/org-kit/organization/workforce_registry.json:7341`](../packages/org-kit/organization/workforce_registry.json#L7341) |
| AGENT-140 / Hakeem Lawal | Analyst & Reviewer — AI Engineering & Applied Intelligence | AI Engineering & Applied Intelligence / AI Engineering & Applied Intelligence Core | Lukas Schneider | Skills: llm_integration, ai_application_engineering, inference_workflows, ai_automation, web_research, source_verification, quality_review; Responsibilities: llm_integration, ai_application_engineering, inference_workflows, ai_automation, production_ai | [E343: `packages/org-kit/organization/workforce_registry.json:7397`](../packages/org-kit/organization/workforce_registry.json#L7397) |
| AGENT-141 / Nora Jensen | Principal Specialist — Agent Architecture & AI Workforce Systems | Agent Architecture & AI Workforce Systems / Agent Architecture & AI Workforce Systems Core | Hanae Nakamura | Skills: agent_architecture, multi_agent_orchestration, agent_registry, agent_lifecycle, web_research, source_verification, quality_review; Responsibilities: agent_architecture, multi_agent_orchestration, agent_registry, agent_lifecycle, capability_mapping | [E344: `packages/org-kit/organization/workforce_registry.json:7453`](../packages/org-kit/organization/workforce_registry.json#L7453) |
| AGENT-142 / Ming Zhao | Analyst & Reviewer — Agent Architecture & AI Workforce Systems | Agent Architecture & AI Workforce Systems / Agent Architecture & AI Workforce Systems Core | Hanae Nakamura | Skills: agent_architecture, multi_agent_orchestration, agent_registry, agent_lifecycle, web_research, source_verification, quality_review; Responsibilities: agent_architecture, multi_agent_orchestration, agent_registry, agent_lifecycle, capability_mapping | [E345: `packages/org-kit/organization/workforce_registry.json:7509`](../packages/org-kit/organization/workforce_registry.json#L7509) |
| AGENT-143 / Esteban Cruz | Principal Specialist — Skill Engineering & Tool Orchestration | Skill Engineering & Tool Orchestration / Skill Engineering & Tool Orchestration Core | Mateo Fernández | Skills: skill_design, tool_contracts, skill_testing, tool_routing, web_research, source_verification, quality_review; Responsibilities: skill_design, tool_contracts, skill_testing, tool_routing, permission_integration | [E346: `packages/org-kit/organization/workforce_registry.json:7565`](../packages/org-kit/organization/workforce_registry.json#L7565) |
| AGENT-144 / Yetunde Salami | Analyst & Reviewer — Skill Engineering & Tool Orchestration | Skill Engineering & Tool Orchestration / Skill Engineering & Tool Orchestration Core | Mateo Fernández | Skills: skill_design, tool_contracts, skill_testing, tool_routing, web_research, source_verification, quality_review; Responsibilities: skill_design, tool_contracts, skill_testing, tool_routing, permission_integration | [E347: `packages/org-kit/organization/workforce_registry.json:7621`](../packages/org-kit/organization/workforce_registry.json#L7621) |
| AGENT-145 / Ivan Dimitrov | Principal Specialist — Machine Learning & Model Development | Machine Learning & Model Development / Machine Learning & Model Development Core | Dr. Priyanka Rao | Skills: machine_learning, model_training, fine_tuning, predictive_modeling, web_research, source_verification, quality_review; Responsibilities: machine_learning, model_training, fine_tuning, predictive_modeling, recommendation_systems | [E348: `packages/org-kit/organization/workforce_registry.json:7677`](../packages/org-kit/organization/workforce_registry.json#L7677) |
| AGENT-146 / Muna Abbas | Analyst & Reviewer — Machine Learning & Model Development | Machine Learning & Model Development / Machine Learning & Model Development Core | Dr. Priyanka Rao | Skills: machine_learning, model_training, fine_tuning, predictive_modeling, web_research, source_verification, quality_review; Responsibilities: machine_learning, model_training, fine_tuning, predictive_modeling, recommendation_systems | [E349: `packages/org-kit/organization/workforce_registry.json:7733`](../packages/org-kit/organization/workforce_registry.json#L7733) |
| AGENT-147 / Tatsuya Kobayashi | Principal Specialist — Model Evaluation, Reliability & Intelligence Quality | Model Evaluation, Reliability & Intelligence Quality / Model Evaluation, Reliability & Intelligence Quality Core | Elias Haddad | Skills: model_evaluation, hallucination_testing, benchmarking, regression_testing, web_research, source_verification, quality_review; Responsibilities: model_evaluation, hallucination_testing, benchmarking, regression_testing, red_team_coordination | [E350: `packages/org-kit/organization/workforce_registry.json:7789`](../packages/org-kit/organization/workforce_registry.json#L7789) |
| AGENT-148 / Sabrina Fontaine | Analyst & Reviewer — Model Evaluation, Reliability & Intelligence Quality | Model Evaluation, Reliability & Intelligence Quality / Model Evaluation, Reliability & Intelligence Quality Core | Elias Haddad | Skills: model_evaluation, hallucination_testing, benchmarking, regression_testing, web_research, source_verification, quality_review; Responsibilities: model_evaluation, hallucination_testing, benchmarking, regression_testing, red_team_coordination | [E351: `packages/org-kit/organization/workforce_registry.json:7845`](../packages/org-kit/organization/workforce_registry.json#L7845) |
| AGENT-149 / Femi Balogun | Principal Specialist — Model Routing & AI Infrastructure | Model Routing & AI Infrastructure / Model Routing & AI Infrastructure Core | Ingrid Bergström | Skills: model_routing, inference_infrastructure, provider_abstraction, local_model_ops, web_research, source_verification, quality_review; Responsibilities: model_routing, inference_infrastructure, provider_abstraction, local_model_ops, cost_performance_optimization | [E352: `packages/org-kit/organization/workforce_registry.json:7901`](../packages/org-kit/organization/workforce_registry.json#L7901) |
| AGENT-150 / Alina Ionescu | Analyst & Reviewer — Model Routing & AI Infrastructure | Model Routing & AI Infrastructure / Model Routing & AI Infrastructure Core | Ingrid Bergström | Skills: model_routing, inference_infrastructure, provider_abstraction, local_model_ops, web_research, source_verification, quality_review; Responsibilities: model_routing, inference_infrastructure, provider_abstraction, local_model_ops, cost_performance_optimization | [E353: `packages/org-kit/organization/workforce_registry.json:7957`](../packages/org-kit/organization/workforce_registry.json#L7957) |
| AGENT-151 / Kwesi Appiah | Principal Specialist — Data Engineering & Data Platforms | Data Engineering & Data Platforms / Data Engineering & Data Platforms Core | Kwesi Boateng | Skills: data_pipelines, data_warehousing, etl_elt, data_architecture, web_research, source_verification, quality_review; Responsibilities: data_pipelines, data_warehousing, etl_elt, data_architecture, data_quality | [E354: `packages/org-kit/organization/workforce_registry.json:8013`](../packages/org-kit/organization/workforce_registry.json#L8013) |
| AGENT-152 / Maya Ben-David | Analyst & Reviewer — Data Engineering & Data Platforms | Data Engineering & Data Platforms / Data Engineering & Data Platforms Core | Kwesi Boateng | Skills: data_pipelines, data_warehousing, etl_elt, data_architecture, web_research, source_verification, quality_review; Responsibilities: data_pipelines, data_warehousing, etl_elt, data_architecture, data_quality | [E355: `packages/org-kit/organization/workforce_registry.json:8069`](../packages/org-kit/organization/workforce_registry.json#L8069) |
| AGENT-153 / Rahul Iyer | Principal Specialist — Data Science & Decision Intelligence | Data Science & Decision Intelligence / Data Science & Decision Intelligence Core | Dr. Sofia Petrovic | Skills: statistical_modeling, forecasting, experimentation, optimization, web_research, source_verification, quality_review; Responsibilities: statistical_modeling, forecasting, experimentation, optimization, decision_science | [E356: `packages/org-kit/organization/workforce_registry.json:8125`](../packages/org-kit/organization/workforce_registry.json#L8125) |
| AGENT-154 / Noelle Brooks | Analyst & Reviewer — Data Science & Decision Intelligence | Data Science & Decision Intelligence / Data Science & Decision Intelligence Core | Dr. Sofia Petrovic | Skills: statistical_modeling, forecasting, experimentation, optimization, web_research, source_verification, quality_review; Responsibilities: statistical_modeling, forecasting, experimentation, optimization, decision_science | [E357: `packages/org-kit/organization/workforce_registry.json:8181`](../packages/org-kit/organization/workforce_registry.json#L8181) |
| AGENT-155 / Jorge Almeida | Principal Specialist — Knowledge Systems & Enterprise Memory | Knowledge Systems & Enterprise Memory / Knowledge Systems & Enterprise Memory Core | Leila Ben Youssef | Skills: knowledge_graphs, semantic_search, rag_systems, vector_databases, web_research, source_verification, quality_review; Responsibilities: knowledge_graphs, semantic_search, rag_systems, vector_databases, provenance | [E358: `packages/org-kit/organization/workforce_registry.json:8237`](../packages/org-kit/organization/workforce_registry.json#L8237) |
| AGENT-156 / Tara Singh | Analyst & Reviewer — Knowledge Systems & Enterprise Memory | Knowledge Systems & Enterprise Memory / Knowledge Systems & Enterprise Memory Core | Leila Ben Youssef | Skills: knowledge_graphs, semantic_search, rag_systems, vector_databases, web_research, source_verification, quality_review; Responsibilities: knowledge_graphs, semantic_search, rag_systems, vector_databases, provenance | [E359: `packages/org-kit/organization/workforce_registry.json:8293`](../packages/org-kit/organization/workforce_registry.json#L8293) |
| AGENT-157 / Maksim Volkov | Principal Specialist — AI Governance Technology & Responsible AI Systems | AI Governance Technology & Responsible AI Systems / AI Governance Technology & Responsible AI Systems Core | Amina El-Sayed | Skills: ai_policy_enforcement, ai_lineage, ai_auditability, approval_gates, web_research, source_verification, quality_review; Responsibilities: ai_policy_enforcement, ai_lineage, ai_auditability, approval_gates, responsible_ai_controls | [E360: `packages/org-kit/organization/workforce_registry.json:8349`](../packages/org-kit/organization/workforce_registry.json#L8349) |
| AGENT-158 / Safiya Abdullahi | Analyst & Reviewer — AI Governance Technology & Responsible AI Systems | AI Governance Technology & Responsible AI Systems / AI Governance Technology & Responsible AI Systems Core | Amina El-Sayed | Skills: ai_policy_enforcement, ai_lineage, ai_auditability, approval_gates, web_research, source_verification, quality_review; Responsibilities: ai_policy_enforcement, ai_lineage, ai_auditability, approval_gates, responsible_ai_controls | [E361: `packages/org-kit/organization/workforce_registry.json:8405`](../packages/org-kit/organization/workforce_registry.json#L8405) |
| AGENT-159 / Enzo Marchetti | Principal Specialist — AI FinOps & Usage Intelligence | AI FinOps & Usage Intelligence / AI FinOps & Usage Intelligence Core | Gabriel Costa | Skills: ai_cost_tracking, token_economics, compute_utilization, capacity_planning, web_research, source_verification, quality_review; Responsibilities: ai_cost_tracking, token_economics, compute_utilization, capacity_planning, cost_optimization | [E362: `packages/org-kit/organization/workforce_registry.json:8461`](../packages/org-kit/organization/workforce_registry.json#L8461) |
| AGENT-160 / Zoe Lam | Analyst & Reviewer — AI FinOps & Usage Intelligence | AI FinOps & Usage Intelligence / AI FinOps & Usage Intelligence Core | Gabriel Costa | Skills: ai_cost_tracking, token_economics, compute_utilization, capacity_planning, web_research, source_verification, quality_review; Responsibilities: ai_cost_tracking, token_economics, compute_utilization, capacity_planning, cost_optimization | [E363: `packages/org-kit/organization/workforce_registry.json:8517`](../packages/org-kit/organization/workforce_registry.json#L8517) |
| AGENT-161 / Chinedu Okafor | Principal Specialist — AI Platform Operations & Observability | AI Platform Operations & Observability / AI Platform Operations & Observability Core | Min-jun Park | Skills: agent_observability, model_monitoring, trace_analysis, latency_monitoring, web_research, source_verification, quality_review; Responsibilities: agent_observability, model_monitoring, trace_analysis, latency_monitoring, drift_monitoring | [E364: `packages/org-kit/organization/workforce_registry.json:8573`](../packages/org-kit/organization/workforce_registry.json#L8573) |
| AGENT-162 / Elise van Dijk | Analyst & Reviewer — AI Platform Operations & Observability | AI Platform Operations & Observability / AI Platform Operations & Observability Core | Min-jun Park | Skills: agent_observability, model_monitoring, trace_analysis, latency_monitoring, web_research, source_verification, quality_review; Responsibilities: agent_observability, model_monitoring, trace_analysis, latency_monitoring, drift_monitoring | [E365: `packages/org-kit/organization/workforce_registry.json:8629`](../packages/org-kit/organization/workforce_registry.json#L8629) |

#### DIR-07 — Research & Development

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-163 / Hasan Demir | Principal Specialist — Applied Research | Applied Research / Applied Research Core | Dr. Tendai Muchengeti | Skills: applied_research, research_design, technical_experimentation, evidence_synthesis, web_research, source_verification, quality_review; Responsibilities: applied_research, research_design, technical_experimentation, evidence_synthesis, prototype_evaluation | [E366: `packages/org-kit/organization/workforce_registry.json:8685`](../packages/org-kit/organization/workforce_registry.json#L8685) |
| AGENT-164 / Natsuki Arai | Analyst & Reviewer — Applied Research | Applied Research / Applied Research Core | Dr. Tendai Muchengeti | Skills: applied_research, research_design, technical_experimentation, evidence_synthesis, web_research, source_verification, quality_review; Responsibilities: applied_research, research_design, technical_experimentation, evidence_synthesis, prototype_evaluation | [E367: `packages/org-kit/organization/workforce_registry.json:8741`](../packages/org-kit/organization/workforce_registry.json#L8741) |
| AGENT-165 / Bianca Santos | Principal Specialist — Emerging Technologies & Future Systems | Emerging Technologies & Future Systems / Emerging Technologies & Future Systems Core | Kenji Mori | Skills: technology_scouting, future_systems, technology_forecasting, experimental_assessment, web_research, source_verification, quality_review; Responsibilities: technology_scouting, future_systems, technology_forecasting, experimental_assessment | [E368: `packages/org-kit/organization/workforce_registry.json:8797`](../packages/org-kit/organization/workforce_registry.json#L8797) |
| AGENT-166 / Tawanda Ncube | Analyst & Reviewer — Emerging Technologies & Future Systems | Emerging Technologies & Future Systems / Emerging Technologies & Future Systems Core | Kenji Mori | Skills: technology_scouting, future_systems, technology_forecasting, experimental_assessment, web_research, source_verification, quality_review; Responsibilities: technology_scouting, future_systems, technology_forecasting, experimental_assessment | [E369: `packages/org-kit/organization/workforce_registry.json:8852`](../packages/org-kit/organization/workforce_registry.json#L8852) |
| AGENT-167 / Linh Tran | Principal Specialist — Experimental Engineering & Prototyping | Experimental Engineering & Prototyping / Experimental Engineering & Prototyping Core | Andrés Valdés | Skills: rapid_prototyping, proof_of_concept, experimental_engineering, prototype_testing, web_research, source_verification, quality_review; Responsibilities: rapid_prototyping, proof_of_concept, experimental_engineering, prototype_testing | [E370: `packages/org-kit/organization/workforce_registry.json:8907`](../packages/org-kit/organization/workforce_registry.json#L8907) |
| AGENT-168 / Isaac Mensah | Analyst & Reviewer — Experimental Engineering & Prototyping | Experimental Engineering & Prototyping / Experimental Engineering & Prototyping Core | Andrés Valdés | Skills: rapid_prototyping, proof_of_concept, experimental_engineering, prototype_testing, web_research, source_verification, quality_review; Responsibilities: rapid_prototyping, proof_of_concept, experimental_engineering, prototype_testing | [E371: `packages/org-kit/organization/workforce_registry.json:8962`](../packages/org-kit/organization/workforce_registry.json#L8962) |
| AGENT-169 / Mariam Said | Principal Specialist — AI & Autonomous Systems Research | AI & Autonomous Systems Research / AI & Autonomous Systems Research Core | Dr. Samira Qureshi | Skills: autonomous_agents_research, multimodal_ai_research, machine_reasoning, agent_autonomy, web_research, source_verification, quality_review; Responsibilities: autonomous_agents_research, multimodal_ai_research, machine_reasoning, agent_autonomy | [E372: `packages/org-kit/organization/workforce_registry.json:9017`](../packages/org-kit/organization/workforce_registry.json#L9017) |
| AGENT-170 / Jonas Eriksen | Analyst & Reviewer — AI & Autonomous Systems Research | AI & Autonomous Systems Research / AI & Autonomous Systems Research Core | Dr. Samira Qureshi | Skills: autonomous_agents_research, multimodal_ai_research, machine_reasoning, agent_autonomy, web_research, source_verification, quality_review; Responsibilities: autonomous_agents_research, multimodal_ai_research, machine_reasoning, agent_autonomy | [E373: `packages/org-kit/organization/workforce_registry.json:9072`](../packages/org-kit/organization/workforce_registry.json#L9072) |
| AGENT-171 / Amina Yusuf | Principal Specialist — Human–Computer Interaction & Future Interfaces | Human–Computer Interaction & Future Interfaces / Human–Computer Interaction & Future Interfaces Core | Freja Lindholm | Skills: hci_research, voice_interfaces, gesture_interfaces, spatial_computing, web_research, source_verification, quality_review; Responsibilities: hci_research, voice_interfaces, gesture_interfaces, spatial_computing, human_ai_interaction | [E374: `packages/org-kit/organization/workforce_registry.json:9127`](../packages/org-kit/organization/workforce_registry.json#L9127) |
| AGENT-172 / Kaito Ishikawa | Analyst & Reviewer — Human–Computer Interaction & Future Interfaces | Human–Computer Interaction & Future Interfaces / Human–Computer Interaction & Future Interfaces Core | Freja Lindholm | Skills: hci_research, voice_interfaces, gesture_interfaces, spatial_computing, web_research, source_verification, quality_review; Responsibilities: hci_research, voice_interfaces, gesture_interfaces, spatial_computing, human_ai_interaction | [E375: `packages/org-kit/organization/workforce_registry.json:9183`](../packages/org-kit/organization/workforce_registry.json#L9183) |
| AGENT-173 / Camila Ferreira | Principal Specialist — Advanced Computing & Systems Research | Advanced Computing & Systems Research / Advanced Computing & Systems Research Core | Dr. Kwame Asante | Skills: distributed_systems_research, edge_computing, privacy_preserving_compute, advanced_architectures, web_research, source_verification, quality_review; Responsibilities: distributed_systems_research, edge_computing, privacy_preserving_compute, advanced_architectures | [E376: `packages/org-kit/organization/workforce_registry.json:9239`](../packages/org-kit/organization/workforce_registry.json#L9239) |
| AGENT-174 / Olivia Reed | Analyst & Reviewer — Advanced Computing & Systems Research | Advanced Computing & Systems Research / Advanced Computing & Systems Research Core | Dr. Kwame Asante | Skills: distributed_systems_research, edge_computing, privacy_preserving_compute, advanced_architectures, web_research, source_verification, quality_review; Responsibilities: distributed_systems_research, edge_computing, privacy_preserving_compute, advanced_architectures | [E377: `packages/org-kit/organization/workforce_registry.json:9294`](../packages/org-kit/organization/workforce_registry.json#L9294) |
| AGENT-175 / Ade Mabaso | Principal Specialist — Research Partnerships & Academic Collaboration | Research Partnerships & Academic Collaboration / Research Partnerships & Academic Collaboration Core | Claire Dubois | Skills: research_partnerships, academic_collaboration, joint_research, grant_scanning, web_research, source_verification, quality_review; Responsibilities: research_partnerships, academic_collaboration, joint_research, grant_scanning | [E378: `packages/org-kit/organization/workforce_registry.json:9349`](../packages/org-kit/organization/workforce_registry.json#L9349) |
| AGENT-176 / Sofia Ivanova | Analyst & Reviewer — Research Partnerships & Academic Collaboration | Research Partnerships & Academic Collaboration / Research Partnerships & Academic Collaboration Core | Claire Dubois | Skills: research_partnerships, academic_collaboration, joint_research, grant_scanning, web_research, source_verification, quality_review; Responsibilities: research_partnerships, academic_collaboration, joint_research, grant_scanning | [E379: `packages/org-kit/organization/workforce_registry.json:9404`](../packages/org-kit/organization/workforce_registry.json#L9404) |
| AGENT-177 / Nabil Rahman | Principal Specialist — Innovation Incubation & Technology Transfer | Innovation Incubation & Technology Transfer / Innovation Incubation & Technology Transfer Core | Rafael Mendes | Skills: innovation_incubation, technology_transfer, maturity_assessment, venture_handoff, web_research, source_verification, quality_review; Responsibilities: innovation_incubation, technology_transfer, maturity_assessment, venture_handoff | [E380: `packages/org-kit/organization/workforce_registry.json:9459`](../packages/org-kit/organization/workforce_registry.json#L9459) |
| AGENT-178 / Akosua Nyarko | Analyst & Reviewer — Innovation Incubation & Technology Transfer | Innovation Incubation & Technology Transfer / Innovation Incubation & Technology Transfer Core | Rafael Mendes | Skills: innovation_incubation, technology_transfer, maturity_assessment, venture_handoff, web_research, source_verification, quality_review; Responsibilities: innovation_incubation, technology_transfer, maturity_assessment, venture_handoff | [E381: `packages/org-kit/organization/workforce_registry.json:9514`](../packages/org-kit/organization/workforce_registry.json#L9514) |
| AGENT-179 / Lorenzo Greco | Principal Specialist — Intellectual Property Discovery & Invention Management | Intellectual Property Discovery & Invention Management / Intellectual Property Discovery & Invention Management Core | Noura Al-Mansouri | Skills: invention_capture, patentability_screening, prior_art_coordination, ip_portfolio_support, web_research, source_verification, quality_review; Responsibilities: invention_capture, patentability_screening, prior_art_coordination, ip_portfolio_support | [E382: `packages/org-kit/organization/workforce_registry.json:9569`](../packages/org-kit/organization/workforce_registry.json#L9569) |
| AGENT-180 / Jia Chen | Analyst & Reviewer — Intellectual Property Discovery & Invention Management | Intellectual Property Discovery & Invention Management / Intellectual Property Discovery & Invention Management Core | Noura Al-Mansouri | Skills: invention_capture, patentability_screening, prior_art_coordination, ip_portfolio_support, web_research, source_verification, quality_review; Responsibilities: invention_capture, patentability_screening, prior_art_coordination, ip_portfolio_support | [E383: `packages/org-kit/organization/workforce_registry.json:9624`](../packages/org-kit/organization/workforce_registry.json#L9624) |
| AGENT-181 / Adaeze Okonkwo | Principal Specialist — Research Intelligence & Scientific Foresight | Research Intelligence & Scientific Foresight / Research Intelligence & Scientific Foresight Core | Dr. Ji-won Seo | Skills: literature_review, patent_landscape, scientific_foresight, research_trend_analysis, web_research, source_verification, quality_review; Responsibilities: literature_review, patent_landscape, scientific_foresight, research_trend_analysis | [E384: `packages/org-kit/organization/workforce_registry.json:9679`](../packages/org-kit/organization/workforce_registry.json#L9679) |
| AGENT-182 / Björn Lindqvist | Analyst & Reviewer — Research Intelligence & Scientific Foresight | Research Intelligence & Scientific Foresight / Research Intelligence & Scientific Foresight Core | Dr. Ji-won Seo | Skills: literature_review, patent_landscape, scientific_foresight, research_trend_analysis, web_research, source_verification, quality_review; Responsibilities: literature_review, patent_landscape, scientific_foresight, research_trend_analysis | [E385: `packages/org-kit/organization/workforce_registry.json:9734`](../packages/org-kit/organization/workforce_registry.json#L9734) |

#### DIR-08 — Information Technology

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-183 / Chidinma Ezeh | Principal Specialist — Enterprise Applications & Business Systems | Enterprise Applications & Business Systems / Enterprise Applications & Business Systems Core | Grace Kimani | Skills: enterprise_apps, business_systems, application_admin, saas_governance, web_research, source_verification, quality_review; Responsibilities: enterprise_apps, business_systems, application_admin, saas_governance | [E386: `packages/org-kit/organization/workforce_registry.json:9789`](../packages/org-kit/organization/workforce_registry.json#L9789) |
| AGENT-184 / Darius Mensah | Analyst & Reviewer — Enterprise Applications & Business Systems | Enterprise Applications & Business Systems / Enterprise Applications & Business Systems Core | Grace Kimani | Skills: enterprise_apps, business_systems, application_admin, saas_governance, web_research, source_verification, quality_review; Responsibilities: enterprise_apps, business_systems, application_admin, saas_governance | [E387: `packages/org-kit/organization/workforce_registry.json:9844`](../packages/org-kit/organization/workforce_registry.json#L9844) |
| AGENT-185 / Emeka Chukwuemeka | Principal Specialist — End-User Computing & Workplace Technology | End-User Computing & Workplace Technology / End-User Computing & Workplace Technology Core | Yuki Tanaka | Skills: endpoint_management, workplace_technology, device_support, desktop_management, web_research, source_verification, quality_review; Responsibilities: endpoint_management, workplace_technology, device_support, desktop_management | [E388: `packages/org-kit/organization/workforce_registry.json:9899`](../packages/org-kit/organization/workforce_registry.json#L9899) |
| AGENT-186 / Fatou Diallo | Analyst & Reviewer — End-User Computing & Workplace Technology | End-User Computing & Workplace Technology / End-User Computing & Workplace Technology Core | Yuki Tanaka | Skills: endpoint_management, workplace_technology, device_support, desktop_management, web_research, source_verification, quality_review; Responsibilities: endpoint_management, workplace_technology, device_support, desktop_management | [E389: `packages/org-kit/organization/workforce_registry.json:9954`](../packages/org-kit/organization/workforce_registry.json#L9954) |
| AGENT-187 / Gustavo Herrera | Principal Specialist — IT Service Management & Service Desk | IT Service Management & Service Desk / IT Service Management & Service Desk Core | Michael O'Connor | Skills: itsm, incident_management, request_management, service_catalog, web_research, source_verification, quality_review; Responsibilities: itsm, incident_management, request_management, service_catalog, problem_management | [E390: `packages/org-kit/organization/workforce_registry.json:10009`](../packages/org-kit/organization/workforce_registry.json#L10009) |
| AGENT-188 / Hana Kovačević | Analyst & Reviewer — IT Service Management & Service Desk | IT Service Management & Service Desk / IT Service Management & Service Desk Core | Michael O'Connor | Skills: itsm, incident_management, request_management, service_catalog, web_research, source_verification, quality_review; Responsibilities: itsm, incident_management, request_management, service_catalog, problem_management | [E391: `packages/org-kit/organization/workforce_registry.json:10065`](../packages/org-kit/organization/workforce_registry.json#L10065) |
| AGENT-189 / Ifeoma Nwosu | Principal Specialist — Cloud & Infrastructure Operations | Cloud & Infrastructure Operations / Cloud & Infrastructure Operations Core | Ananya Deshmukh | Skills: cloud_ops, server_ops, infrastructure_monitoring, backup_operations, web_research, source_verification, quality_review; Responsibilities: cloud_ops, server_ops, infrastructure_monitoring, backup_operations | [E392: `packages/org-kit/organization/workforce_registry.json:10121`](../packages/org-kit/organization/workforce_registry.json#L10121) |
| AGENT-190 / Jabari Osei | Analyst & Reviewer — Cloud & Infrastructure Operations | Cloud & Infrastructure Operations / Cloud & Infrastructure Operations Core | Ananya Deshmukh | Skills: cloud_ops, server_ops, infrastructure_monitoring, backup_operations, web_research, source_verification, quality_review; Responsibilities: cloud_ops, server_ops, infrastructure_monitoring, backup_operations | [E393: `packages/org-kit/organization/workforce_registry.json:10176`](../packages/org-kit/organization/workforce_registry.json#L10176) |
| AGENT-191 / Kemi Adeyemi | Principal Specialist — Network & Connectivity Services | Network & Connectivity Services / Network & Connectivity Services Core | Chinedu Eze | Skills: network_operations, connectivity, network_monitoring, network_capacity, web_research, source_verification, quality_review; Responsibilities: network_operations, connectivity, network_monitoring, network_capacity | [E394: `packages/org-kit/organization/workforce_registry.json:10231`](../packages/org-kit/organization/workforce_registry.json#L10231) |
| AGENT-192 / Layla Mansouri | Analyst & Reviewer — Network & Connectivity Services | Network & Connectivity Services / Network & Connectivity Services Core | Chinedu Eze | Skills: network_operations, connectivity, network_monitoring, network_capacity, web_research, source_verification, quality_review; Responsibilities: network_operations, connectivity, network_monitoring, network_capacity | [E395: `packages/org-kit/organization/workforce_registry.json:10286`](../packages/org-kit/organization/workforce_registry.json#L10286) |
| AGENT-193 / Mamadou Coulibaly | Principal Specialist — Identity & Access Administration | Identity & Access Administration / Identity & Access Administration Core | Katarina Novak | Skills: identity_administration, access_provisioning, joiner_mover_leaver, mfa_admin, web_research, source_verification, quality_review; Responsibilities: identity_administration, access_provisioning, joiner_mover_leaver, mfa_admin, directory_services | [E396: `packages/org-kit/organization/workforce_registry.json:10341`](../packages/org-kit/organization/workforce_registry.json#L10341) |
| AGENT-194 / Nkechi Obiora | Analyst & Reviewer — Identity & Access Administration | Identity & Access Administration / Identity & Access Administration Core | Katarina Novak | Skills: identity_administration, access_provisioning, joiner_mover_leaver, mfa_admin, web_research, source_verification, quality_review; Responsibilities: identity_administration, access_provisioning, joiner_mover_leaver, mfa_admin, directory_services | [E397: `packages/org-kit/organization/workforce_registry.json:10397`](../packages/org-kit/organization/workforce_registry.json#L10397) |
| AGENT-195 / Olusegun Bello | Principal Specialist — Collaboration & Productivity Platforms | Collaboration & Productivity Platforms / Collaboration & Productivity Platforms Core | Farah Rahman | Skills: collaboration_platforms, productivity_suite_admin, messaging_admin, document_collaboration, web_research, source_verification, quality_review; Responsibilities: collaboration_platforms, productivity_suite_admin, messaging_admin, document_collaboration | [E398: `packages/org-kit/organization/workforce_registry.json:10453`](../packages/org-kit/organization/workforce_registry.json#L10453) |
| AGENT-196 / Priya Chandrasekaran | Analyst & Reviewer — Collaboration & Productivity Platforms | Collaboration & Productivity Platforms / Collaboration & Productivity Platforms Core | Farah Rahman | Skills: collaboration_platforms, productivity_suite_admin, messaging_admin, document_collaboration, web_research, source_verification, quality_review; Responsibilities: collaboration_platforms, productivity_suite_admin, messaging_admin, document_collaboration | [E399: `packages/org-kit/organization/workforce_registry.json:10508`](../packages/org-kit/organization/workforce_registry.json#L10508) |
| AGENT-197 / Qian Liu | Principal Specialist — IT Asset & Configuration Management | IT Asset & Configuration Management / IT Asset & Configuration Management Core | João Ferreira | Skills: it_asset_management, cmdb, license_tracking, configuration_management, web_research, source_verification, quality_review; Responsibilities: it_asset_management, cmdb, license_tracking, configuration_management | [E400: `packages/org-kit/organization/workforce_registry.json:10563`](../packages/org-kit/organization/workforce_registry.json#L10563) |
| AGENT-198 / Rina Yamamoto | Analyst & Reviewer — IT Asset & Configuration Management | IT Asset & Configuration Management / IT Asset & Configuration Management Core | João Ferreira | Skills: it_asset_management, cmdb, license_tracking, configuration_management, web_research, source_verification, quality_review; Responsibilities: it_asset_management, cmdb, license_tracking, configuration_management | [E401: `packages/org-kit/organization/workforce_registry.json:10618`](../packages/org-kit/organization/workforce_registry.json#L10618) |
| AGENT-199 / Sade Adeleke | Principal Specialist — Enterprise Systems Administration | Enterprise Systems Administration / Enterprise Systems Administration Core | Thabo Mokoena | Skills: systems_administration, patch_management, server_admin, enterprise_platform_ops, web_research, source_verification, quality_review; Responsibilities: systems_administration, patch_management, server_admin, enterprise_platform_ops | [E402: `packages/org-kit/organization/workforce_registry.json:10673`](../packages/org-kit/organization/workforce_registry.json#L10673) |
| AGENT-200 / Taiwo Akinola | Analyst & Reviewer — Enterprise Systems Administration | Enterprise Systems Administration / Enterprise Systems Administration Core | Thabo Mokoena | Skills: systems_administration, patch_management, server_admin, enterprise_platform_ops, web_research, source_verification, quality_review; Responsibilities: systems_administration, patch_management, server_admin, enterprise_platform_ops | [E403: `packages/org-kit/organization/workforce_registry.json:10728`](../packages/org-kit/organization/workforce_registry.json#L10728) |
| AGENT-201 / Uchenna Okeke | Principal Specialist — IT Architecture & Technology Standards | IT Architecture & Technology Standards / IT Architecture & Technology Standards Core | Dr. Elise van der Meer | Skills: it_architecture, technology_standards, it_roadmap, platform_standardization, web_research, source_verification, quality_review; Responsibilities: it_architecture, technology_standards, it_roadmap, platform_standardization | [E404: `packages/org-kit/organization/workforce_registry.json:10783`](../packages/org-kit/organization/workforce_registry.json#L10783) |
| AGENT-202 / Valentina Cruz | Analyst & Reviewer — IT Architecture & Technology Standards | IT Architecture & Technology Standards / IT Architecture & Technology Standards Core | Dr. Elise van der Meer | Skills: it_architecture, technology_standards, it_roadmap, platform_standardization, web_research, source_verification, quality_review; Responsibilities: it_architecture, technology_standards, it_roadmap, platform_standardization | [E405: `packages/org-kit/organization/workforce_registry.json:10838`](../packages/org-kit/organization/workforce_registry.json#L10838) |

#### DIR-09 — Cybersecurity & Resilience

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-203 / Wanjiru Kamau | Principal Specialist — Security Operations & Incident Response | Security Operations & Incident Response / Security Operations & Incident Response Core | Marcus Lund | Skills: soc_operations, incident_response, detection_triage, case_management, web_research, source_verification, quality_review; Responsibilities: soc_operations, incident_response, detection_triage, case_management, containment_coordination | [E406: `packages/org-kit/organization/workforce_registry.json:10893`](../packages/org-kit/organization/workforce_registry.json#L10893) |
| AGENT-204 / Xiomara Reyes | Analyst & Reviewer — Security Operations & Incident Response | Security Operations & Incident Response / Security Operations & Incident Response Core | Marcus Lund | Skills: soc_operations, incident_response, detection_triage, case_management, web_research, source_verification, quality_review; Responsibilities: soc_operations, incident_response, detection_triage, case_management, containment_coordination | [E407: `packages/org-kit/organization/workforce_registry.json:10949`](../packages/org-kit/organization/workforce_registry.json#L10949) |
| AGENT-205 / Yetunde Adeyinka | Principal Specialist — Threat Intelligence & Threat Hunting | Threat Intelligence & Threat Hunting / Threat Intelligence & Threat Hunting Core | Olumide Adekunle | Skills: threat_intelligence, threat_hunting, ioc_analysis, adversary_tracking, web_research, source_verification, quality_review; Responsibilities: threat_intelligence, threat_hunting, ioc_analysis, adversary_tracking | [E408: `packages/org-kit/organization/workforce_registry.json:11005`](../packages/org-kit/organization/workforce_registry.json#L11005) |
| AGENT-206 / Zara Ahmed | Analyst & Reviewer — Threat Intelligence & Threat Hunting | Threat Intelligence & Threat Hunting / Threat Intelligence & Threat Hunting Core | Olumide Adekunle | Skills: threat_intelligence, threat_hunting, ioc_analysis, adversary_tracking, web_research, source_verification, quality_review; Responsibilities: threat_intelligence, threat_hunting, ioc_analysis, adversary_tracking | [E409: `packages/org-kit/organization/workforce_registry.json:11060`](../packages/org-kit/organization/workforce_registry.json#L11060) |
| AGENT-207 / Abena Asante | Principal Specialist — Identity Security & Privileged Access | Identity Security & Privileged Access / Identity Security & Privileged Access Core | Camille Tremblay | Skills: iam_security, pam, conditional_access, identity_threat_detection, web_research, source_verification, quality_review; Responsibilities: iam_security, pam, conditional_access, identity_threat_detection, least_privilege | [E410: `packages/org-kit/organization/workforce_registry.json:11115`](../packages/org-kit/organization/workforce_registry.json#L11115) |
| AGENT-208 / Babatunde Afolabi | Analyst & Reviewer — Identity Security & Privileged Access | Identity Security & Privileged Access / Identity Security & Privileged Access Core | Camille Tremblay | Skills: iam_security, pam, conditional_access, identity_threat_detection, web_research, source_verification, quality_review; Responsibilities: iam_security, pam, conditional_access, identity_threat_detection, least_privilege | [E411: `packages/org-kit/organization/workforce_registry.json:11171`](../packages/org-kit/organization/workforce_registry.json#L11171) |
| AGENT-209 / Chiamaka Obi | Principal Specialist — Security Engineering | Security Engineering / Security Engineering Core | Arjun Mehra | Skills: security_engineering, security_automation, security_tooling, control_implementation, web_research, source_verification, quality_review; Responsibilities: security_engineering, security_automation, security_tooling, control_implementation | [E412: `packages/org-kit/organization/workforce_registry.json:11227`](../packages/org-kit/organization/workforce_registry.json#L11227) |
| AGENT-210 / Diogo Carvalho | Analyst & Reviewer — Security Engineering | Security Engineering / Security Engineering Core | Arjun Mehra | Skills: security_engineering, security_automation, security_tooling, control_implementation, web_research, source_verification, quality_review; Responsibilities: security_engineering, security_automation, security_tooling, control_implementation | [E413: `packages/org-kit/organization/workforce_registry.json:11282`](../packages/org-kit/organization/workforce_registry.json#L11282) |
| AGENT-211 / Eshe Wangari | Principal Specialist — Cloud & Infrastructure Security | Cloud & Infrastructure Security / Cloud & Infrastructure Security Core | Sofia Dimitrova | Skills: cloud_security, infrastructure_security, configuration_assurance, cloud_posture_management, web_research, source_verification, quality_review; Responsibilities: cloud_security, infrastructure_security, configuration_assurance, cloud_posture_management | [E414: `packages/org-kit/organization/workforce_registry.json:11337`](../packages/org-kit/organization/workforce_registry.json#L11337) |
| AGENT-212 / Femi Olawale | Analyst & Reviewer — Cloud & Infrastructure Security | Cloud & Infrastructure Security / Cloud & Infrastructure Security Core | Sofia Dimitrova | Skills: cloud_security, infrastructure_security, configuration_assurance, cloud_posture_management, web_research, source_verification, quality_review; Responsibilities: cloud_security, infrastructure_security, configuration_assurance, cloud_posture_management | [E415: `packages/org-kit/organization/workforce_registry.json:11392`](../packages/org-kit/organization/workforce_registry.json#L11392) |
| AGENT-213 / Gbolahan Adesanya | Principal Specialist — Application & Product Security | Application & Product Security / Application & Product Security Core | Diego Morales | Skills: application_security, secure_sdlc, code_security, product_threat_modeling, web_research, source_verification, quality_review; Responsibilities: application_security, secure_sdlc, code_security, product_threat_modeling | [E416: `packages/org-kit/organization/workforce_registry.json:11447`](../packages/org-kit/organization/workforce_registry.json#L11447) |
| AGENT-214 / Hadiza Musa | Analyst & Reviewer — Application & Product Security | Application & Product Security / Application & Product Security Core | Diego Morales | Skills: application_security, secure_sdlc, code_security, product_threat_modeling, web_research, source_verification, quality_review; Responsibilities: application_security, secure_sdlc, code_security, product_threat_modeling | [E417: `packages/org-kit/organization/workforce_registry.json:11502`](../packages/org-kit/organization/workforce_registry.json#L11502) |
| AGENT-215 / Ikenna Eze | Principal Specialist — Security Architecture | Security Architecture / Security Architecture Core | Dr. Miriam Kessler | Skills: security_architecture, zero_trust, control_architecture, security_patterns, web_research, source_verification, quality_review; Responsibilities: security_architecture, zero_trust, control_architecture, security_patterns | [E418: `packages/org-kit/organization/workforce_registry.json:11557`](../packages/org-kit/organization/workforce_registry.json#L11557) |
| AGENT-216 / Joëlle Dupont | Analyst & Reviewer — Security Architecture | Security Architecture / Security Architecture Core | Dr. Miriam Kessler | Skills: security_architecture, zero_trust, control_architecture, security_patterns, web_research, source_verification, quality_review; Responsibilities: security_architecture, zero_trust, control_architecture, security_patterns | [E419: `packages/org-kit/organization/workforce_registry.json:11612`](../packages/org-kit/organization/workforce_registry.json#L11612) |
| AGENT-217 / Kehinde Adewale | Principal Specialist — Vulnerability & Exposure Management | Vulnerability & Exposure Management / Vulnerability & Exposure Management Core | Bongani Dlamini | Skills: vulnerability_management, attack_surface_management, remediation_prioritization, exposure_analysis, web_research, source_verification, quality_review; Responsibilities: vulnerability_management, attack_surface_management, remediation_prioritization, exposure_analysis | [E420: `packages/org-kit/organization/workforce_registry.json:11667`](../packages/org-kit/organization/workforce_registry.json#L11667) |
| AGENT-218 / Lami Ibrahim | Analyst & Reviewer — Vulnerability & Exposure Management | Vulnerability & Exposure Management / Vulnerability & Exposure Management Core | Bongani Dlamini | Skills: vulnerability_management, attack_surface_management, remediation_prioritization, exposure_analysis, web_research, source_verification, quality_review; Responsibilities: vulnerability_management, attack_surface_management, remediation_prioritization, exposure_analysis | [E421: `packages/org-kit/organization/workforce_registry.json:11722`](../packages/org-kit/organization/workforce_registry.json#L11722) |
| AGENT-219 / Musa Conteh | Principal Specialist — Data Security & Information Protection | Data Security & Information Protection / Data Security & Information Protection Core | Noor Al-Khatib | Skills: data_security, dlp, classification, encryption_strategy, web_research, source_verification, quality_review; Responsibilities: data_security, dlp, classification, encryption_strategy, information_protection | [E422: `packages/org-kit/organization/workforce_registry.json:11777`](../packages/org-kit/organization/workforce_registry.json#L11777) |
| AGENT-220 / Nana Ama Boateng | Analyst & Reviewer — Data Security & Information Protection | Data Security & Information Protection / Data Security & Information Protection Core | Noor Al-Khatib | Skills: data_security, dlp, classification, encryption_strategy, web_research, source_verification, quality_review; Responsibilities: data_security, dlp, classification, encryption_strategy, information_protection | [E423: `packages/org-kit/organization/workforce_registry.json:11833`](../packages/org-kit/organization/workforce_registry.json#L11833) |
| AGENT-221 / Obi Okwu | Principal Specialist — Third-Party & Supply Chain Security | Third-Party & Supply Chain Security / Third-Party & Supply Chain Security Core | Haruka Watanabe | Skills: third_party_risk, supplier_security, supply_chain_security, vendor_assessment, web_research, source_verification, quality_review; Responsibilities: third_party_risk, supplier_security, supply_chain_security, vendor_assessment | [E424: `packages/org-kit/organization/workforce_registry.json:11889`](../packages/org-kit/organization/workforce_registry.json#L11889) |
| AGENT-222 / Pita Havili | Analyst & Reviewer — Third-Party & Supply Chain Security | Third-Party & Supply Chain Security / Third-Party & Supply Chain Security Core | Haruka Watanabe | Skills: third_party_risk, supplier_security, supply_chain_security, vendor_assessment, web_research, source_verification, quality_review; Responsibilities: third_party_risk, supplier_security, supply_chain_security, vendor_assessment | [E425: `packages/org-kit/organization/workforce_registry.json:11944`](../packages/org-kit/organization/workforce_registry.json#L11944) |
| AGENT-223 / Rashida Hassan | Principal Specialist — Cyber Risk & Security Governance | Cyber Risk & Security Governance / Cyber Risk & Security Governance Core | Gabriela Torres | Skills: cyber_risk, security_governance, security_policy, control_mapping, web_research, source_verification, quality_review; Responsibilities: cyber_risk, security_governance, security_policy, control_mapping | [E426: `packages/org-kit/organization/workforce_registry.json:11999`](../packages/org-kit/organization/workforce_registry.json#L11999) |
| AGENT-224 / Sola Ogunyemi | Analyst & Reviewer — Cyber Risk & Security Governance | Cyber Risk & Security Governance / Cyber Risk & Security Governance Core | Gabriela Torres | Skills: cyber_risk, security_governance, security_policy, control_mapping, web_research, source_verification, quality_review; Responsibilities: cyber_risk, security_governance, security_policy, control_mapping | [E427: `packages/org-kit/organization/workforce_registry.json:12054`](../packages/org-kit/organization/workforce_registry.json#L12054) |
| AGENT-225 / Titilayo Bakare | Principal Specialist — Business Continuity, Disaster Recovery & Cyber Resilience | Business Continuity, Disaster Recovery & Cyber Resilience / Business Continuity, Disaster Recovery & Cyber Resilience Core | Henrik Sørensen | Skills: business_continuity, disaster_recovery, resilience_testing, crisis_recovery, web_research, source_verification, quality_review; Responsibilities: business_continuity, disaster_recovery, resilience_testing, crisis_recovery | [E428: `packages/org-kit/organization/workforce_registry.json:12109`](../packages/org-kit/organization/workforce_registry.json#L12109) |
| AGENT-226 / Uche Nwachukwu | Analyst & Reviewer — Business Continuity, Disaster Recovery & Cyber Resilience | Business Continuity, Disaster Recovery & Cyber Resilience / Business Continuity, Disaster Recovery & Cyber Resilience Core | Henrik Sørensen | Skills: business_continuity, disaster_recovery, resilience_testing, crisis_recovery, web_research, source_verification, quality_review; Responsibilities: business_continuity, disaster_recovery, resilience_testing, crisis_recovery | [E429: `packages/org-kit/organization/workforce_registry.json:12164`](../packages/org-kit/organization/workforce_registry.json#L12164) |

#### DIR-10 — Finance & Accounting

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-227 / Vera Okafor | Principal Specialist — Accounting & Close | Accounting & Close / Accounting & Close Core | Helena Costa | Skills: general_ledger, month_end_close, reconciliations, journal_entries, web_research, source_verification, quality_review; Responsibilities: general_ledger, month_end_close, reconciliations, journal_entries, accounting_policy | [E430: `packages/org-kit/organization/workforce_registry.json:12219`](../packages/org-kit/organization/workforce_registry.json#L12219) |
| AGENT-228 / Wole Soyinka-Jr | Analyst & Reviewer — Accounting & Close | Accounting & Close / Accounting & Close Core | Helena Costa | Skills: general_ledger, month_end_close, reconciliations, journal_entries, web_research, source_verification, quality_review; Responsibilities: general_ledger, month_end_close, reconciliations, journal_entries, accounting_policy | [E431: `packages/org-kit/organization/workforce_registry.json:12275`](../packages/org-kit/organization/workforce_registry.json#L12275) |
| AGENT-229 / Xochitl Reyes | Principal Specialist — Financial Reporting & Consolidation | Financial Reporting & Consolidation / Financial Reporting & Consolidation Core | Kwabena Mensah | Skills: financial_reporting, consolidation, management_reporting, financial_statement_preparation, web_research, source_verification, quality_review; Responsibilities: financial_reporting, consolidation, management_reporting, financial_statement_preparation | [E432: `packages/org-kit/organization/workforce_registry.json:12331`](../packages/org-kit/organization/workforce_registry.json#L12331) |
| AGENT-230 / Yusuf Garba | Analyst & Reviewer — Financial Reporting & Consolidation | Financial Reporting & Consolidation / Financial Reporting & Consolidation Core | Kwabena Mensah | Skills: financial_reporting, consolidation, management_reporting, financial_statement_preparation, web_research, source_verification, quality_review; Responsibilities: financial_reporting, consolidation, management_reporting, financial_statement_preparation | [E433: `packages/org-kit/organization/workforce_registry.json:12386`](../packages/org-kit/organization/workforce_registry.json#L12386) |
| AGENT-231 / Zanele Dube | Principal Specialist — FP&A, Budgeting & Forecasting | FP&A, Budgeting & Forecasting / FP&A, Budgeting & Forecasting Core | Priya Raman | Skills: fp_and_a, budgeting, forecasting, variance_analysis, web_research, source_verification, quality_review; Responsibilities: fp_and_a, budgeting, forecasting, variance_analysis, scenario_modeling | [E434: `packages/org-kit/organization/workforce_registry.json:12441`](../packages/org-kit/organization/workforce_registry.json#L12441) |
| AGENT-232 / Amara Sesay | Analyst & Reviewer — FP&A, Budgeting & Forecasting | FP&A, Budgeting & Forecasting / FP&A, Budgeting & Forecasting Core | Priya Raman | Skills: fp_and_a, budgeting, forecasting, variance_analysis, web_research, source_verification, quality_review; Responsibilities: fp_and_a, budgeting, forecasting, variance_analysis, scenario_modeling | [E435: `packages/org-kit/organization/workforce_registry.json:12497`](../packages/org-kit/organization/workforce_registry.json#L12497) |
| AGENT-233 / Bintou Kouyaté | Principal Specialist — Treasury & Capital Management | Treasury & Capital Management / Treasury & Capital Management Core | Mikhail Petrov | Skills: treasury, cash_management, liquidity_planning, capital_management, web_research, source_verification, quality_review; Responsibilities: treasury, cash_management, liquidity_planning, capital_management, banking_operations | [E436: `packages/org-kit/organization/workforce_registry.json:12553`](../packages/org-kit/organization/workforce_registry.json#L12553) |
| AGENT-234 / Chibundo Igwe | Analyst & Reviewer — Treasury & Capital Management | Treasury & Capital Management / Treasury & Capital Management Core | Mikhail Petrov | Skills: treasury, cash_management, liquidity_planning, capital_management, web_research, source_verification, quality_review; Responsibilities: treasury, cash_management, liquidity_planning, capital_management, banking_operations | [E437: `packages/org-kit/organization/workforce_registry.json:12609`](../packages/org-kit/organization/workforce_registry.json#L12609) |
| AGENT-235 / Dele Adekunle | Principal Specialist — Tax | Tax / Tax Core | Aisha Bello | Skills: tax_compliance, tax_planning, tax_research, indirect_tax, web_research, source_verification, quality_review; Responsibilities: tax_compliance, tax_planning, tax_research, indirect_tax, corporate_tax | [E438: `packages/org-kit/organization/workforce_registry.json:12665`](../packages/org-kit/organization/workforce_registry.json#L12665) |
| AGENT-236 / Ejiro Ativie | Analyst & Reviewer — Tax | Tax / Tax Core | Aisha Bello | Skills: tax_compliance, tax_planning, tax_research, indirect_tax, web_research, source_verification, quality_review; Responsibilities: tax_compliance, tax_planning, tax_research, indirect_tax, corporate_tax | [E439: `packages/org-kit/organization/workforce_registry.json:12721`](../packages/org-kit/organization/workforce_registry.json#L12721) |
| AGENT-237 / Folake Akinbode | Principal Specialist — Billing, Accounts Receivable & Accounts Payable | Billing, Accounts Receivable & Accounts Payable / Billing, Accounts Receivable & Accounts Payable Core | Camila Ferreira | Skills: billing, accounts_receivable, accounts_payable, collections, web_research, source_verification, quality_review; Responsibilities: billing, accounts_receivable, accounts_payable, collections, vendor_payments | [E440: `packages/org-kit/organization/workforce_registry.json:12777`](../packages/org-kit/organization/workforce_registry.json#L12777) |
| AGENT-238 / Gbemi Shasore | Analyst & Reviewer — Billing, Accounts Receivable & Accounts Payable | Billing, Accounts Receivable & Accounts Payable / Billing, Accounts Receivable & Accounts Payable Core | Camila Ferreira | Skills: billing, accounts_receivable, accounts_payable, collections, web_research, source_verification, quality_review; Responsibilities: billing, accounts_receivable, accounts_payable, collections, vendor_payments | [E441: `packages/org-kit/organization/workforce_registry.json:12833`](../packages/org-kit/organization/workforce_registry.json#L12833) |
| AGENT-239 / Halima Jallow | Principal Specialist — Payroll Finance | Payroll Finance / Payroll Finance Core | Thandiwe Ncube | Skills: payroll_accounting, payroll_controls, payroll_reconciliation, compensation_accounting, web_research, source_verification, quality_review; Responsibilities: payroll_accounting, payroll_controls, payroll_reconciliation, compensation_accounting | [E442: `packages/org-kit/organization/workforce_registry.json:12889`](../packages/org-kit/organization/workforce_registry.json#L12889) |
| AGENT-240 / Idara Essien | Analyst & Reviewer — Payroll Finance | Payroll Finance / Payroll Finance Core | Thandiwe Ncube | Skills: payroll_accounting, payroll_controls, payroll_reconciliation, compensation_accounting, web_research, source_verification, quality_review; Responsibilities: payroll_accounting, payroll_controls, payroll_reconciliation, compensation_accounting | [E443: `packages/org-kit/organization/workforce_registry.json:12944`](../packages/org-kit/organization/workforce_registry.json#L12944) |
| AGENT-241 / Jumoke Adegoke | Principal Specialist — Financial Controls & Management Accounting | Financial Controls & Management Accounting / Financial Controls & Management Accounting Core | Giulia Romano | Skills: financial_controls, management_accounting, cost_accounting, control_testing, web_research, source_verification, quality_review; Responsibilities: financial_controls, management_accounting, cost_accounting, control_testing, policy_compliance | [E444: `packages/org-kit/organization/workforce_registry.json:12999`](../packages/org-kit/organization/workforce_registry.json#L12999) |
| AGENT-242 / Kike Adesola | Analyst & Reviewer — Financial Controls & Management Accounting | Financial Controls & Management Accounting / Financial Controls & Management Accounting Core | Giulia Romano | Skills: financial_controls, management_accounting, cost_accounting, control_testing, web_research, source_verification, quality_review; Responsibilities: financial_controls, management_accounting, cost_accounting, control_testing, policy_compliance | [E445: `packages/org-kit/organization/workforce_registry.json:13055`](../packages/org-kit/organization/workforce_registry.json#L13055) |

#### DIR-11 — Legal, Risk & Governance

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-243 / Laide Ogundimu | Principal Specialist — Corporate & Commercial Legal | Corporate & Commercial Legal / Corporate & Commercial Legal Core | Marcus Feldman | Skills: corporate_law, commercial_law, legal_advisory, entity_governance, web_research, source_verification, quality_review; Responsibilities: corporate_law, commercial_law, legal_advisory, entity_governance | [E446: `packages/org-kit/organization/workforce_registry.json:13111`](../packages/org-kit/organization/workforce_registry.json#L13111) |
| AGENT-244 / Moji Akintola | Analyst & Reviewer — Corporate & Commercial Legal | Corporate & Commercial Legal / Corporate & Commercial Legal Core | Marcus Feldman | Skills: corporate_law, commercial_law, legal_advisory, entity_governance, web_research, source_verification, quality_review; Responsibilities: corporate_law, commercial_law, legal_advisory, entity_governance | [E447: `packages/org-kit/organization/workforce_registry.json:13166`](../packages/org-kit/organization/workforce_registry.json#L13166) |
| AGENT-245 / Nifemi Alade | Principal Specialist — Contracts & Transactions | Contracts & Transactions / Contracts & Transactions Core | Zainab Bakare | Skills: contract_review, contract_drafting, transaction_support, negotiation_support, web_research, source_verification, quality_review; Responsibilities: contract_review, contract_drafting, transaction_support, negotiation_support | [E448: `packages/org-kit/organization/workforce_registry.json:13221`](../packages/org-kit/organization/workforce_registry.json#L13221) |
| AGENT-246 / Obiageli Okonkwo | Analyst & Reviewer — Contracts & Transactions | Contracts & Transactions / Contracts & Transactions Core | Zainab Bakare | Skills: contract_review, contract_drafting, transaction_support, negotiation_support, web_research, source_verification, quality_review; Responsibilities: contract_review, contract_drafting, transaction_support, negotiation_support | [E449: `packages/org-kit/organization/workforce_registry.json:13276`](../packages/org-kit/organization/workforce_registry.json#L13276) |
| AGENT-247 / Pelumi Alabi | Principal Specialist — Intellectual Property & Technology Legal | Intellectual Property & Technology Legal / Intellectual Property & Technology Legal Core | Dr. Lucía Herrera | Skills: ip_law, technology_law, software_licensing, ip_strategy, web_research, source_verification, quality_review; Responsibilities: ip_law, technology_law, software_licensing, ip_strategy, patent_support | [E450: `packages/org-kit/organization/workforce_registry.json:13331`](../packages/org-kit/organization/workforce_registry.json#L13331) |
| AGENT-248 / Ronke Bello | Analyst & Reviewer — Intellectual Property & Technology Legal | Intellectual Property & Technology Legal / Intellectual Property & Technology Legal Core | Dr. Lucía Herrera | Skills: ip_law, technology_law, software_licensing, ip_strategy, web_research, source_verification, quality_review; Responsibilities: ip_law, technology_law, software_licensing, ip_strategy, patent_support | [E451: `packages/org-kit/organization/workforce_registry.json:13387`](../packages/org-kit/organization/workforce_registry.json#L13387) |
| AGENT-249 / Seun Adeola | Principal Specialist — Employment Legal | Employment Legal / Employment Legal Core | Daniel Cho | Skills: employment_law, workplace_legal, hr_legal_advice, policy_review, web_research, source_verification, quality_review; Responsibilities: employment_law, workplace_legal, hr_legal_advice, policy_review | [E452: `packages/org-kit/organization/workforce_registry.json:13443`](../packages/org-kit/organization/workforce_registry.json#L13443) |
| AGENT-250 / Tobi Olawuyi | Analyst & Reviewer — Employment Legal | Employment Legal / Employment Legal Core | Daniel Cho | Skills: employment_law, workplace_legal, hr_legal_advice, policy_review, web_research, source_verification, quality_review; Responsibilities: employment_law, workplace_legal, hr_legal_advice, policy_review | [E453: `packages/org-kit/organization/workforce_registry.json:13498`](../packages/org-kit/organization/workforce_registry.json#L13498) |
| AGENT-251 / Ufuoma Oghenekaro | Principal Specialist — Privacy & Data Protection | Privacy & Data Protection / Privacy & Data Protection Core | Amélie Laurent | Skills: privacy_law, data_protection, pia_dpia, data_subject_rights, web_research, source_verification, quality_review; Responsibilities: privacy_law, data_protection, pia_dpia, data_subject_rights, privacy_contracts | [E454: `packages/org-kit/organization/workforce_registry.json:13553`](../packages/org-kit/organization/workforce_registry.json#L13553) |
| AGENT-252 / Vivian Asare | Analyst & Reviewer — Privacy & Data Protection | Privacy & Data Protection / Privacy & Data Protection Core | Amélie Laurent | Skills: privacy_law, data_protection, pia_dpia, data_subject_rights, web_research, source_verification, quality_review; Responsibilities: privacy_law, data_protection, pia_dpia, data_subject_rights, privacy_contracts | [E455: `packages/org-kit/organization/workforce_registry.json:13609`](../packages/org-kit/organization/workforce_registry.json#L13609) |
| AGENT-253 / Wunmi Olatunji | Principal Specialist — Enterprise Risk Management | Enterprise Risk Management / Enterprise Risk Management Core | Sipho Dlamini | Skills: enterprise_risk, risk_register, risk_assessment, risk_reporting, web_research, source_verification, quality_review; Responsibilities: enterprise_risk, risk_register, risk_assessment, risk_reporting | [E456: `packages/org-kit/organization/workforce_registry.json:13665`](../packages/org-kit/organization/workforce_registry.json#L13665) |
| AGENT-254 / Xavi Osei | Analyst & Reviewer — Enterprise Risk Management | Enterprise Risk Management / Enterprise Risk Management Core | Sipho Dlamini | Skills: enterprise_risk, risk_register, risk_assessment, risk_reporting, web_research, source_verification, quality_review; Responsibilities: enterprise_risk, risk_register, risk_assessment, risk_reporting | [E457: `packages/org-kit/organization/workforce_registry.json:13720`](../packages/org-kit/organization/workforce_registry.json#L13720) |
| AGENT-255 / Yemi Akinwande | Principal Specialist — Governance & Board Affairs | Governance & Board Affairs / Governance & Board Affairs Core | Ingrid Madsen | Skills: corporate_governance, board_support, policy_governance, committee_administration, web_research, source_verification, quality_review; Responsibilities: corporate_governance, board_support, policy_governance, committee_administration | [E458: `packages/org-kit/organization/workforce_registry.json:13775`](../packages/org-kit/organization/workforce_registry.json#L13775) |
| AGENT-256 / Zuberu Alhassan | Analyst & Reviewer — Governance & Board Affairs | Governance & Board Affairs / Governance & Board Affairs Core | Ingrid Madsen | Skills: corporate_governance, board_support, policy_governance, committee_administration, web_research, source_verification, quality_review; Responsibilities: corporate_governance, board_support, policy_governance, committee_administration | [E459: `packages/org-kit/organization/workforce_registry.json:13830`](../packages/org-kit/organization/workforce_registry.json#L13830) |
| AGENT-257 / Abiola Ogunbayo | Principal Specialist — Regulatory Compliance & Ethics | Regulatory Compliance & Ethics / Regulatory Compliance & Ethics Core | Farida El-Masri | Skills: regulatory_compliance, ethics_program, compliance_monitoring, policy_compliance, web_research, source_verification, quality_review; Responsibilities: regulatory_compliance, ethics_program, compliance_monitoring, policy_compliance | [E460: `packages/org-kit/organization/workforce_registry.json:13885`](../packages/org-kit/organization/workforce_registry.json#L13885) |
| AGENT-258 / Bisola Adeyemi | Analyst & Reviewer — Regulatory Compliance & Ethics | Regulatory Compliance & Ethics / Regulatory Compliance & Ethics Core | Farida El-Masri | Skills: regulatory_compliance, ethics_program, compliance_monitoring, policy_compliance, web_research, source_verification, quality_review; Responsibilities: regulatory_compliance, ethics_program, compliance_monitoring, policy_compliance | [E461: `packages/org-kit/organization/workforce_registry.json:13940`](../packages/org-kit/organization/workforce_registry.json#L13940) |
| AGENT-259 / Chinwe Eze | Principal Specialist — Records & Information Governance | Records & Information Governance / Records & Information Governance Core | Tomasz Kowalski | Skills: records_management, retention_schedule, information_governance, legal_hold_coordination, web_research, source_verification, quality_review; Responsibilities: records_management, retention_schedule, information_governance, legal_hold_coordination | [E462: `packages/org-kit/organization/workforce_registry.json:13995`](../packages/org-kit/organization/workforce_registry.json#L13995) |
| AGENT-260 / Damilola Abiodun | Analyst & Reviewer — Records & Information Governance | Records & Information Governance / Records & Information Governance Core | Tomasz Kowalski | Skills: records_management, retention_schedule, information_governance, legal_hold_coordination, web_research, source_verification, quality_review; Responsibilities: records_management, retention_schedule, information_governance, legal_hold_coordination | [E463: `packages/org-kit/organization/workforce_registry.json:14050`](../packages/org-kit/organization/workforce_registry.json#L14050) |

#### DIR-12 — People & Culture

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-261 / Ebele Onyeka | Principal Specialist — HR Business Partnering & People Operations | HR Business Partnering & People Operations / HR Business Partnering & People Operations Core | Nneka Eze | Skills: hrbp, people_operations, workforce_support, policy_administration, web_research, source_verification, quality_review; Responsibilities: hrbp, people_operations, workforce_support, policy_administration | [E464: `packages/org-kit/organization/workforce_registry.json:14105`](../packages/org-kit/organization/workforce_registry.json#L14105) |
| AGENT-262 / Funmi Olatunji | Analyst & Reviewer — HR Business Partnering & People Operations | HR Business Partnering & People Operations / HR Business Partnering & People Operations Core | Nneka Eze | Skills: hrbp, people_operations, workforce_support, policy_administration, web_research, source_verification, quality_review; Responsibilities: hrbp, people_operations, workforce_support, policy_administration | [E465: `packages/org-kit/organization/workforce_registry.json:14160`](../packages/org-kit/organization/workforce_registry.json#L14160) |
| AGENT-263 / Gbenga Adekunle | Principal Specialist — Talent Acquisition | Talent Acquisition / Talent Acquisition Core | Sofia Lindström | Skills: recruiting, candidate_sourcing, interview_design, talent_pipeline, web_research, source_verification, quality_review; Responsibilities: recruiting, candidate_sourcing, interview_design, talent_pipeline | [E466: `packages/org-kit/organization/workforce_registry.json:14215`](../packages/org-kit/organization/workforce_registry.json#L14215) |
| AGENT-264 / Hauwa Bello | Analyst & Reviewer — Talent Acquisition | Talent Acquisition / Talent Acquisition Core | Sofia Lindström | Skills: recruiting, candidate_sourcing, interview_design, talent_pipeline, web_research, source_verification, quality_review; Responsibilities: recruiting, candidate_sourcing, interview_design, talent_pipeline | [E467: `packages/org-kit/organization/workforce_registry.json:14270`](../packages/org-kit/organization/workforce_registry.json#L14270) |
| AGENT-265 / Imaobong Etim | Principal Specialist — Onboarding & Employee Experience | Onboarding & Employee Experience / Onboarding & Employee Experience Core | Javier Morales | Skills: employee_onboarding, employee_experience, journey_design, engagement_programs, web_research, source_verification, quality_review; Responsibilities: employee_onboarding, employee_experience, journey_design, engagement_programs | [E468: `packages/org-kit/organization/workforce_registry.json:14325`](../packages/org-kit/organization/workforce_registry.json#L14325) |
| AGENT-266 / Joke Adesanya | Analyst & Reviewer — Onboarding & Employee Experience | Onboarding & Employee Experience / Onboarding & Employee Experience Core | Javier Morales | Skills: employee_onboarding, employee_experience, journey_design, engagement_programs, web_research, source_verification, quality_review; Responsibilities: employee_onboarding, employee_experience, journey_design, engagement_programs | [E469: `packages/org-kit/organization/workforce_registry.json:14380`](../packages/org-kit/organization/workforce_registry.json#L14380) |
| AGENT-267 / Kola Adebisi | Principal Specialist — Employee Relations | Employee Relations / Employee Relations Core | Amina Yusuf | Skills: employee_relations, case_management, workplace_investigations_coordination, conflict_resolution, web_research, source_verification, quality_review; Responsibilities: employee_relations, case_management, workplace_investigations_coordination, conflict_resolution | [E470: `packages/org-kit/organization/workforce_registry.json:14435`](../packages/org-kit/organization/workforce_registry.json#L14435) |
| AGENT-268 / Ladun Oyelaran | Analyst & Reviewer — Employee Relations | Employee Relations / Employee Relations Core | Amina Yusuf | Skills: employee_relations, case_management, workplace_investigations_coordination, conflict_resolution, web_research, source_verification, quality_review; Responsibilities: employee_relations, case_management, workplace_investigations_coordination, conflict_resolution | [E471: `packages/org-kit/organization/workforce_registry.json:14490`](../packages/org-kit/organization/workforce_registry.json#L14490) |
| AGENT-269 / Morenike Adeyemi | Principal Specialist — Total Rewards, Compensation & Benefits | Total Rewards, Compensation & Benefits / Total Rewards, Compensation & Benefits Core | Claire Beaumont | Skills: compensation, benefits, total_rewards, job_architecture, web_research, source_verification, quality_review; Responsibilities: compensation, benefits, total_rewards, job_architecture | [E472: `packages/org-kit/organization/workforce_registry.json:14545`](../packages/org-kit/organization/workforce_registry.json#L14545) |
| AGENT-270 / Ngozi Eze | Analyst & Reviewer — Total Rewards, Compensation & Benefits | Total Rewards, Compensation & Benefits / Total Rewards, Compensation & Benefits Core | Claire Beaumont | Skills: compensation, benefits, total_rewards, job_architecture, web_research, source_verification, quality_review; Responsibilities: compensation, benefits, total_rewards, job_architecture | [E473: `packages/org-kit/organization/workforce_registry.json:14600`](../packages/org-kit/organization/workforce_registry.json#L14600) |
| AGENT-271 / Odunola Okonkwo | Principal Specialist — Performance & Talent Management | Performance & Talent Management / Performance & Talent Management Core | Kofi Agyeman | Skills: performance_management, talent_reviews, succession_planning, goal_management, web_research, source_verification, quality_review; Responsibilities: performance_management, talent_reviews, succession_planning, goal_management | [E474: `packages/org-kit/organization/workforce_registry.json:14655`](../packages/org-kit/organization/workforce_registry.json#L14655) |
| AGENT-272 / Peju Akinola | Analyst & Reviewer — Performance & Talent Management | Performance & Talent Management / Performance & Talent Management Core | Kofi Agyeman | Skills: performance_management, talent_reviews, succession_planning, goal_management, web_research, source_verification, quality_review; Responsibilities: performance_management, talent_reviews, succession_planning, goal_management | [E475: `packages/org-kit/organization/workforce_registry.json:14710`](../packages/org-kit/organization/workforce_registry.json#L14710) |
| AGENT-273 / Rolake Okonkwo | Principal Specialist — Learning & Development | Learning & Development / Learning & Development Core | Hana Suzuki | Skills: learning_design, training_programs, capability_development, curriculum_design, web_research, source_verification, quality_review; Responsibilities: learning_design, training_programs, capability_development, curriculum_design | [E476: `packages/org-kit/organization/workforce_registry.json:14765`](../packages/org-kit/organization/workforce_registry.json#L14765) |
| AGENT-274 / Shade Adewale | Analyst & Reviewer — Learning & Development | Learning & Development / Learning & Development Core | Hana Suzuki | Skills: learning_design, training_programs, capability_development, curriculum_design, web_research, source_verification, quality_review; Responsibilities: learning_design, training_programs, capability_development, curriculum_design | [E477: `packages/org-kit/organization/workforce_registry.json:14820`](../packages/org-kit/organization/workforce_registry.json#L14820) |
| AGENT-275 / Titi Akinbode | Principal Specialist — Organizational Design & Workforce Planning | Organizational Design & Workforce Planning / Organizational Design & Workforce Planning Core | Rajiv Menon | Skills: org_design, workforce_planning, capacity_planning, role_design, web_research, source_verification, quality_review; Responsibilities: org_design, workforce_planning, capacity_planning, role_design | [E478: `packages/org-kit/organization/workforce_registry.json:14875`](../packages/org-kit/organization/workforce_registry.json#L14875) |
| AGENT-276 / Uloma Eze | Analyst & Reviewer — Organizational Design & Workforce Planning | Organizational Design & Workforce Planning / Organizational Design & Workforce Planning Core | Rajiv Menon | Skills: org_design, workforce_planning, capacity_planning, role_design, web_research, source_verification, quality_review; Responsibilities: org_design, workforce_planning, capacity_planning, role_design | [E479: `packages/org-kit/organization/workforce_registry.json:14930`](../packages/org-kit/organization/workforce_registry.json#L14930) |
| AGENT-277 / Voke Oghenerukewe | Principal Specialist — People Analytics | People Analytics / People Analytics Core | Elena Popescu | Skills: people_analytics, workforce_metrics, attrition_analysis, engagement_analysis, web_research, source_verification, quality_review; Responsibilities: people_analytics, workforce_metrics, attrition_analysis, engagement_analysis | [E480: `packages/org-kit/organization/workforce_registry.json:14985`](../packages/org-kit/organization/workforce_registry.json#L14985) |
| AGENT-278 / Wura Olawale | Analyst & Reviewer — People Analytics | People Analytics / People Analytics Core | Elena Popescu | Skills: people_analytics, workforce_metrics, attrition_analysis, engagement_analysis, web_research, source_verification, quality_review; Responsibilities: people_analytics, workforce_metrics, attrition_analysis, engagement_analysis | [E481: `packages/org-kit/organization/workforce_registry.json:15040`](../packages/org-kit/organization/workforce_registry.json#L15040) |
| AGENT-279 / Yetunde Adeola | Principal Specialist — AI Workforce & Organizational Intelligence | AI Workforce & Organizational Intelligence / AI Workforce & Organizational Intelligence Core | Dr. Maya Kilonzo | Skills: agent_workforce_registry, agent_capability_mapping, agent_utilization, agent_reuse_scan, web_research, source_verification, quality_review; Responsibilities: agent_workforce_registry, agent_capability_mapping, agent_utilization, agent_reuse_scan, agent_governance | [E482: `packages/org-kit/organization/workforce_registry.json:15095`](../packages/org-kit/organization/workforce_registry.json#L15095) |
| AGENT-280 / Zainab Abubakar | Analyst & Reviewer — AI Workforce & Organizational Intelligence | AI Workforce & Organizational Intelligence / AI Workforce & Organizational Intelligence Core | Dr. Maya Kilonzo | Skills: agent_workforce_registry, agent_capability_mapping, agent_utilization, agent_reuse_scan, web_research, source_verification, quality_review; Responsibilities: agent_workforce_registry, agent_capability_mapping, agent_utilization, agent_reuse_scan, agent_governance | [E483: `packages/org-kit/organization/workforce_registry.json:15151`](../packages/org-kit/organization/workforce_registry.json#L15151) |

#### DIR-13 — Operations & Procurement

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-281 / Amina Garba | Principal Specialist — Corporate Operations | Corporate Operations / Corporate Operations Core | Nadia Petrescu | Skills: corporate_operations, operating_rhythm, shared_services, operational_coordination, web_research, source_verification, quality_review; Responsibilities: corporate_operations, operating_rhythm, shared_services, operational_coordination | [E484: `packages/org-kit/organization/workforce_registry.json:15207`](../packages/org-kit/organization/workforce_registry.json#L15207) |
| AGENT-282 / Bello Usman | Analyst & Reviewer — Corporate Operations | Corporate Operations / Corporate Operations Core | Nadia Petrescu | Skills: corporate_operations, operating_rhythm, shared_services, operational_coordination, web_research, source_verification, quality_review; Responsibilities: corporate_operations, operating_rhythm, shared_services, operational_coordination | [E485: `packages/org-kit/organization/workforce_registry.json:15262`](../packages/org-kit/organization/workforce_registry.json#L15262) |
| AGENT-283 / Chinelo Obi | Principal Specialist — Business Process & Continuous Improvement | Business Process & Continuous Improvement / Business Process & Continuous Improvement Core | Samuel Adekunle | Skills: process_mapping, lean_improvement, process_automation, continuous_improvement, web_research, source_verification, quality_review; Responsibilities: process_mapping, lean_improvement, process_automation, continuous_improvement | [E486: `packages/org-kit/organization/workforce_registry.json:15317`](../packages/org-kit/organization/workforce_registry.json#L15317) |
| AGENT-284 / Dayo Adebayo | Analyst & Reviewer — Business Process & Continuous Improvement | Business Process & Continuous Improvement / Business Process & Continuous Improvement Core | Samuel Adekunle | Skills: process_mapping, lean_improvement, process_automation, continuous_improvement, web_research, source_verification, quality_review; Responsibilities: process_mapping, lean_improvement, process_automation, continuous_improvement | [E487: `packages/org-kit/organization/workforce_registry.json:15372`](../packages/org-kit/organization/workforce_registry.json#L15372) |
| AGENT-285 / Efua Mensah | Principal Specialist — Procurement & Strategic Sourcing | Procurement & Strategic Sourcing / Procurement & Strategic Sourcing Core | Linh Nguyen | Skills: procurement, strategic_sourcing, rfp_management, supplier_selection, web_research, source_verification, quality_review; Responsibilities: procurement, strategic_sourcing, rfp_management, supplier_selection | [E488: `packages/org-kit/organization/workforce_registry.json:15427`](../packages/org-kit/organization/workforce_registry.json#L15427) |
| AGENT-286 / Funke Akindele | Analyst & Reviewer — Procurement & Strategic Sourcing | Procurement & Strategic Sourcing / Procurement & Strategic Sourcing Core | Linh Nguyen | Skills: procurement, strategic_sourcing, rfp_management, supplier_selection, web_research, source_verification, quality_review; Responsibilities: procurement, strategic_sourcing, rfp_management, supplier_selection | [E489: `packages/org-kit/organization/workforce_registry.json:15482`](../packages/org-kit/organization/workforce_registry.json#L15482) |
| AGENT-287 / Gbeke Michaels | Principal Specialist — Vendor & Supplier Management | Vendor & Supplier Management / Vendor & Supplier Management Core | Matteo Ricci | Skills: vendor_management, supplier_performance, contract_vendor_coordination, vendor_risk_coordination, web_research, source_verification, quality_review; Responsibilities: vendor_management, supplier_performance, contract_vendor_coordination, vendor_risk_coordination | [E490: `packages/org-kit/organization/workforce_registry.json:15537`](../packages/org-kit/organization/workforce_registry.json#L15537) |
| AGENT-288 / Hadijatou Bah | Analyst & Reviewer — Vendor & Supplier Management | Vendor & Supplier Management / Vendor & Supplier Management Core | Matteo Ricci | Skills: vendor_management, supplier_performance, contract_vendor_coordination, vendor_risk_coordination, web_research, source_verification, quality_review; Responsibilities: vendor_management, supplier_performance, contract_vendor_coordination, vendor_risk_coordination | [E491: `packages/org-kit/organization/workforce_registry.json:15592`](../packages/org-kit/organization/workforce_registry.json#L15592) |
| AGENT-289 / Isioma Nwosu | Principal Specialist — Facilities & Workplace | Facilities & Workplace / Facilities & Workplace Core | Chloe Martin | Skills: facilities_management, workplace_services, space_operations, maintenance_coordination, web_research, source_verification, quality_review; Responsibilities: facilities_management, workplace_services, space_operations, maintenance_coordination | [E492: `packages/org-kit/organization/workforce_registry.json:15647`](../packages/org-kit/organization/workforce_registry.json#L15647) |
| AGENT-290 / Jummai Aliyu | Analyst & Reviewer — Facilities & Workplace | Facilities & Workplace / Facilities & Workplace Core | Chloe Martin | Skills: facilities_management, workplace_services, space_operations, maintenance_coordination, web_research, source_verification, quality_review; Responsibilities: facilities_management, workplace_services, space_operations, maintenance_coordination | [E493: `packages/org-kit/organization/workforce_registry.json:15702`](../packages/org-kit/organization/workforce_registry.json#L15702) |
| AGENT-291 / Kike Oladele | Principal Specialist — Real Estate & Physical Infrastructure | Real Estate & Physical Infrastructure / Real Estate & Physical Infrastructure Core | Ahmed Al-Hassan | Skills: real_estate, lease_management, site_planning, physical_infrastructure, web_research, source_verification, quality_review; Responsibilities: real_estate, lease_management, site_planning, physical_infrastructure | [E494: `packages/org-kit/organization/workforce_registry.json:15757`](../packages/org-kit/organization/workforce_registry.json#L15757) |
| AGENT-292 / Lara Adewale | Analyst & Reviewer — Real Estate & Physical Infrastructure | Real Estate & Physical Infrastructure / Real Estate & Physical Infrastructure Core | Ahmed Al-Hassan | Skills: real_estate, lease_management, site_planning, physical_infrastructure, web_research, source_verification, quality_review; Responsibilities: real_estate, lease_management, site_planning, physical_infrastructure | [E495: `packages/org-kit/organization/workforce_registry.json:15812`](../packages/org-kit/organization/workforce_registry.json#L15812) |
| AGENT-293 / Maryam Abubakar | Principal Specialist — Quality Management | Quality Management / Quality Management Core | Dr. Eva Horváth | Skills: quality_management, quality_systems, root_cause_analysis, corrective_actions, web_research, source_verification, quality_review; Responsibilities: quality_management, quality_systems, root_cause_analysis, corrective_actions | [E496: `packages/org-kit/organization/workforce_registry.json:15867`](../packages/org-kit/organization/workforce_registry.json#L15867) |
| AGENT-294 / Nkechi Eze | Analyst & Reviewer — Quality Management | Quality Management / Quality Management Core | Dr. Eva Horváth | Skills: quality_management, quality_systems, root_cause_analysis, corrective_actions, web_research, source_verification, quality_review; Responsibilities: quality_management, quality_systems, root_cause_analysis, corrective_actions | [E497: `packages/org-kit/organization/workforce_registry.json:15922`](../packages/org-kit/organization/workforce_registry.json#L15922) |
| AGENT-295 / Olamide Baddo | Principal Specialist — Operational Performance & Service Excellence | Operational Performance & Service Excellence / Operational Performance & Service Excellence Core | Bongiwe Khumalo | Skills: service_excellence, operational_kpis, capacity_analysis, service_improvement, web_research, source_verification, quality_review; Responsibilities: service_excellence, operational_kpis, capacity_analysis, service_improvement | [E498: `packages/org-kit/organization/workforce_registry.json:15977`](../packages/org-kit/organization/workforce_registry.json#L15977) |
| AGENT-296 / Peculiar Onyekachi | Analyst & Reviewer — Operational Performance & Service Excellence | Operational Performance & Service Excellence / Operational Performance & Service Excellence Core | Bongiwe Khumalo | Skills: service_excellence, operational_kpis, capacity_analysis, service_improvement, web_research, source_verification, quality_review; Responsibilities: service_excellence, operational_kpis, capacity_analysis, service_improvement | [E499: `packages/org-kit/organization/workforce_registry.json:16032`](../packages/org-kit/organization/workforce_registry.json#L16032) |

#### DIR-14 — Customer Organization

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-297 / Remi Adesanya | Principal Specialist — Customer Success | Customer Success / Customer Success Core | Sofia Mendes | Skills: customer_success, adoption_strategy, customer_value, success_planning, web_research, source_verification, quality_review; Responsibilities: customer_success, adoption_strategy, customer_value, success_planning | [E500: `packages/org-kit/organization/workforce_registry.json:16087`](../packages/org-kit/organization/workforce_registry.json#L16087) |
| AGENT-298 / Simi Kosoko | Analyst & Reviewer — Customer Success | Customer Success / Customer Success Core | Sofia Mendes | Skills: customer_success, adoption_strategy, customer_value, success_planning, web_research, source_verification, quality_review; Responsibilities: customer_success, adoption_strategy, customer_value, success_planning | [E501: `packages/org-kit/organization/workforce_registry.json:16142`](../packages/org-kit/organization/workforce_registry.json#L16142) |
| AGENT-299 / Temi Otedola | Principal Specialist — Customer Onboarding & Implementation | Customer Onboarding & Implementation / Customer Onboarding & Implementation Core | Caleb Nwosu | Skills: customer_onboarding, implementation_planning, deployment_coordination, go_live_readiness, web_research, source_verification, quality_review; Responsibilities: customer_onboarding, implementation_planning, deployment_coordination, go_live_readiness | [E502: `packages/org-kit/organization/workforce_registry.json:16197`](../packages/org-kit/organization/workforce_registry.json#L16197) |
| AGENT-300 / Uju Okonkwo | Analyst & Reviewer — Customer Onboarding & Implementation | Customer Onboarding & Implementation / Customer Onboarding & Implementation Core | Caleb Nwosu | Skills: customer_onboarding, implementation_planning, deployment_coordination, go_live_readiness, web_research, source_verification, quality_review; Responsibilities: customer_onboarding, implementation_planning, deployment_coordination, go_live_readiness | [E503: `packages/org-kit/organization/workforce_registry.json:16252`](../packages/org-kit/organization/workforce_registry.json#L16252) |
| AGENT-301 / Vero Okafor | Principal Specialist — Professional Services | Professional Services / Professional Services Core | Aiko Fujimoto | Skills: consulting_delivery, solution_implementation, client_delivery, engagement_management, web_research, source_verification, quality_review; Responsibilities: consulting_delivery, solution_implementation, client_delivery, engagement_management | [E504: `packages/org-kit/organization/workforce_registry.json:16307`](../packages/org-kit/organization/workforce_registry.json#L16307) |
| AGENT-302 / Wale Adenuga | Analyst & Reviewer — Professional Services | Professional Services / Professional Services Core | Aiko Fujimoto | Skills: consulting_delivery, solution_implementation, client_delivery, engagement_management, web_research, source_verification, quality_review; Responsibilities: consulting_delivery, solution_implementation, client_delivery, engagement_management | [E505: `packages/org-kit/organization/workforce_registry.json:16362`](../packages/org-kit/organization/workforce_registry.json#L16362) |
| AGENT-303 / Xena Osei | Principal Specialist — Technical Account Management | Technical Account Management / Technical Account Management Core | Lars Petersen | Skills: technical_account_management, technical_escalation, architecture_guidance, customer_technical_health, web_research, source_verification, quality_review; Responsibilities: technical_account_management, technical_escalation, architecture_guidance, customer_technical_health | [E506: `packages/org-kit/organization/workforce_registry.json:16417`](../packages/org-kit/organization/workforce_registry.json#L16417) |
| AGENT-304 / Yinka Ayefele | Analyst & Reviewer — Technical Account Management | Technical Account Management / Technical Account Management Core | Lars Petersen | Skills: technical_account_management, technical_escalation, architecture_guidance, customer_technical_health, web_research, source_verification, quality_review; Responsibilities: technical_account_management, technical_escalation, architecture_guidance, customer_technical_health | [E507: `packages/org-kit/organization/workforce_registry.json:16472`](../packages/org-kit/organization/workforce_registry.json#L16472) |
| AGENT-305 / Zubaidah Haruna | Principal Specialist — Customer Support & Service Desk | Customer Support & Service Desk / Customer Support & Service Desk Core | Naomi Chen | Skills: customer_support, ticket_triage, knowledge_base, sla_management, web_research, source_verification, quality_review; Responsibilities: customer_support, ticket_triage, knowledge_base, sla_management | [E508: `packages/org-kit/organization/workforce_registry.json:16527`](../packages/org-kit/organization/workforce_registry.json#L16527) |
| AGENT-306 / Adaku Obi | Analyst & Reviewer — Customer Support & Service Desk | Customer Support & Service Desk / Customer Support & Service Desk Core | Naomi Chen | Skills: customer_support, ticket_triage, knowledge_base, sla_management, web_research, source_verification, quality_review; Responsibilities: customer_support, ticket_triage, knowledge_base, sla_management | [E509: `packages/org-kit/organization/workforce_registry.json:16582`](../packages/org-kit/organization/workforce_registry.json#L16582) |
| AGENT-307 / Bukola Saraki-Jr | Principal Specialist — Customer Education & Adoption | Customer Education & Adoption / Customer Education & Adoption Core | Fatima Zahra | Skills: customer_training, adoption_enablement, learning_content, enablement_programs, web_research, source_verification, quality_review; Responsibilities: customer_training, adoption_enablement, learning_content, enablement_programs | [E510: `packages/org-kit/organization/workforce_registry.json:16637`](../packages/org-kit/organization/workforce_registry.json#L16637) |
| AGENT-308 / Chika Okonkwo | Analyst & Reviewer — Customer Education & Adoption | Customer Education & Adoption / Customer Education & Adoption Core | Fatima Zahra | Skills: customer_training, adoption_enablement, learning_content, enablement_programs, web_research, source_verification, quality_review; Responsibilities: customer_training, adoption_enablement, learning_content, enablement_programs | [E511: `packages/org-kit/organization/workforce_registry.json:16692`](../packages/org-kit/organization/workforce_registry.json#L16692) |
| AGENT-309 / Demola Adesanya | Principal Specialist — Renewals & Expansion | Renewals & Expansion / Renewals & Expansion Core | Diego Fernandes | Skills: renewals, expansion_strategy, commercial_retention, renewal_forecasting, web_research, source_verification, quality_review; Responsibilities: renewals, expansion_strategy, commercial_retention, renewal_forecasting | [E512: `packages/org-kit/organization/workforce_registry.json:16747`](../packages/org-kit/organization/workforce_registry.json#L16747) |
| AGENT-310 / Ese Brume | Analyst & Reviewer — Renewals & Expansion | Renewals & Expansion / Renewals & Expansion Core | Diego Fernandes | Skills: renewals, expansion_strategy, commercial_retention, renewal_forecasting, web_research, source_verification, quality_review; Responsibilities: renewals, expansion_strategy, commercial_retention, renewal_forecasting | [E513: `packages/org-kit/organization/workforce_registry.json:16802`](../packages/org-kit/organization/workforce_registry.json#L16802) |
| AGENT-311 / Feyi Fela | Principal Specialist — Customer Health & Escalation Management | Customer Health & Escalation Management / Customer Health & Escalation Management Core | Grace Owusu | Skills: customer_health, risk_accounts, escalation_management, churn_prevention, web_research, source_verification, quality_review; Responsibilities: customer_health, risk_accounts, escalation_management, churn_prevention | [E514: `packages/org-kit/organization/workforce_registry.json:16857`](../packages/org-kit/organization/workforce_registry.json#L16857) |
| AGENT-312 / Goke Aboderin | Analyst & Reviewer — Customer Health & Escalation Management | Customer Health & Escalation Management / Customer Health & Escalation Management Core | Grace Owusu | Skills: customer_health, risk_accounts, escalation_management, churn_prevention, web_research, source_verification, quality_review; Responsibilities: customer_health, risk_accounts, escalation_management, churn_prevention | [E515: `packages/org-kit/organization/workforce_registry.json:16912`](../packages/org-kit/organization/workforce_registry.json#L16912) |

#### DIR-15 — Internal Audit & Assurance

| ID / name | Role | Department / team | Reports to | Declared skills / responsibilities | Evidence |
| --- | --- | --- | --- | --- | --- |
| AGENT-313 / Hauwa Ribadu | Principal Specialist — Financial Audit & Assurance | Financial Audit & Assurance / Financial Audit & Assurance Core | Helena Novak | Skills: financial_audit, assurance, audit_testing, financial_controls_review, web_research, source_verification, quality_review; Responsibilities: financial_audit, assurance, audit_testing, financial_controls_review | [E516: `packages/org-kit/organization/workforce_registry.json:16967`](../packages/org-kit/organization/workforce_registry.json#L16967) |
| AGENT-314 / Ify Aniebo | Analyst & Reviewer — Financial Audit & Assurance | Financial Audit & Assurance / Financial Audit & Assurance Core | Helena Novak | Skills: financial_audit, assurance, audit_testing, financial_controls_review, web_research, source_verification, quality_review; Responsibilities: financial_audit, assurance, audit_testing, financial_controls_review | [E517: `packages/org-kit/organization/workforce_registry.json:17022`](../packages/org-kit/organization/workforce_registry.json#L17022) |
| AGENT-315 / Jide Kosoko-Jr | Principal Specialist — Technology Audit | Technology Audit / Technology Audit Core | Dr. Marcus Chen | Skills: technology_audit, it_controls, systems_assurance, change_management_audit, web_research, source_verification, quality_review; Responsibilities: technology_audit, it_controls, systems_assurance, change_management_audit | [E518: `packages/org-kit/organization/workforce_registry.json:17077`](../packages/org-kit/organization/workforce_registry.json#L17077) |
| AGENT-316 / Kemi Adeosun | Analyst & Reviewer — Technology Audit | Technology Audit / Technology Audit Core | Dr. Marcus Chen | Skills: technology_audit, it_controls, systems_assurance, change_management_audit, web_research, source_verification, quality_review; Responsibilities: technology_audit, it_controls, systems_assurance, change_management_audit | [E519: `packages/org-kit/organization/workforce_registry.json:17132`](../packages/org-kit/organization/workforce_registry.json#L17132) |
| AGENT-317 / Lanre Olusola | Principal Specialist — Cybersecurity Assurance | Cybersecurity Assurance / Cybersecurity Assurance Core | Leila Haddad-Sayegh | Skills: cyber_assurance, security_control_testing, security_audit, cyber_risk_assurance, web_research, source_verification, quality_review; Responsibilities: cyber_assurance, security_control_testing, security_audit, cyber_risk_assurance | [E520: `packages/org-kit/organization/workforce_registry.json:17187`](../packages/org-kit/organization/workforce_registry.json#L17187) |
| AGENT-318 / Mide Martins | Analyst & Reviewer — Cybersecurity Assurance | Cybersecurity Assurance / Cybersecurity Assurance Core | Leila Haddad-Sayegh | Skills: cyber_assurance, security_control_testing, security_audit, cyber_risk_assurance, web_research, source_verification, quality_review; Responsibilities: cyber_assurance, security_control_testing, security_audit, cyber_risk_assurance | [E521: `packages/org-kit/organization/workforce_registry.json:17242`](../packages/org-kit/organization/workforce_registry.json#L17242) |
| AGENT-319 / Nonso Anozie | Principal Specialist — Operational Audit | Operational Audit / Operational Audit Core | Tawanda Moyo | Skills: operational_audit, process_audit, efficiency_review, control_assessment, web_research, source_verification, quality_review; Responsibilities: operational_audit, process_audit, efficiency_review, control_assessment | [E522: `packages/org-kit/organization/workforce_registry.json:17297`](../packages/org-kit/organization/workforce_registry.json#L17297) |
| AGENT-320 / Ola Maja | Analyst & Reviewer — Operational Audit | Operational Audit / Operational Audit Core | Tawanda Moyo | Skills: operational_audit, process_audit, efficiency_review, control_assessment, web_research, source_verification, quality_review; Responsibilities: operational_audit, process_audit, efficiency_review, control_assessment | [E523: `packages/org-kit/organization/workforce_registry.json:17352`](../packages/org-kit/organization/workforce_registry.json#L17352) |
| AGENT-321 / Pemi Onyekwere | Principal Specialist — Compliance & Governance Audit | Compliance & Governance Audit / Compliance & Governance Audit Core | Ingrid Solberg | Skills: compliance_audit, governance_assurance, regulatory_control_testing, web_research, source_verification, quality_review; Responsibilities: compliance_audit, governance_assurance, regulatory_control_testing | [E524: `packages/org-kit/organization/workforce_registry.json:17407`](../packages/org-kit/organization/workforce_registry.json#L17407) |
| AGENT-322 / Rika Nwosu | Analyst & Reviewer — Compliance & Governance Audit | Compliance & Governance Audit / Compliance & Governance Audit Core | Ingrid Solberg | Skills: compliance_audit, governance_assurance, regulatory_control_testing, web_research, source_verification, quality_review; Responsibilities: compliance_audit, governance_assurance, regulatory_control_testing | [E525: `packages/org-kit/organization/workforce_registry.json:17460`](../packages/org-kit/organization/workforce_registry.json#L17460) |
| AGENT-323 / Sola Allyson | Principal Specialist — Controls Assurance | Controls Assurance / Controls Assurance Core | Priya Kapoor | Skills: internal_controls, control_design_review, control_effectiveness_testing, sox_style_controls, web_research, source_verification, quality_review; Responsibilities: internal_controls, control_design_review, control_effectiveness_testing, sox_style_controls | [E526: `packages/org-kit/organization/workforce_registry.json:17513`](../packages/org-kit/organization/workforce_registry.json#L17513) |
| AGENT-324 / Tola Odule | Analyst & Reviewer — Controls Assurance | Controls Assurance / Controls Assurance Core | Priya Kapoor | Skills: internal_controls, control_design_review, control_effectiveness_testing, sox_style_controls, web_research, source_verification, quality_review; Responsibilities: internal_controls, control_design_review, control_effectiveness_testing, sox_style_controls | [E527: `packages/org-kit/organization/workforce_registry.json:17568`](../packages/org-kit/organization/workforce_registry.json#L17568) |
| AGENT-325 / Ugo Chukwu | Principal Specialist — AI Systems & Agent Governance Audit | AI Systems & Agent Governance Audit / AI Systems & Agent Governance Audit Core | Dr. Kojo Mensima | Skills: ai_audit, agent_governance_audit, model_risk_assurance, ai_control_testing, web_research, source_verification, quality_review; Responsibilities: ai_audit, agent_governance_audit, model_risk_assurance, ai_control_testing | [E528: `packages/org-kit/organization/workforce_registry.json:17623`](../packages/org-kit/organization/workforce_registry.json#L17623) |
| AGENT-326 / Voke Uwaifo | Analyst & Reviewer — AI Systems & Agent Governance Audit | AI Systems & Agent Governance Audit / AI Systems & Agent Governance Audit Core | Dr. Kojo Mensima | Skills: ai_audit, agent_governance_audit, model_risk_assurance, ai_control_testing, web_research, source_verification, quality_review; Responsibilities: ai_audit, agent_governance_audit, model_risk_assurance, ai_control_testing | [E529: `packages/org-kit/organization/workforce_registry.json:17678`](../packages/org-kit/organization/workforce_registry.json#L17678) |

### All 163 teams

| ID | Team | Directorate / department | Department head | Core skills | Maximum default active agents |
| --- | --- | --- | --- | --- | --- |
| TEAM-001 | Office of the CEO & Executive Operations Core | Executive Office & Corporate Strategy / Office of the CEO & Executive Operations | Whitney Brown | executive_briefing, decision_tracking, executive_coordination, priority_management, leadership_meeting_ops, escalation_management, web_research, source_verification, quality_review | 3 |
| TEAM-002 | Corporate Strategy & Strategic Planning Core | Executive Office & Corporate Strategy / Corporate Strategy & Strategic Planning | Chux Onwusah | corporate_strategy, scenario_planning, strategic_prioritization, annual_planning, competitive_positioning, objective_design, web_research, source_verification, quality_review | 3 |
| TEAM-003 | Corporate Development & Strategic Investments Core | Executive Office & Corporate Strategy / Corporate Development & Strategic Investments | Tosin (Suki) Suara | deal_screening, investment_thesis, valuation_support, due_diligence_coordination, joint_venture_analysis, portfolio_strategy, web_research, source_verification, quality_review | 3 |
| TEAM-004 | Enterprise Transformation & Strategic Programs Core | Executive Office & Corporate Strategy / Enterprise Transformation & Strategic Programs | Nimat Omobolanle | transformation_design, program_governance, change_enablement, cross_functional_delivery, benefits_realization, web_research, source_verification, quality_review | 3 |
| TEAM-005 | Enterprise Business Intelligence & Performance Core | Executive Office & Corporate Strategy / Enterprise Business Intelligence & Performance | Jideofor Nnaji | executive_dashboarding, kpi_design, performance_analysis, decision_support, forecast_synthesis, web_research, source_verification, quality_review | 3 |
| TEAM-006 | Strategic Portfolio & PMO Core | Executive Office & Corporate Strategy / Strategic Portfolio & PMO | Pat Johnson | portfolio_management, program_management, dependency_tracking, resource_prioritization, value_realization, web_research, source_verification, quality_review | 3 |
| TEAM-007 | ATLAS | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | brand_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-008 | NOVA | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | content_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-009 | VANTA | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | audience_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-010 | ORACLE | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | creative_direction, web_research, source_verification, quality_review | 2 |
| TEAM-011 | QUANTA | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | media_distribution, web_research, source_verification, quality_review | 2 |
| TEAM-012 | PULSE | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | reputation_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-013 | VERITY | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | brand_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-014 | FORGE | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | content_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-015 | RHODES | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | audience_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-016 | PRISM | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | creative_direction, web_research, source_verification, quality_review | 2 |
| TEAM-017 | HALO | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | media_distribution, web_research, source_verification, quality_review | 2 |
| TEAM-018 | TITAN | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | reputation_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-019 | MAGNET | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | brand_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-020 | FLUX | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | content_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-021 | LIVEWIRE | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | audience_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-022 | ECHO | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | creative_direction, web_research, source_verification, quality_review | 2 |
| TEAM-023 | CUT | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | media_distribution, web_research, source_verification, quality_review | 2 |
| TEAM-024 | SONIC | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | reputation_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-025 | SIGNAL | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | brand_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-026 | MOSAIC | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | content_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-027 | CHORUS | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | audience_intelligence, web_research, source_verification, quality_review | 2 |
| TEAM-028 | SHIELD | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | creative_direction, web_research, source_verification, quality_review | 2 |
| TEAM-029 | MIRROR | WHINK Group Marketing Intelligence / Brand, Media & Audience Intelligence | Sonia Bantu | media_distribution, web_research, source_verification, quality_review | 2 |
| TEAM-030 | VECTOR | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | product_marketing, web_research, source_verification, quality_review | 2 |
| TEAM-031 | NEXUS | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | demand_generation, web_research, source_verification, quality_review | 2 |
| TEAM-032 | LEDGER | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | growth_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-033 | CONDUCTOR | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | marketing_operations, web_research, source_verification, quality_review | 2 |
| TEAM-034 | SENTINEL | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | sales_enablement, web_research, source_verification, quality_review | 2 |
| TEAM-035 | MUSE | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | customer_marketing, web_research, source_verification, quality_review | 2 |
| TEAM-036 | PROPEL | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | product_marketing, web_research, source_verification, quality_review | 2 |
| TEAM-037 | DEMAND | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | demand_generation, web_research, source_verification, quality_review | 2 |
| TEAM-038 | REVOPS | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | growth_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-039 | LIFECYCLE | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | marketing_operations, web_research, source_verification, quality_review | 2 |
| TEAM-040 | CONVERT | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | sales_enablement, web_research, source_verification, quality_review | 2 |
| TEAM-041 | AUTHORITY | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | customer_marketing, web_research, source_verification, quality_review | 2 |
| TEAM-042 | ENABLE | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | product_marketing, web_research, source_verification, quality_review | 2 |
| TEAM-043 | ADVOCATE | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | demand_generation, web_research, source_verification, quality_review | 2 |
| TEAM-044 | FIELD | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | growth_strategy, web_research, source_verification, quality_review | 2 |
| TEAM-045 | COMPASS | WHINK Group Marketing Intelligence / Commercial & Growth Marketing Intelligence | David Eniolade | marketing_operations, web_research, source_verification, quality_review | 2 |
| TEAM-046 | Enterprise Sales Core | Sales & Revenue / Enterprise Sales | Ijie Alpha | enterprise_sales_strategy, account_planning, complex_deal_management, executive_selling, pipeline_management, web_research, source_verification, quality_review | 3 |
| TEAM-047 | SMB & Mid-Market Sales Core | Sales & Revenue / SMB & Mid-Market Sales | Muyiwa Agoro | commercial_sales, high_velocity_pipeline, territory_management, deal_qualification, sales_forecasting, web_research, source_verification, quality_review | 3 |
| TEAM-048 | Sales Development & Pipeline Generation Core | Sales & Revenue / Sales Development & Pipeline Generation | Mosope Talabi | prospecting, lead_qualification, outbound_sequence_design, inbound_triage, meeting_generation, web_research, source_verification, quality_review | 3 |
| TEAM-049 | Solutions & Technical Sales Core | Sales & Revenue / Solutions & Technical Sales | Matthew Okonunfua | technical_discovery, solution_design, demo_strategy, pre_sales_architecture, technical_validation, web_research, source_verification, quality_review | 3 |
| TEAM-050 | Channel & Partner Sales Core | Sales & Revenue / Channel & Partner Sales | Oluwaseun Lambo | channel_strategy, partner_recruitment, partner_enablement, co_sell_planning, channel_pipeline, web_research, source_verification, quality_review | 3 |
| TEAM-051 | Account Management & Expansion Core | Sales & Revenue / Account Management & Expansion | Sam Patel | account_growth, renewal_strategy, upsell_cross_sell, relationship_management, account_health, web_research, source_verification, quality_review | 3 |
| TEAM-052 | Revenue Operations & Sales Intelligence Core | Sales & Revenue / Revenue Operations & Sales Intelligence | Sylvester Anyanwu | crm_governance, sales_forecasting, pipeline_analytics, territory_design, sales_process, revenue_reporting, web_research, source_verification, quality_review | 3 |
| TEAM-053 | Product Strategy & Portfolio Core | Product / Product Strategy & Portfolio | Dee Jay Khaled | product_strategy, portfolio_prioritization, product_vision, market_fit_analysis, investment_prioritization, web_research, source_verification, quality_review | 3 |
| TEAM-054 | Product Management Core | Product / Product Management | Kamsiyochukwu Igboekwe | requirements_management, roadmap_management, feature_prioritization, product_discovery, stakeholder_alignment, web_research, source_verification, quality_review | 3 |
| TEAM-055 | Product Operations Core | Product / Product Operations | Kiki Palmer | product_planning_ops, release_readiness, decision_tracking, product_process_design, cross_functional_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-056 | Product Research & Customer Discovery Core | Product / Product Research & Customer Discovery | Denzel Washington | user_research, customer_interviews, problem_validation, persona_research, jobs_to_be_done, web_research, source_verification, quality_review | 3 |
| TEAM-057 | Product Analytics & Intelligence Core | Product / Product Analytics & Intelligence | Kaisochukwu Nnaji | product_analytics, adoption_analysis, retention_analysis, experiment_design, feature_usage_analysis, web_research, source_verification, quality_review | 3 |
| TEAM-058 | User Experience & Service Design Core | Product / User Experience & Service Design | Inaas Abdul | ux_strategy, journey_mapping, service_design, usability_research, accessibility_review, web_research, source_verification, quality_review | 3 |
| TEAM-059 | Release & Product Lifecycle Management Core | Product / Release & Product Lifecycle Management | Abiodun Iseniyi | release_governance, lifecycle_management, launch_readiness, deprecation_planning, change_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-060 | Software Engineering Core | Engineering & Technology / Software Engineering | Sofoluwe Coker | frontend_engineering, backend_engineering, application_architecture, code_review, software_design, web_research, source_verification, quality_review | 3 |
| TEAM-061 | Mobile & Client Platforms Core | Engineering & Technology / Mobile & Client Platforms | Ernest Abhulimehn | mobile_engineering, desktop_clients, cross_platform_architecture, client_performance, device_integration, web_research, source_verification, quality_review | 3 |
| TEAM-062 | Platform Engineering & Core Infrastructure Core | Engineering & Technology / Platform Engineering & Core Infrastructure | Tinashe Muzenyi | platform_engineering, shared_services, developer_platforms, runtime_architecture, service_frameworks, web_research, source_verification, quality_review | 3 |
| TEAM-063 | Architecture & Technical Strategy Core | Engineering & Technology / Architecture & Technical Strategy | Sophia Mercurri | enterprise_architecture, solution_architecture, technology_standards, architecture_review, scalability_design, web_research, source_verification, quality_review | 3 |
| TEAM-064 | API, Integrations & Developer Ecosystem Core | Engineering & Technology / API, Integrations & Developer Ecosystem | Omolara Suara | api_design, integration_architecture, sdk_design, partner_integrations, developer_experience, web_research, source_verification, quality_review | 3 |
| TEAM-065 | DevOps, SRE & Cloud Engineering Core | Engineering & Technology / DevOps, SRE & Cloud Engineering | Raven May Mei | cicd, site_reliability, cloud_infrastructure, observability, capacity_management, deployment_automation, web_research, source_verification, quality_review | 3 |
| TEAM-066 | Quality Engineering & Test Automation Core | Engineering & Technology / Quality Engineering & Test Automation | Terhemba Ahile | test_strategy, test_automation, performance_testing, regression_testing, quality_gates, web_research, source_verification, quality_review | 3 |
| TEAM-067 | Release Engineering & Configuration Management Core | Engineering & Technology / Release Engineering & Configuration Management | Rebecca Johnson | build_systems, release_packaging, versioning, configuration_management, rollback_planning, web_research, source_verification, quality_review | 3 |
| TEAM-068 | Engineering Productivity & Developer Experience Core | Engineering & Technology / Engineering Productivity & Developer Experience | Étienne Moreau | developer_productivity, engineering_tooling, dev_environment_design, coding_standards, workflow_automation, web_research, source_verification, quality_review | 3 |
| TEAM-069 | Technical Documentation & Engineering Knowledge Core | Engineering & Technology / Technical Documentation & Engineering Knowledge | Leila Haddad | technical_writing, architecture_documentation, runbook_design, developer_docs, knowledge_management, web_research, source_verification, quality_review | 3 |
| TEAM-070 | AI Engineering & Applied Intelligence Core | Data & Artificial Intelligence / AI Engineering & Applied Intelligence | Lukas Schneider | llm_integration, ai_application_engineering, inference_workflows, ai_automation, production_ai, web_research, source_verification, quality_review | 3 |
| TEAM-071 | Agent Architecture & AI Workforce Systems Core | Data & Artificial Intelligence / Agent Architecture & AI Workforce Systems | Hanae Nakamura | agent_architecture, multi_agent_orchestration, agent_registry, agent_lifecycle, capability_mapping, delegation_design, web_research, source_verification, quality_review | 3 |
| TEAM-072 | Skill Engineering & Tool Orchestration Core | Data & Artificial Intelligence / Skill Engineering & Tool Orchestration | Mateo Fernández | skill_design, tool_contracts, skill_testing, tool_routing, permission_integration, web_research, source_verification, quality_review | 3 |
| TEAM-073 | Machine Learning & Model Development Core | Data & Artificial Intelligence / Machine Learning & Model Development | Dr. Priyanka Rao | machine_learning, model_training, fine_tuning, predictive_modeling, recommendation_systems, web_research, source_verification, quality_review | 3 |
| TEAM-074 | Model Evaluation, Reliability & Intelligence Quality Core | Data & Artificial Intelligence / Model Evaluation, Reliability & Intelligence Quality | Elias Haddad | model_evaluation, hallucination_testing, benchmarking, regression_testing, red_team_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-075 | Model Routing & AI Infrastructure Core | Data & Artificial Intelligence / Model Routing & AI Infrastructure | Ingrid Bergström | model_routing, inference_infrastructure, provider_abstraction, local_model_ops, cost_performance_optimization, web_research, source_verification, quality_review | 3 |
| TEAM-076 | Data Engineering & Data Platforms Core | Data & Artificial Intelligence / Data Engineering & Data Platforms | Kwesi Boateng | data_pipelines, data_warehousing, etl_elt, data_architecture, data_quality, web_research, source_verification, quality_review | 3 |
| TEAM-077 | Data Science & Decision Intelligence Core | Data & Artificial Intelligence / Data Science & Decision Intelligence | Dr. Sofia Petrovic | statistical_modeling, forecasting, experimentation, optimization, decision_science, web_research, source_verification, quality_review | 3 |
| TEAM-078 | Knowledge Systems & Enterprise Memory Core | Data & Artificial Intelligence / Knowledge Systems & Enterprise Memory | Leila Ben Youssef | knowledge_graphs, semantic_search, rag_systems, vector_databases, provenance, enterprise_memory, web_research, source_verification, quality_review | 3 |
| TEAM-079 | AI Governance Technology & Responsible AI Systems Core | Data & Artificial Intelligence / AI Governance Technology & Responsible AI Systems | Amina El-Sayed | ai_policy_enforcement, ai_lineage, ai_auditability, approval_gates, responsible_ai_controls, web_research, source_verification, quality_review | 3 |
| TEAM-080 | AI FinOps & Usage Intelligence Core | Data & Artificial Intelligence / AI FinOps & Usage Intelligence | Gabriel Costa | ai_cost_tracking, token_economics, compute_utilization, capacity_planning, cost_optimization, web_research, source_verification, quality_review | 3 |
| TEAM-081 | AI Platform Operations & Observability Core | Data & Artificial Intelligence / AI Platform Operations & Observability | Min-jun Park | agent_observability, model_monitoring, trace_analysis, latency_monitoring, drift_monitoring, web_research, source_verification, quality_review | 3 |
| TEAM-082 | Applied Research Core | Research & Development / Applied Research | Dr. Tendai Muchengeti | applied_research, research_design, technical_experimentation, evidence_synthesis, prototype_evaluation, web_research, source_verification, quality_review | 3 |
| TEAM-083 | Emerging Technologies & Future Systems Core | Research & Development / Emerging Technologies & Future Systems | Kenji Mori | technology_scouting, future_systems, technology_forecasting, experimental_assessment, web_research, source_verification, quality_review | 3 |
| TEAM-084 | Experimental Engineering & Prototyping Core | Research & Development / Experimental Engineering & Prototyping | Andrés Valdés | rapid_prototyping, proof_of_concept, experimental_engineering, prototype_testing, web_research, source_verification, quality_review | 3 |
| TEAM-085 | AI & Autonomous Systems Research Core | Research & Development / AI & Autonomous Systems Research | Dr. Samira Qureshi | autonomous_agents_research, multimodal_ai_research, machine_reasoning, agent_autonomy, web_research, source_verification, quality_review | 3 |
| TEAM-086 | Human–Computer Interaction & Future Interfaces Core | Research & Development / Human–Computer Interaction & Future Interfaces | Freja Lindholm | hci_research, voice_interfaces, gesture_interfaces, spatial_computing, human_ai_interaction, web_research, source_verification, quality_review | 3 |
| TEAM-087 | Advanced Computing & Systems Research Core | Research & Development / Advanced Computing & Systems Research | Dr. Kwame Asante | distributed_systems_research, edge_computing, privacy_preserving_compute, advanced_architectures, web_research, source_verification, quality_review | 3 |
| TEAM-088 | Research Partnerships & Academic Collaboration Core | Research & Development / Research Partnerships & Academic Collaboration | Claire Dubois | research_partnerships, academic_collaboration, joint_research, grant_scanning, web_research, source_verification, quality_review | 3 |
| TEAM-089 | Innovation Incubation & Technology Transfer Core | Research & Development / Innovation Incubation & Technology Transfer | Rafael Mendes | innovation_incubation, technology_transfer, maturity_assessment, venture_handoff, web_research, source_verification, quality_review | 3 |
| TEAM-090 | Intellectual Property Discovery & Invention Management Core | Research & Development / Intellectual Property Discovery & Invention Management | Noura Al-Mansouri | invention_capture, patentability_screening, prior_art_coordination, ip_portfolio_support, web_research, source_verification, quality_review | 3 |
| TEAM-091 | Research Intelligence & Scientific Foresight Core | Research & Development / Research Intelligence & Scientific Foresight | Dr. Ji-won Seo | literature_review, patent_landscape, scientific_foresight, research_trend_analysis, web_research, source_verification, quality_review | 3 |
| TEAM-092 | Enterprise Applications & Business Systems Core | Information Technology / Enterprise Applications & Business Systems | Grace Kimani | enterprise_apps, business_systems, application_admin, saas_governance, web_research, source_verification, quality_review | 3 |
| TEAM-093 | End-User Computing & Workplace Technology Core | Information Technology / End-User Computing & Workplace Technology | Yuki Tanaka | endpoint_management, workplace_technology, device_support, desktop_management, web_research, source_verification, quality_review | 3 |
| TEAM-094 | IT Service Management & Service Desk Core | Information Technology / IT Service Management & Service Desk | Michael O'Connor | itsm, incident_management, request_management, service_catalog, problem_management, web_research, source_verification, quality_review | 3 |
| TEAM-095 | Cloud & Infrastructure Operations Core | Information Technology / Cloud & Infrastructure Operations | Ananya Deshmukh | cloud_ops, server_ops, infrastructure_monitoring, backup_operations, web_research, source_verification, quality_review | 3 |
| TEAM-096 | Network & Connectivity Services Core | Information Technology / Network & Connectivity Services | Chinedu Eze | network_operations, connectivity, network_monitoring, network_capacity, web_research, source_verification, quality_review | 3 |
| TEAM-097 | Identity & Access Administration Core | Information Technology / Identity & Access Administration | Katarina Novak | identity_administration, access_provisioning, joiner_mover_leaver, mfa_admin, directory_services, web_research, source_verification, quality_review | 3 |
| TEAM-098 | Collaboration & Productivity Platforms Core | Information Technology / Collaboration & Productivity Platforms | Farah Rahman | collaboration_platforms, productivity_suite_admin, messaging_admin, document_collaboration, web_research, source_verification, quality_review | 3 |
| TEAM-099 | IT Asset & Configuration Management Core | Information Technology / IT Asset & Configuration Management | João Ferreira | it_asset_management, cmdb, license_tracking, configuration_management, web_research, source_verification, quality_review | 3 |
| TEAM-100 | Enterprise Systems Administration Core | Information Technology / Enterprise Systems Administration | Thabo Mokoena | systems_administration, patch_management, server_admin, enterprise_platform_ops, web_research, source_verification, quality_review | 3 |
| TEAM-101 | IT Architecture & Technology Standards Core | Information Technology / IT Architecture & Technology Standards | Dr. Elise van der Meer | it_architecture, technology_standards, it_roadmap, platform_standardization, web_research, source_verification, quality_review | 3 |
| TEAM-102 | Security Operations & Incident Response Core | Cybersecurity & Resilience / Security Operations & Incident Response | Marcus Lund | soc_operations, incident_response, detection_triage, case_management, containment_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-103 | Threat Intelligence & Threat Hunting Core | Cybersecurity & Resilience / Threat Intelligence & Threat Hunting | Olumide Adekunle | threat_intelligence, threat_hunting, ioc_analysis, adversary_tracking, web_research, source_verification, quality_review | 3 |
| TEAM-104 | Identity Security & Privileged Access Core | Cybersecurity & Resilience / Identity Security & Privileged Access | Camille Tremblay | iam_security, pam, conditional_access, identity_threat_detection, least_privilege, web_research, source_verification, quality_review | 3 |
| TEAM-105 | Security Engineering Core | Cybersecurity & Resilience / Security Engineering | Arjun Mehra | security_engineering, security_automation, security_tooling, control_implementation, web_research, source_verification, quality_review | 3 |
| TEAM-106 | Cloud & Infrastructure Security Core | Cybersecurity & Resilience / Cloud & Infrastructure Security | Sofia Dimitrova | cloud_security, infrastructure_security, configuration_assurance, cloud_posture_management, web_research, source_verification, quality_review | 3 |
| TEAM-107 | Application & Product Security Core | Cybersecurity & Resilience / Application & Product Security | Diego Morales | application_security, secure_sdlc, code_security, product_threat_modeling, web_research, source_verification, quality_review | 3 |
| TEAM-108 | Security Architecture Core | Cybersecurity & Resilience / Security Architecture | Dr. Miriam Kessler | security_architecture, zero_trust, control_architecture, security_patterns, web_research, source_verification, quality_review | 3 |
| TEAM-109 | Vulnerability & Exposure Management Core | Cybersecurity & Resilience / Vulnerability & Exposure Management | Bongani Dlamini | vulnerability_management, attack_surface_management, remediation_prioritization, exposure_analysis, web_research, source_verification, quality_review | 3 |
| TEAM-110 | Data Security & Information Protection Core | Cybersecurity & Resilience / Data Security & Information Protection | Noor Al-Khatib | data_security, dlp, classification, encryption_strategy, information_protection, web_research, source_verification, quality_review | 3 |
| TEAM-111 | Third-Party & Supply Chain Security Core | Cybersecurity & Resilience / Third-Party & Supply Chain Security | Haruka Watanabe | third_party_risk, supplier_security, supply_chain_security, vendor_assessment, web_research, source_verification, quality_review | 3 |
| TEAM-112 | Cyber Risk & Security Governance Core | Cybersecurity & Resilience / Cyber Risk & Security Governance | Gabriela Torres | cyber_risk, security_governance, security_policy, control_mapping, web_research, source_verification, quality_review | 3 |
| TEAM-113 | Business Continuity, Disaster Recovery & Cyber Resilience Core | Cybersecurity & Resilience / Business Continuity, Disaster Recovery & Cyber Resilience | Henrik Sørensen | business_continuity, disaster_recovery, resilience_testing, crisis_recovery, web_research, source_verification, quality_review | 3 |
| TEAM-114 | Accounting & Close Core | Finance & Accounting / Accounting & Close | Helena Costa | general_ledger, month_end_close, reconciliations, journal_entries, accounting_policy, web_research, source_verification, quality_review | 3 |
| TEAM-115 | Financial Reporting & Consolidation Core | Finance & Accounting / Financial Reporting & Consolidation | Kwabena Mensah | financial_reporting, consolidation, management_reporting, financial_statement_preparation, web_research, source_verification, quality_review | 3 |
| TEAM-116 | FP&A, Budgeting & Forecasting Core | Finance & Accounting / FP&A, Budgeting & Forecasting | Priya Raman | fp_and_a, budgeting, forecasting, variance_analysis, scenario_modeling, web_research, source_verification, quality_review | 3 |
| TEAM-117 | Treasury & Capital Management Core | Finance & Accounting / Treasury & Capital Management | Mikhail Petrov | treasury, cash_management, liquidity_planning, capital_management, banking_operations, web_research, source_verification, quality_review | 3 |
| TEAM-118 | Tax Core | Finance & Accounting / Tax | Aisha Bello | tax_compliance, tax_planning, tax_research, indirect_tax, corporate_tax, web_research, source_verification, quality_review | 3 |
| TEAM-119 | Billing, Accounts Receivable & Accounts Payable Core | Finance & Accounting / Billing, Accounts Receivable & Accounts Payable | Camila Ferreira | billing, accounts_receivable, accounts_payable, collections, vendor_payments, web_research, source_verification, quality_review | 3 |
| TEAM-120 | Payroll Finance Core | Finance & Accounting / Payroll Finance | Thandiwe Ncube | payroll_accounting, payroll_controls, payroll_reconciliation, compensation_accounting, web_research, source_verification, quality_review | 3 |
| TEAM-121 | Financial Controls & Management Accounting Core | Finance & Accounting / Financial Controls & Management Accounting | Giulia Romano | financial_controls, management_accounting, cost_accounting, control_testing, policy_compliance, web_research, source_verification, quality_review | 3 |
| TEAM-122 | Corporate & Commercial Legal Core | Legal, Risk & Governance / Corporate & Commercial Legal | Marcus Feldman | corporate_law, commercial_law, legal_advisory, entity_governance, web_research, source_verification, quality_review | 3 |
| TEAM-123 | Contracts & Transactions Core | Legal, Risk & Governance / Contracts & Transactions | Zainab Bakare | contract_review, contract_drafting, transaction_support, negotiation_support, web_research, source_verification, quality_review | 3 |
| TEAM-124 | Intellectual Property & Technology Legal Core | Legal, Risk & Governance / Intellectual Property & Technology Legal | Dr. Lucía Herrera | ip_law, technology_law, software_licensing, ip_strategy, patent_support, web_research, source_verification, quality_review | 3 |
| TEAM-125 | Employment Legal Core | Legal, Risk & Governance / Employment Legal | Daniel Cho | employment_law, workplace_legal, hr_legal_advice, policy_review, web_research, source_verification, quality_review | 3 |
| TEAM-126 | Privacy & Data Protection Core | Legal, Risk & Governance / Privacy & Data Protection | Amélie Laurent | privacy_law, data_protection, pia_dpia, data_subject_rights, privacy_contracts, web_research, source_verification, quality_review | 3 |
| TEAM-127 | Enterprise Risk Management Core | Legal, Risk & Governance / Enterprise Risk Management | Sipho Dlamini | enterprise_risk, risk_register, risk_assessment, risk_reporting, web_research, source_verification, quality_review | 3 |
| TEAM-128 | Governance & Board Affairs Core | Legal, Risk & Governance / Governance & Board Affairs | Ingrid Madsen | corporate_governance, board_support, policy_governance, committee_administration, web_research, source_verification, quality_review | 3 |
| TEAM-129 | Regulatory Compliance & Ethics Core | Legal, Risk & Governance / Regulatory Compliance & Ethics | Farida El-Masri | regulatory_compliance, ethics_program, compliance_monitoring, policy_compliance, web_research, source_verification, quality_review | 3 |
| TEAM-130 | Records & Information Governance Core | Legal, Risk & Governance / Records & Information Governance | Tomasz Kowalski | records_management, retention_schedule, information_governance, legal_hold_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-131 | HR Business Partnering & People Operations Core | People & Culture / HR Business Partnering & People Operations | Nneka Eze | hrbp, people_operations, workforce_support, policy_administration, web_research, source_verification, quality_review | 3 |
| TEAM-132 | Talent Acquisition Core | People & Culture / Talent Acquisition | Sofia Lindström | recruiting, candidate_sourcing, interview_design, talent_pipeline, web_research, source_verification, quality_review | 3 |
| TEAM-133 | Onboarding & Employee Experience Core | People & Culture / Onboarding & Employee Experience | Javier Morales | employee_onboarding, employee_experience, journey_design, engagement_programs, web_research, source_verification, quality_review | 3 |
| TEAM-134 | Employee Relations Core | People & Culture / Employee Relations | Amina Yusuf | employee_relations, case_management, workplace_investigations_coordination, conflict_resolution, web_research, source_verification, quality_review | 3 |
| TEAM-135 | Total Rewards, Compensation & Benefits Core | People & Culture / Total Rewards, Compensation & Benefits | Claire Beaumont | compensation, benefits, total_rewards, job_architecture, web_research, source_verification, quality_review | 3 |
| TEAM-136 | Performance & Talent Management Core | People & Culture / Performance & Talent Management | Kofi Agyeman | performance_management, talent_reviews, succession_planning, goal_management, web_research, source_verification, quality_review | 3 |
| TEAM-137 | Learning & Development Core | People & Culture / Learning & Development | Hana Suzuki | learning_design, training_programs, capability_development, curriculum_design, web_research, source_verification, quality_review | 3 |
| TEAM-138 | Organizational Design & Workforce Planning Core | People & Culture / Organizational Design & Workforce Planning | Rajiv Menon | org_design, workforce_planning, capacity_planning, role_design, web_research, source_verification, quality_review | 3 |
| TEAM-139 | People Analytics Core | People & Culture / People Analytics | Elena Popescu | people_analytics, workforce_metrics, attrition_analysis, engagement_analysis, web_research, source_verification, quality_review | 3 |
| TEAM-140 | AI Workforce & Organizational Intelligence Core | People & Culture / AI Workforce & Organizational Intelligence | Dr. Maya Kilonzo | agent_workforce_registry, agent_capability_mapping, agent_utilization, agent_reuse_scan, agent_governance, web_research, source_verification, quality_review | 3 |
| TEAM-141 | Corporate Operations Core | Operations & Procurement / Corporate Operations | Nadia Petrescu | corporate_operations, operating_rhythm, shared_services, operational_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-142 | Business Process & Continuous Improvement Core | Operations & Procurement / Business Process & Continuous Improvement | Samuel Adekunle | process_mapping, lean_improvement, process_automation, continuous_improvement, web_research, source_verification, quality_review | 3 |
| TEAM-143 | Procurement & Strategic Sourcing Core | Operations & Procurement / Procurement & Strategic Sourcing | Linh Nguyen | procurement, strategic_sourcing, rfp_management, supplier_selection, web_research, source_verification, quality_review | 3 |
| TEAM-144 | Vendor & Supplier Management Core | Operations & Procurement / Vendor & Supplier Management | Matteo Ricci | vendor_management, supplier_performance, contract_vendor_coordination, vendor_risk_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-145 | Facilities & Workplace Core | Operations & Procurement / Facilities & Workplace | Chloe Martin | facilities_management, workplace_services, space_operations, maintenance_coordination, web_research, source_verification, quality_review | 3 |
| TEAM-146 | Real Estate & Physical Infrastructure Core | Operations & Procurement / Real Estate & Physical Infrastructure | Ahmed Al-Hassan | real_estate, lease_management, site_planning, physical_infrastructure, web_research, source_verification, quality_review | 3 |
| TEAM-147 | Quality Management Core | Operations & Procurement / Quality Management | Dr. Eva Horváth | quality_management, quality_systems, root_cause_analysis, corrective_actions, web_research, source_verification, quality_review | 3 |
| TEAM-148 | Operational Performance & Service Excellence Core | Operations & Procurement / Operational Performance & Service Excellence | Bongiwe Khumalo | service_excellence, operational_kpis, capacity_analysis, service_improvement, web_research, source_verification, quality_review | 3 |
| TEAM-149 | Customer Success Core | Customer Organization / Customer Success | Sofia Mendes | customer_success, adoption_strategy, customer_value, success_planning, web_research, source_verification, quality_review | 3 |
| TEAM-150 | Customer Onboarding & Implementation Core | Customer Organization / Customer Onboarding & Implementation | Caleb Nwosu | customer_onboarding, implementation_planning, deployment_coordination, go_live_readiness, web_research, source_verification, quality_review | 3 |
| TEAM-151 | Professional Services Core | Customer Organization / Professional Services | Aiko Fujimoto | consulting_delivery, solution_implementation, client_delivery, engagement_management, web_research, source_verification, quality_review | 3 |
| TEAM-152 | Technical Account Management Core | Customer Organization / Technical Account Management | Lars Petersen | technical_account_management, technical_escalation, architecture_guidance, customer_technical_health, web_research, source_verification, quality_review | 3 |
| TEAM-153 | Customer Support & Service Desk Core | Customer Organization / Customer Support & Service Desk | Naomi Chen | customer_support, ticket_triage, knowledge_base, sla_management, web_research, source_verification, quality_review | 3 |
| TEAM-154 | Customer Education & Adoption Core | Customer Organization / Customer Education & Adoption | Fatima Zahra | customer_training, adoption_enablement, learning_content, enablement_programs, web_research, source_verification, quality_review | 3 |
| TEAM-155 | Renewals & Expansion Core | Customer Organization / Renewals & Expansion | Diego Fernandes | renewals, expansion_strategy, commercial_retention, renewal_forecasting, web_research, source_verification, quality_review | 3 |
| TEAM-156 | Customer Health & Escalation Management Core | Customer Organization / Customer Health & Escalation Management | Grace Owusu | customer_health, risk_accounts, escalation_management, churn_prevention, web_research, source_verification, quality_review | 3 |
| TEAM-157 | Financial Audit & Assurance Core | Internal Audit & Assurance / Financial Audit & Assurance | Helena Novak | financial_audit, assurance, audit_testing, financial_controls_review, web_research, source_verification, quality_review | 3 |
| TEAM-158 | Technology Audit Core | Internal Audit & Assurance / Technology Audit | Dr. Marcus Chen | technology_audit, it_controls, systems_assurance, change_management_audit, web_research, source_verification, quality_review | 3 |
| TEAM-159 | Cybersecurity Assurance Core | Internal Audit & Assurance / Cybersecurity Assurance | Leila Haddad-Sayegh | cyber_assurance, security_control_testing, security_audit, cyber_risk_assurance, web_research, source_verification, quality_review | 3 |
| TEAM-160 | Operational Audit Core | Internal Audit & Assurance / Operational Audit | Tawanda Moyo | operational_audit, process_audit, efficiency_review, control_assessment, web_research, source_verification, quality_review | 3 |
| TEAM-161 | Compliance & Governance Audit Core | Internal Audit & Assurance / Compliance & Governance Audit | Ingrid Solberg | compliance_audit, governance_assurance, regulatory_control_testing, web_research, source_verification, quality_review | 3 |
| TEAM-162 | Controls Assurance Core | Internal Audit & Assurance / Controls Assurance | Priya Kapoor | internal_controls, control_design_review, control_effectiveness_testing, sox_style_controls, web_research, source_verification, quality_review | 3 |
| TEAM-163 | AI Systems & Agent Governance Audit Core | Internal Audit & Assurance / AI Systems & Agent Governance Audit | Dr. Kojo Mensima | ai_audit, agent_governance_audit, model_risk_assurance, ai_control_testing, web_research, source_verification, quality_review | 3 |

### Executive and specialist personas

**PERSONA-01 / WHINK — WHINK**: Primary executive intelligence. Personality/operating posture: Calm, strategic, analytical, skeptical, concise, commercially aware, anti-sycophantic. Status: implemented_and_verified. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E835: `apps/web/prompts/persona-whink.ts:1`](../apps/web/prompts/persona-whink.ts#L1)

**PERSONA-02 / MAMBA — MAMBA**: Adversarial strategist / Consigliere. Personality/operating posture: Cold, calm, incisive, skeptical, slightly sardonic; lawful OBSIDIAN overlay. Status: implemented_and_verified. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E836: `apps/web/prompts/persona-mamba.ts:1`](../apps/web/prompts/persona-mamba.ts#L1)

**PERSONA-03 / PETER — Peter**: Principal Reverse Engineer and Product Forensics Architect. Personality/operating posture: Evidence-led; no-hallucination protocol. Status: partially_implemented. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E837: `apps/web/prompts/persona-peter.ts:1`](../apps/web/prompts/persona-peter.ts#L1)

**PERSONA-04 / PAUL — Paul**: Principal Reconstruction Engineer and Clean-Room Architect. Personality/operating posture: Behavioral fidelity, independent implementation, evidence-led. Status: partially_implemented. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E838: `apps/web/prompts/persona-paul.ts:1`](../apps/web/prompts/persona-paul.ts#L1)

**PERSONA-05 / MICAH — Micah**: Principal Product Auditor and Product Strategy Architect. Personality/operating posture: Stakeholder and evidence-led product assessment. Status: partially_implemented. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E839: `apps/web/prompts/persona-micah.ts:1`](../apps/web/prompts/persona-micah.ts#L1)

**PERSONA-06 / NANDI — Nandi**: Global Growth, Marketing, Conversion and Revenue Strategist. Personality/operating posture: Evidence-led, ethical, measurable commercial strategy. Status: partially_implemented. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E840: `apps/web/prompts/persona-nandi.ts:1`](../apps/web/prompts/persona-nandi.ts#L1)

**PERSONA-07 / SCOUT — Michael Carrick**: Master Researcher and Opportunity Intelligence Scout. Personality/operating posture: Attributable public evidence; no private-access claims. Status: partially_implemented. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E841: `apps/web/prompts/persona-scout.ts:1`](../apps/web/prompts/persona-scout.ts#L1)

**PERSONA-08 / REGISTRATION — Website Registration**: Founder-only website-registration planning. Personality/operating posture: No independent authority, no secret handling or arbitrary-site automation. Status: partially_implemented. shared permission engine; persona grants no authority; REGISTRATION owner-only switch. Marcus reporting: not implemented. Evidence: [E842: `apps/web/prompts/persona-registration.ts:1`](../apps/web/prompts/persona-registration.ts#L1)

### All board members

| ID | Name | Seat | Kind as recorded |
| --- | --- | --- | --- |
| BOARD-01 | Victor Igboekwe | Founder & Executive Director, Whink Consult | not explicitly specified in board record |
| BOARD-02 | Marcus Vale | Chief Executive Assistant, Office of the Founder | not explicitly specified in board record |
| BOARD-03 | WHINK | Chief of Staff / Managing Director, Whink Group | ai |
| BOARD-04 | MAMBA | Chief Executive Operating Officer / Consigliere | ai |
| BOARD-05 | Anthony Igboekwe | Executive Director, Whink Apps | not explicitly specified in board record |
| BOARD-06 | Dr Tinaye Lydia Muzenyi | Executive Director & Head of People Operations, Whink Frontliners | not explicitly specified in board record |
| BOARD-07 | Barrister Genevieve Igboekwe | Chief Legal Counsel, The Whink Group | not explicitly specified in board record |
| BOARD-08 | Juliet Igboekwe | Executive Director, Whink Trades & Investments | not explicitly specified in board record |

Board records are declared identities, not independently verified real-world appointments. Marcus is explicitly human in STAFF_DIRECTORY. WHINK/MAMBA are AI board members; board identity does not confer app privileges.

### Five subsidiaries

| ID | Name | Recorded executives | Notice |
| --- | --- | --- | --- |
| SUB-01 | Whink Consult | Victor Igboekwe — Founder & Executive Director, Whink Consult |  |
| SUB-02 | Whink Real Estate | Whitney Brown — Executive Director, Real Estate |  |
| SUB-03 | Whink Trades & Investments | Juliet Igboekwe — Executive Director, Whink Trades & Investments | We are no longer accepting investors. Whink Trades is closed to new investment. |
| SUB-04 | Whink Apps | Anthony Igboekwe — Executive Director, Whink Apps |  |
| SUB-05 | Whink Frontliners | Dr Tinaye Lydia Muzenyi — Executive Director & Head of People Operations, Whink Frontliners |  |

### All standing jobs and standby roles

| ID | Identity | Role | Job / schedule | Enabled | Registry ID resolves |
| --- | --- | --- | --- | --- | --- |
| JOB-01 | Amara Okafor | Chief Innovation & Opportunity Officer: weekly intelligence brief | weekly_brief / every 7d | True | False |
| JOB-02 | Mateo Restrepo | Senior Opportunity Scout: hourly scan of fresh news memories | opportunity_scan / every 1h | True | False |
| JOB-03 | Priya Raghunathan | Strategic Market Analyst: sector and competitor angle | opportunity_scan / every 6h | True | False |
| JOB-04 | Soren O'Connell | Growth Strategist: scale levers for existing subsidiaries | opportunity_scan / every 6h | True | False |
| JOB-05 | Mei-Ling Tan | Venture Scout: early-stage, acquisition and partnership angle | opportunity_scan / every 12h | True | False |
| JOB-06 | Jelena Marković | News desk: Americas | news_digest / every 30m | True | True |
| JOB-07 | Anika Patel | News desk: Europe & Africa | news_digest / every 30m | True | True |
| JOB-08 | Sofia Alvarez | News desk: Asia-Pacific | news_digest / every 30m | True | True |
| JOB-09 | Bianca Santos | News desk: technology & AI | news_digest / every 30m | True | True |
| JOB-10 | Leila Haddad | News desk: markets & business | news_digest / every 30m | True | True |
| JOB-11 | Noah Williams | News desk: Canada | news_digest / every 30m | True | True |
| JOB-12 | Vero Okafor | Project monitor: Whink Consult | project_monitor / every 2h | True | True |
| JOB-13 | Kike Oladele | Project monitor: Whink Real Estate | project_monitor / every 2h | True | True |
| JOB-14 | Nadia Rahman | Project monitor: Whink Trades & Investments | project_monitor / every 2h | True | True |
| JOB-15 | Hassan Bashir | Project monitor: WHINK Apps | project_monitor / every 2h | True | True |
| JOB-16 | Olamide Baddo | Project monitor: Whink Frontliners | project_monitor / every 2h | True | True |
| JOB-17 | Wanjiru Kamau | Security watch: denials and failures | security_watch / every 15m | True | True |
| JOB-18 | Yetunde Adeyinka | Security watch: injection and untrusted content | security_watch / every 30m | True | True |
| JOB-19 | Kehinde Adewale | Security watch: approvals and protected actions | security_watch / every 1h | True | True |
| JOB-20 | Jorge Almeida | Memory curation: consolidate duplicates | memory_curation / every 24h | True | True |
| JOB-21 | Tara Singh | Memory curation: decay stale low-confidence items | memory_curation / every 24h | True | True |
| JOB-22 | Aarav Kapoor | Executive office: briefing and decision tracking (standby, no job yet) | None / every 24h | False | True |
| JOB-23 | Amina Diallo | Executive office: reviewer (standby, no job yet) | None / every 24h | False | True |
| JOB-24 | Lucía Navarro | Executive office: strategic prioritisation (standby, no job yet) | None / every 24h | False | True |
| JOB-25 | Amina Garba | Operations: operating rhythm (standby, no job yet) | None / every 24h | False | True |
| JOB-26 | Chinelo Obi | Operations: process watch (standby, no job yet) | None / every 24h | False | True |
| JOB-27 | Zanele Dube | Finance watch: variance and forecast (standby, no job yet) | None / every 24h | False | True |
| JOB-28 | Abiola Ogunbayo | Legal & compliance watch (standby, no job yet) | None / every 24h | False | True |

Additional system jobs: SYSJOB-01 skills_sweeper and SYSJOB-02 swarm_resume, each every five minutes. Roster enabled is configuration, not proof of a live process. The five innovation identities resolve through the separate staff directory.

### All development-agent definitions

| ID | Definition | Role/description | Model | Tools |
| --- | --- | --- | --- | --- |
| DEV-01 | .claude/agents/ai-evaluator.md | Use after any change to prompts, personas, models, memory or tools, and at the end of every phase, to test how WHINK and MAMBA actually behave. Maintains the scenario library and blocks releases on regression. | sonnet | Read, Write, Grep, Glob, Bash |
| DEV-02 | .claude/agents/backend-engineer.md | Use to build server side code in apps/web: Prisma schema and migrations, API routes, the model router, the tool loop, the permission engine, the ledger, and the memory engine. | sonnet | Read, Write, Edit, MultiEdit, Bash, Grep, Glob |
| DEV-03 | .claude/agents/brand-guardian.md | Use to review any visual change for design token use, palette discipline, typography, and white label safety. | haiku | Read, Grep, Glob |
| DEV-04 | .claude/agents/compliance-checker.md | Use when adding dependencies, handling personal or client data, sending messages or email on a user's behalf, preparing for sale to customers, or submitting to an app store. | sonnet | Read, Grep, Glob, WebSearch, WebFetch |
| DEV-05 | .claude/agents/devops-engineer.md | Use for Docker Compose, local services (Postgres, Redis, Ollama, OpenClaw, AnythingLLM), environment and secret handling, backups, and moving WHINK to an always on Mac Mini. | sonnet | Read, Write, Edit, Bash, Grep, Glob |
| DEV-06 | .claude/agents/frontend-engineer.md | Use to build interface screens from the Claude Design mockups: Presence, Conversation, Voice, Obsidian, Neural Link, Metrics, Permissions and Ledger, onboarding and account screens, plus the avatar renderer and action trace. | sonnet | Read, Write, Edit, MultiEdit, Bash, Grep, Glob |
| DEV-07 | .claude/agents/integrations-engineer.md | Use to connect external systems to WHINK: OpenClaw as the action gateway over MCP, AnythingLLM for document recall, the ADA V2 voice and vision service, Deepgram fallback speech, and any third party API. | sonnet | Read, Write, Edit, MultiEdit, Bash, Grep, Glob, WebFetch |
| DEV-08 | .claude/agents/lead-architect.md | Use at the start of every task and every phase to plan the work, write acceptance criteria, and choose which agents do it. Use before any merge to approve or reject. Use whenever a decision would lock in a vendor, a data shape, or a security boundary. | opus | Read, Grep, Glob, Bash, Write, Edit, TodoWrite, Task |
| DEV-09 | .claude/agents/performance-benchmarker.md | Use at the end of each phase, and whenever voice, avatar, memory search or the agent loop changes, to measure latency, memory use and cost against budget. | sonnet | Read, Grep, Glob, Bash |
| DEV-10 | .claude/agents/qa-engineer.md | Use at the end of each task and each phase to exercise the running app the way a person would, against the acceptance criteria and the design mockups. Reports bugs; never fixes them. | sonnet | Read, Grep, Glob, Bash |
| DEV-11 | .claude/agents/security-reviewer.md | Use to review any change that touches authentication, permissions, tenant data, secrets, tools, external content, or network exposure. Use before every merge in those areas and at the end of every phase. Reviews only; never writes the code it reviews. | opus | Read, Grep, Glob, Bash |
| DEV-12 | .claude/agents/test-engineer.md | Use after any code change to write and run automated tests, and before every merge. Owns unit and integration tests, especially for the tool loop, permission engine, ledger and tenant isolation. | sonnet | Read, Write, Edit, Bash, Grep, Glob |
| DEV-13 | .claude/agents/whink.md | "WHINK — AI Chief of Staff and autonomous build commander. Use for any build directive, phase planning, competitive intelligence, or strategic decision. WHINK intercepts every directive, issues an EAR, and dispatches the build team autonomously after approval. This is the primary entry point for all WHINK Ultimate development." | opus | Read, Write, Edit, Bash, Grep, Glob, Agent, WebSearch, WebFetch |

These 13 definitions are developer-tool instructions, not app workforce agents, and none was invoked. Complete definition text is retained in JSON.

### All 570 declared skills

| ID | Source skill ID | Name |
| --- | --- | --- |
| SKILL-001 | web_research | Web Research |
| SKILL-002 | source_verification | Source Verification |
| SKILL-003 | document_analysis | Document Analysis |
| SKILL-004 | executive_briefing | Executive Briefing |
| SKILL-005 | project_decomposition | Project Decomposition |
| SKILL-006 | risk_assessment | Risk Assessment |
| SKILL-007 | data_analysis | Data Analysis |
| SKILL-008 | scenario_analysis | Scenario Analysis |
| SKILL-009 | stakeholder_mapping | Stakeholder Mapping |
| SKILL-010 | quality_review | Quality Review |
| SKILL-011 | approval_routing | Approval Routing |
| SKILL-012 | agent_reuse_scan | Agent Reuse Scan |
| SKILL-013 | academic_collaboration | Academic Collaboration |
| SKILL-014 | access_provisioning | Access Provisioning |
| SKILL-015 | accessibility_review | Accessibility Review |
| SKILL-016 | account_growth | Account Growth |
| SKILL-017 | account_health | Account Health |
| SKILL-018 | account_planning | Account Planning |
| SKILL-019 | accounting_policy | Accounting Policy |
| SKILL-020 | accounts_payable | Accounts Payable |
| SKILL-021 | accounts_receivable | Accounts Receivable |
| SKILL-022 | adoption_analysis | Adoption Analysis |
| SKILL-023 | adoption_enablement | Adoption Enablement |
| SKILL-024 | adoption_strategy | Adoption Strategy |
| SKILL-025 | advanced_architectures | Advanced Architectures |
| SKILL-026 | adversary_tracking | Adversary Tracking |
| SKILL-027 | agent_architecture | Agent Architecture |
| SKILL-028 | agent_autonomy | Agent Autonomy |
| SKILL-029 | agent_capability_mapping | Agent Capability Mapping |
| SKILL-030 | agent_governance | Agent Governance |
| SKILL-031 | agent_governance_audit | Agent Governance Audit |
| SKILL-032 | agent_lifecycle | Agent Lifecycle |
| SKILL-033 | agent_observability | Agent Observability |
| SKILL-034 | agent_registry | Agent Registry |
| SKILL-035 | agent_utilization | Agent Utilization |
| SKILL-036 | agent_workforce_registry | Agent Workforce Registry |
| SKILL-037 | ai_application_engineering | Ai Application Engineering |
| SKILL-038 | ai_audit | Ai Audit |
| SKILL-039 | ai_auditability | Ai Auditability |
| SKILL-040 | ai_automation | Ai Automation |
| SKILL-041 | ai_control_testing | Ai Control Testing |
| SKILL-042 | ai_cost_tracking | Ai Cost Tracking |
| SKILL-043 | ai_lineage | Ai Lineage |
| SKILL-044 | ai_policy_enforcement | Ai Policy Enforcement |
| SKILL-045 | annual_planning | Annual Planning |
| SKILL-046 | api_design | Api Design |
| SKILL-047 | application_admin | Application Admin |
| SKILL-048 | application_architecture | Application Architecture |
| SKILL-049 | application_security | Application Security |
| SKILL-050 | applied_research | Applied Research |
| SKILL-051 | approval_gates | Approval Gates |
| SKILL-052 | architecture_documentation | Architecture Documentation |
| SKILL-053 | architecture_guidance | Architecture Guidance |
| SKILL-054 | architecture_review | Architecture Review |
| SKILL-055 | assurance | Assurance |
| SKILL-056 | attack_surface_management | Attack Surface Management |
| SKILL-057 | attrition_analysis | Attrition Analysis |
| SKILL-058 | audience_intelligence | Audience Intelligence |
| SKILL-059 | audit_testing | Audit Testing |
| SKILL-060 | autonomous_agents_research | Autonomous Agents Research |
| SKILL-061 | backend_engineering | Backend Engineering |
| SKILL-062 | backup_operations | Backup Operations |
| SKILL-063 | banking_operations | Banking Operations |
| SKILL-064 | benchmarking | Benchmarking |
| SKILL-065 | benefits | Benefits |
| SKILL-066 | benefits_realization | Benefits Realization |
| SKILL-067 | billing | Billing |
| SKILL-068 | board_support | Board Support |
| SKILL-069 | brand_strategy | Brand Strategy |
| SKILL-070 | budgeting | Budgeting |
| SKILL-071 | build_systems | Build Systems |
| SKILL-072 | business_continuity | Business Continuity |
| SKILL-073 | business_systems | Business Systems |
| SKILL-074 | candidate_sourcing | Candidate Sourcing |
| SKILL-075 | capability_development | Capability Development |
| SKILL-076 | capability_mapping | Capability Mapping |
| SKILL-077 | capacity_analysis | Capacity Analysis |
| SKILL-078 | capacity_management | Capacity Management |
| SKILL-079 | capacity_planning | Capacity Planning |
| SKILL-080 | capital_management | Capital Management |
| SKILL-081 | case_management | Case Management |
| SKILL-082 | cash_management | Cash Management |
| SKILL-083 | change_coordination | Change Coordination |
| SKILL-084 | change_enablement | Change Enablement |
| SKILL-085 | change_management_audit | Change Management Audit |
| SKILL-086 | channel_pipeline | Channel Pipeline |
| SKILL-087 | channel_strategy | Channel Strategy |
| SKILL-088 | churn_prevention | Churn Prevention |
| SKILL-089 | cicd | Cicd |
| SKILL-090 | classification | Classification |
| SKILL-091 | client_delivery | Client Delivery |
| SKILL-092 | client_performance | Client Performance |
| SKILL-093 | cloud_infrastructure | Cloud Infrastructure |
| SKILL-094 | cloud_ops | Cloud Ops |
| SKILL-095 | cloud_posture_management | Cloud Posture Management |
| SKILL-096 | cloud_security | Cloud Security |
| SKILL-097 | cmdb | Cmdb |
| SKILL-098 | co_sell_planning | Co Sell Planning |
| SKILL-099 | code_review | Code Review |
| SKILL-100 | code_security | Code Security |
| SKILL-101 | coding_standards | Coding Standards |
| SKILL-102 | collaboration_platforms | Collaboration Platforms |
| SKILL-103 | collections | Collections |
| SKILL-104 | commercial_law | Commercial Law |
| SKILL-105 | commercial_retention | Commercial Retention |
| SKILL-106 | commercial_sales | Commercial Sales |
| SKILL-107 | committee_administration | Committee Administration |
| SKILL-108 | compensation | Compensation |
| SKILL-109 | compensation_accounting | Compensation Accounting |
| SKILL-110 | competitive_positioning | Competitive Positioning |
| SKILL-111 | complex_deal_management | Complex Deal Management |
| SKILL-112 | compliance_audit | Compliance Audit |
| SKILL-113 | compliance_monitoring | Compliance Monitoring |
| SKILL-114 | compute_utilization | Compute Utilization |
| SKILL-115 | conditional_access | Conditional Access |
| SKILL-116 | configuration_assurance | Configuration Assurance |
| SKILL-117 | configuration_management | Configuration Management |
| SKILL-118 | conflict_resolution | Conflict Resolution |
| SKILL-119 | connectivity | Connectivity |
| SKILL-120 | consolidation | Consolidation |
| SKILL-121 | consulting_delivery | Consulting Delivery |
| SKILL-122 | containment_coordination | Containment Coordination |
| SKILL-123 | content_strategy | Content Strategy |
| SKILL-124 | continuous_improvement | Continuous Improvement |
| SKILL-125 | contract_drafting | Contract Drafting |
| SKILL-126 | contract_review | Contract Review |
| SKILL-127 | contract_vendor_coordination | Contract Vendor Coordination |
| SKILL-128 | control_architecture | Control Architecture |
| SKILL-129 | control_assessment | Control Assessment |
| SKILL-130 | control_design_review | Control Design Review |
| SKILL-131 | control_effectiveness_testing | Control Effectiveness Testing |
| SKILL-132 | control_implementation | Control Implementation |
| SKILL-133 | control_mapping | Control Mapping |
| SKILL-134 | control_testing | Control Testing |
| SKILL-135 | corporate_governance | Corporate Governance |
| SKILL-136 | corporate_law | Corporate Law |
| SKILL-137 | corporate_operations | Corporate Operations |
| SKILL-138 | corporate_strategy | Corporate Strategy |
| SKILL-139 | corporate_tax | Corporate Tax |
| SKILL-140 | corrective_actions | Corrective Actions |
| SKILL-141 | cost_accounting | Cost Accounting |
| SKILL-142 | cost_optimization | Cost Optimization |
| SKILL-143 | cost_performance_optimization | Cost Performance Optimization |
| SKILL-144 | creative_direction | Creative Direction |
| SKILL-145 | crisis_recovery | Crisis Recovery |
| SKILL-146 | crm_governance | Crm Governance |
| SKILL-147 | cross_functional_coordination | Cross Functional Coordination |
| SKILL-148 | cross_functional_delivery | Cross Functional Delivery |
| SKILL-149 | cross_platform_architecture | Cross Platform Architecture |
| SKILL-150 | curriculum_design | Curriculum Design |
| SKILL-151 | customer_health | Customer Health |
| SKILL-152 | customer_interviews | Customer Interviews |
| SKILL-153 | customer_marketing | Customer Marketing |
| SKILL-154 | customer_onboarding | Customer Onboarding |
| SKILL-155 | customer_success | Customer Success |
| SKILL-156 | customer_support | Customer Support |
| SKILL-157 | customer_technical_health | Customer Technical Health |
| SKILL-158 | customer_training | Customer Training |
| SKILL-159 | customer_value | Customer Value |
| SKILL-160 | cyber_assurance | Cyber Assurance |
| SKILL-161 | cyber_risk | Cyber Risk |
| SKILL-162 | cyber_risk_assurance | Cyber Risk Assurance |
| SKILL-163 | data_architecture | Data Architecture |
| SKILL-164 | data_pipelines | Data Pipelines |
| SKILL-165 | data_protection | Data Protection |
| SKILL-166 | data_quality | Data Quality |
| SKILL-167 | data_security | Data Security |
| SKILL-168 | data_subject_rights | Data Subject Rights |
| SKILL-169 | data_warehousing | Data Warehousing |
| SKILL-170 | deal_qualification | Deal Qualification |
| SKILL-171 | deal_screening | Deal Screening |
| SKILL-172 | decision_science | Decision Science |
| SKILL-173 | decision_support | Decision Support |
| SKILL-174 | decision_tracking | Decision Tracking |
| SKILL-175 | delegation_design | Delegation Design |
| SKILL-176 | demand_generation | Demand Generation |
| SKILL-177 | demo_strategy | Demo Strategy |
| SKILL-178 | dependency_tracking | Dependency Tracking |
| SKILL-179 | deployment_automation | Deployment Automation |
| SKILL-180 | deployment_coordination | Deployment Coordination |
| SKILL-181 | deprecation_planning | Deprecation Planning |
| SKILL-182 | desktop_clients | Desktop Clients |
| SKILL-183 | desktop_management | Desktop Management |
| SKILL-184 | detection_triage | Detection Triage |
| SKILL-185 | dev_environment_design | Dev Environment Design |
| SKILL-186 | developer_docs | Developer Docs |
| SKILL-187 | developer_experience | Developer Experience |
| SKILL-188 | developer_platforms | Developer Platforms |
| SKILL-189 | developer_productivity | Developer Productivity |
| SKILL-190 | device_integration | Device Integration |
| SKILL-191 | device_support | Device Support |
| SKILL-192 | directory_services | Directory Services |
| SKILL-193 | disaster_recovery | Disaster Recovery |
| SKILL-194 | distributed_systems_research | Distributed Systems Research |
| SKILL-195 | dlp | Dlp |
| SKILL-196 | document_collaboration | Document Collaboration |
| SKILL-197 | drift_monitoring | Drift Monitoring |
| SKILL-198 | due_diligence_coordination | Due Diligence Coordination |
| SKILL-199 | edge_computing | Edge Computing |
| SKILL-200 | efficiency_review | Efficiency Review |
| SKILL-201 | employee_experience | Employee Experience |
| SKILL-202 | employee_onboarding | Employee Onboarding |
| SKILL-203 | employee_relations | Employee Relations |
| SKILL-204 | employment_law | Employment Law |
| SKILL-205 | enablement_programs | Enablement Programs |
| SKILL-206 | encryption_strategy | Encryption Strategy |
| SKILL-207 | endpoint_management | Endpoint Management |
| SKILL-208 | engagement_analysis | Engagement Analysis |
| SKILL-209 | engagement_management | Engagement Management |
| SKILL-210 | engagement_programs | Engagement Programs |
| SKILL-211 | engineering_tooling | Engineering Tooling |
| SKILL-212 | enterprise_apps | Enterprise Apps |
| SKILL-213 | enterprise_architecture | Enterprise Architecture |
| SKILL-214 | enterprise_memory | Enterprise Memory |
| SKILL-215 | enterprise_platform_ops | Enterprise Platform Ops |
| SKILL-216 | enterprise_risk | Enterprise Risk |
| SKILL-217 | enterprise_sales_strategy | Enterprise Sales Strategy |
| SKILL-218 | entity_governance | Entity Governance |
| SKILL-219 | escalation_management | Escalation Management |
| SKILL-220 | ethics_program | Ethics Program |
| SKILL-221 | etl_elt | Etl Elt |
| SKILL-222 | evidence_synthesis | Evidence Synthesis |
| SKILL-223 | executive_coordination | Executive Coordination |
| SKILL-224 | executive_dashboarding | Executive Dashboarding |
| SKILL-225 | executive_selling | Executive Selling |
| SKILL-226 | expansion_strategy | Expansion Strategy |
| SKILL-227 | experiment_design | Experiment Design |
| SKILL-228 | experimental_assessment | Experimental Assessment |
| SKILL-229 | experimental_engineering | Experimental Engineering |
| SKILL-230 | experimentation | Experimentation |
| SKILL-231 | exposure_analysis | Exposure Analysis |
| SKILL-232 | facilities_management | Facilities Management |
| SKILL-233 | feature_prioritization | Feature Prioritization |
| SKILL-234 | feature_usage_analysis | Feature Usage Analysis |
| SKILL-235 | financial_audit | Financial Audit |
| SKILL-236 | financial_controls | Financial Controls |
| SKILL-237 | financial_controls_review | Financial Controls Review |
| SKILL-238 | financial_reporting | Financial Reporting |
| SKILL-239 | financial_statement_preparation | Financial Statement Preparation |
| SKILL-240 | fine_tuning | Fine Tuning |
| SKILL-241 | forecast_synthesis | Forecast Synthesis |
| SKILL-242 | forecasting | Forecasting |
| SKILL-243 | fp_and_a | Fp And A |
| SKILL-244 | frontend_engineering | Frontend Engineering |
| SKILL-245 | future_systems | Future Systems |
| SKILL-246 | general_ledger | General Ledger |
| SKILL-247 | gesture_interfaces | Gesture Interfaces |
| SKILL-248 | go_live_readiness | Go Live Readiness |
| SKILL-249 | goal_management | Goal Management |
| SKILL-250 | governance_assurance | Governance Assurance |
| SKILL-251 | grant_scanning | Grant Scanning |
| SKILL-252 | growth_strategy | Growth Strategy |
| SKILL-253 | hallucination_testing | Hallucination Testing |
| SKILL-254 | hci_research | Hci Research |
| SKILL-255 | high_velocity_pipeline | High Velocity Pipeline |
| SKILL-256 | hr_legal_advice | Hr Legal Advice |
| SKILL-257 | hrbp | Hrbp |
| SKILL-258 | human_ai_interaction | Human Ai Interaction |
| SKILL-259 | iam_security | Iam Security |
| SKILL-260 | identity_administration | Identity Administration |
| SKILL-261 | identity_threat_detection | Identity Threat Detection |
| SKILL-262 | implementation_planning | Implementation Planning |
| SKILL-263 | inbound_triage | Inbound Triage |
| SKILL-264 | incident_management | Incident Management |
| SKILL-265 | incident_response | Incident Response |
| SKILL-266 | indirect_tax | Indirect Tax |
| SKILL-267 | inference_infrastructure | Inference Infrastructure |
| SKILL-268 | inference_workflows | Inference Workflows |
| SKILL-269 | information_governance | Information Governance |
| SKILL-270 | information_protection | Information Protection |
| SKILL-271 | infrastructure_monitoring | Infrastructure Monitoring |
| SKILL-272 | infrastructure_security | Infrastructure Security |
| SKILL-273 | innovation_incubation | Innovation Incubation |
| SKILL-274 | integration_architecture | Integration Architecture |
| SKILL-275 | internal_controls | Internal Controls |
| SKILL-276 | interview_design | Interview Design |
| SKILL-277 | invention_capture | Invention Capture |
| SKILL-278 | investment_prioritization | Investment Prioritization |
| SKILL-279 | investment_thesis | Investment Thesis |
| SKILL-280 | ioc_analysis | Ioc Analysis |
| SKILL-281 | ip_law | Ip Law |
| SKILL-282 | ip_portfolio_support | Ip Portfolio Support |
| SKILL-283 | ip_strategy | Ip Strategy |
| SKILL-284 | it_architecture | It Architecture |
| SKILL-285 | it_asset_management | It Asset Management |
| SKILL-286 | it_controls | It Controls |
| SKILL-287 | it_roadmap | It Roadmap |
| SKILL-288 | itsm | Itsm |
| SKILL-289 | job_architecture | Job Architecture |
| SKILL-290 | jobs_to_be_done | Jobs To Be Done |
| SKILL-291 | joiner_mover_leaver | Joiner Mover Leaver |
| SKILL-292 | joint_research | Joint Research |
| SKILL-293 | joint_venture_analysis | Joint Venture Analysis |
| SKILL-294 | journal_entries | Journal Entries |
| SKILL-295 | journey_design | Journey Design |
| SKILL-296 | journey_mapping | Journey Mapping |
| SKILL-297 | knowledge_base | Knowledge Base |
| SKILL-298 | knowledge_graphs | Knowledge Graphs |
| SKILL-299 | knowledge_management | Knowledge Management |
| SKILL-300 | kpi_design | Kpi Design |
| SKILL-301 | latency_monitoring | Latency Monitoring |
| SKILL-302 | launch_readiness | Launch Readiness |
| SKILL-303 | lead_qualification | Lead Qualification |
| SKILL-304 | leadership_meeting_ops | Leadership Meeting Ops |
| SKILL-305 | lean_improvement | Lean Improvement |
| SKILL-306 | learning_content | Learning Content |
| SKILL-307 | learning_design | Learning Design |
| SKILL-308 | lease_management | Lease Management |
| SKILL-309 | least_privilege | Least Privilege |
| SKILL-310 | legal_advisory | Legal Advisory |
| SKILL-311 | legal_hold_coordination | Legal Hold Coordination |
| SKILL-312 | license_tracking | License Tracking |
| SKILL-313 | lifecycle_management | Lifecycle Management |
| SKILL-314 | liquidity_planning | Liquidity Planning |
| SKILL-315 | literature_review | Literature Review |
| SKILL-316 | llm_integration | Llm Integration |
| SKILL-317 | local_model_ops | Local Model Ops |
| SKILL-318 | machine_learning | Machine Learning |
| SKILL-319 | machine_reasoning | Machine Reasoning |
| SKILL-320 | maintenance_coordination | Maintenance Coordination |
| SKILL-321 | management_accounting | Management Accounting |
| SKILL-322 | management_reporting | Management Reporting |
| SKILL-323 | market_fit_analysis | Market Fit Analysis |
| SKILL-324 | marketing_operations | Marketing Operations |
| SKILL-325 | maturity_assessment | Maturity Assessment |
| SKILL-326 | media_distribution | Media Distribution |
| SKILL-327 | meeting_generation | Meeting Generation |
| SKILL-328 | messaging_admin | Messaging Admin |
| SKILL-329 | mfa_admin | Mfa Admin |
| SKILL-330 | mobile_engineering | Mobile Engineering |
| SKILL-331 | model_evaluation | Model Evaluation |
| SKILL-332 | model_monitoring | Model Monitoring |
| SKILL-333 | model_risk_assurance | Model Risk Assurance |
| SKILL-334 | model_routing | Model Routing |
| SKILL-335 | model_training | Model Training |
| SKILL-336 | month_end_close | Month End Close |
| SKILL-337 | multi_agent_orchestration | Multi Agent Orchestration |
| SKILL-338 | multimodal_ai_research | Multimodal Ai Research |
| SKILL-339 | negotiation_support | Negotiation Support |
| SKILL-340 | network_capacity | Network Capacity |
| SKILL-341 | network_monitoring | Network Monitoring |
| SKILL-342 | network_operations | Network Operations |
| SKILL-343 | objective_design | Objective Design |
| SKILL-344 | observability | Observability |
| SKILL-345 | operating_rhythm | Operating Rhythm |
| SKILL-346 | operational_audit | Operational Audit |
| SKILL-347 | operational_coordination | Operational Coordination |
| SKILL-348 | operational_kpis | Operational Kpis |
| SKILL-349 | optimization | Optimization |
| SKILL-350 | org_design | Org Design |
| SKILL-351 | outbound_sequence_design | Outbound Sequence Design |
| SKILL-352 | pam | Pam |
| SKILL-353 | partner_enablement | Partner Enablement |
| SKILL-354 | partner_integrations | Partner Integrations |
| SKILL-355 | partner_recruitment | Partner Recruitment |
| SKILL-356 | patch_management | Patch Management |
| SKILL-357 | patent_landscape | Patent Landscape |
| SKILL-358 | patent_support | Patent Support |
| SKILL-359 | patentability_screening | Patentability Screening |
| SKILL-360 | payroll_accounting | Payroll Accounting |
| SKILL-361 | payroll_controls | Payroll Controls |
| SKILL-362 | payroll_reconciliation | Payroll Reconciliation |
| SKILL-363 | people_analytics | People Analytics |
| SKILL-364 | people_operations | People Operations |
| SKILL-365 | performance_analysis | Performance Analysis |
| SKILL-366 | performance_management | Performance Management |
| SKILL-367 | performance_testing | Performance Testing |
| SKILL-368 | permission_integration | Permission Integration |
| SKILL-369 | persona_research | Persona Research |
| SKILL-370 | physical_infrastructure | Physical Infrastructure |
| SKILL-371 | pia_dpia | Pia Dpia |
| SKILL-372 | pipeline_analytics | Pipeline Analytics |
| SKILL-373 | pipeline_management | Pipeline Management |
| SKILL-374 | platform_engineering | Platform Engineering |
| SKILL-375 | platform_standardization | Platform Standardization |
| SKILL-376 | policy_administration | Policy Administration |
| SKILL-377 | policy_compliance | Policy Compliance |
| SKILL-378 | policy_governance | Policy Governance |
| SKILL-379 | policy_review | Policy Review |
| SKILL-380 | portfolio_management | Portfolio Management |
| SKILL-381 | portfolio_prioritization | Portfolio Prioritization |
| SKILL-382 | portfolio_strategy | Portfolio Strategy |
| SKILL-383 | pre_sales_architecture | Pre Sales Architecture |
| SKILL-384 | predictive_modeling | Predictive Modeling |
| SKILL-385 | prior_art_coordination | Prior Art Coordination |
| SKILL-386 | priority_management | Priority Management |
| SKILL-387 | privacy_contracts | Privacy Contracts |
| SKILL-388 | privacy_law | Privacy Law |
| SKILL-389 | privacy_preserving_compute | Privacy Preserving Compute |
| SKILL-390 | problem_management | Problem Management |
| SKILL-391 | problem_validation | Problem Validation |
| SKILL-392 | process_audit | Process Audit |
| SKILL-393 | process_automation | Process Automation |
| SKILL-394 | process_mapping | Process Mapping |
| SKILL-395 | procurement | Procurement |
| SKILL-396 | product_analytics | Product Analytics |
| SKILL-397 | product_discovery | Product Discovery |
| SKILL-398 | product_marketing | Product Marketing |
| SKILL-399 | product_planning_ops | Product Planning Ops |
| SKILL-400 | product_process_design | Product Process Design |
| SKILL-401 | product_strategy | Product Strategy |
| SKILL-402 | product_threat_modeling | Product Threat Modeling |
| SKILL-403 | product_vision | Product Vision |
| SKILL-404 | production_ai | Production Ai |
| SKILL-405 | productivity_suite_admin | Productivity Suite Admin |
| SKILL-406 | program_governance | Program Governance |
| SKILL-407 | program_management | Program Management |
| SKILL-408 | proof_of_concept | Proof Of Concept |
| SKILL-409 | prospecting | Prospecting |
| SKILL-410 | prototype_evaluation | Prototype Evaluation |
| SKILL-411 | prototype_testing | Prototype Testing |
| SKILL-412 | provenance | Provenance |
| SKILL-413 | provider_abstraction | Provider Abstraction |
| SKILL-414 | quality_gates | Quality Gates |
| SKILL-415 | quality_management | Quality Management |
| SKILL-416 | quality_systems | Quality Systems |
| SKILL-417 | rag_systems | Rag Systems |
| SKILL-418 | rapid_prototyping | Rapid Prototyping |
| SKILL-419 | real_estate | Real Estate |
| SKILL-420 | recommendation_systems | Recommendation Systems |
| SKILL-421 | reconciliations | Reconciliations |
| SKILL-422 | records_management | Records Management |
| SKILL-423 | recruiting | Recruiting |
| SKILL-424 | red_team_coordination | Red Team Coordination |
| SKILL-425 | regression_testing | Regression Testing |
| SKILL-426 | regulatory_compliance | Regulatory Compliance |
| SKILL-427 | regulatory_control_testing | Regulatory Control Testing |
| SKILL-428 | relationship_management | Relationship Management |
| SKILL-429 | release_governance | Release Governance |
| SKILL-430 | release_packaging | Release Packaging |
| SKILL-431 | release_readiness | Release Readiness |
| SKILL-432 | remediation_prioritization | Remediation Prioritization |
| SKILL-433 | renewal_forecasting | Renewal Forecasting |
| SKILL-434 | renewal_strategy | Renewal Strategy |
| SKILL-435 | renewals | Renewals |
| SKILL-436 | reputation_intelligence | Reputation Intelligence |
| SKILL-437 | request_management | Request Management |
| SKILL-438 | requirements_management | Requirements Management |
| SKILL-439 | research_design | Research Design |
| SKILL-440 | research_partnerships | Research Partnerships |
| SKILL-441 | research_trend_analysis | Research Trend Analysis |
| SKILL-442 | resilience_testing | Resilience Testing |
| SKILL-443 | resource_prioritization | Resource Prioritization |
| SKILL-444 | responsible_ai_controls | Responsible Ai Controls |
| SKILL-445 | retention_analysis | Retention Analysis |
| SKILL-446 | retention_schedule | Retention Schedule |
| SKILL-447 | revenue_reporting | Revenue Reporting |
| SKILL-448 | rfp_management | Rfp Management |
| SKILL-449 | risk_accounts | Risk Accounts |
| SKILL-450 | risk_register | Risk Register |
| SKILL-451 | risk_reporting | Risk Reporting |
| SKILL-452 | roadmap_management | Roadmap Management |
| SKILL-453 | role_design | Role Design |
| SKILL-454 | rollback_planning | Rollback Planning |
| SKILL-455 | root_cause_analysis | Root Cause Analysis |
| SKILL-456 | runbook_design | Runbook Design |
| SKILL-457 | runtime_architecture | Runtime Architecture |
| SKILL-458 | saas_governance | Saas Governance |
| SKILL-459 | sales_enablement | Sales Enablement |
| SKILL-460 | sales_forecasting | Sales Forecasting |
| SKILL-461 | sales_process | Sales Process |
| SKILL-462 | scalability_design | Scalability Design |
| SKILL-463 | scenario_modeling | Scenario Modeling |
| SKILL-464 | scenario_planning | Scenario Planning |
| SKILL-465 | scientific_foresight | Scientific Foresight |
| SKILL-466 | sdk_design | Sdk Design |
| SKILL-467 | secure_sdlc | Secure Sdlc |
| SKILL-468 | security_architecture | Security Architecture |
| SKILL-469 | security_audit | Security Audit |
| SKILL-470 | security_automation | Security Automation |
| SKILL-471 | security_control_testing | Security Control Testing |
| SKILL-472 | security_engineering | Security Engineering |
| SKILL-473 | security_governance | Security Governance |
| SKILL-474 | security_patterns | Security Patterns |
| SKILL-475 | security_policy | Security Policy |
| SKILL-476 | security_tooling | Security Tooling |
| SKILL-477 | semantic_search | Semantic Search |
| SKILL-478 | server_admin | Server Admin |
| SKILL-479 | server_ops | Server Ops |
| SKILL-480 | service_catalog | Service Catalog |
| SKILL-481 | service_design | Service Design |
| SKILL-482 | service_excellence | Service Excellence |
| SKILL-483 | service_frameworks | Service Frameworks |
| SKILL-484 | service_improvement | Service Improvement |
| SKILL-485 | shared_services | Shared Services |
| SKILL-486 | site_planning | Site Planning |
| SKILL-487 | site_reliability | Site Reliability |
| SKILL-488 | skill_design | Skill Design |
| SKILL-489 | skill_testing | Skill Testing |
| SKILL-490 | sla_management | Sla Management |
| SKILL-491 | soc_operations | Soc Operations |
| SKILL-492 | software_design | Software Design |
| SKILL-493 | software_licensing | Software Licensing |
| SKILL-494 | solution_architecture | Solution Architecture |
| SKILL-495 | solution_design | Solution Design |
| SKILL-496 | solution_implementation | Solution Implementation |
| SKILL-497 | sox_style_controls | Sox Style Controls |
| SKILL-498 | space_operations | Space Operations |
| SKILL-499 | spatial_computing | Spatial Computing |
| SKILL-500 | stakeholder_alignment | Stakeholder Alignment |
| SKILL-501 | statistical_modeling | Statistical Modeling |
| SKILL-502 | strategic_prioritization | Strategic Prioritization |
| SKILL-503 | strategic_sourcing | Strategic Sourcing |
| SKILL-504 | success_planning | Success Planning |
| SKILL-505 | succession_planning | Succession Planning |
| SKILL-506 | supplier_performance | Supplier Performance |
| SKILL-507 | supplier_security | Supplier Security |
| SKILL-508 | supplier_selection | Supplier Selection |
| SKILL-509 | supply_chain_security | Supply Chain Security |
| SKILL-510 | systems_administration | Systems Administration |
| SKILL-511 | systems_assurance | Systems Assurance |
| SKILL-512 | talent_pipeline | Talent Pipeline |
| SKILL-513 | talent_reviews | Talent Reviews |
| SKILL-514 | tax_compliance | Tax Compliance |
| SKILL-515 | tax_planning | Tax Planning |
| SKILL-516 | tax_research | Tax Research |
| SKILL-517 | technical_account_management | Technical Account Management |
| SKILL-518 | technical_discovery | Technical Discovery |
| SKILL-519 | technical_escalation | Technical Escalation |
| SKILL-520 | technical_experimentation | Technical Experimentation |
| SKILL-521 | technical_validation | Technical Validation |
| SKILL-522 | technical_writing | Technical Writing |
| SKILL-523 | technology_audit | Technology Audit |
| SKILL-524 | technology_forecasting | Technology Forecasting |
| SKILL-525 | technology_law | Technology Law |
| SKILL-526 | technology_scouting | Technology Scouting |
| SKILL-527 | technology_standards | Technology Standards |
| SKILL-528 | technology_transfer | Technology Transfer |
| SKILL-529 | territory_design | Territory Design |
| SKILL-530 | territory_management | Territory Management |
| SKILL-531 | test_automation | Test Automation |
| SKILL-532 | test_strategy | Test Strategy |
| SKILL-533 | third_party_risk | Third Party Risk |
| SKILL-534 | threat_hunting | Threat Hunting |
| SKILL-535 | threat_intelligence | Threat Intelligence |
| SKILL-536 | ticket_triage | Ticket Triage |
| SKILL-537 | token_economics | Token Economics |
| SKILL-538 | tool_contracts | Tool Contracts |
| SKILL-539 | tool_routing | Tool Routing |
| SKILL-540 | total_rewards | Total Rewards |
| SKILL-541 | trace_analysis | Trace Analysis |
| SKILL-542 | training_programs | Training Programs |
| SKILL-543 | transaction_support | Transaction Support |
| SKILL-544 | transformation_design | Transformation Design |
| SKILL-545 | treasury | Treasury |
| SKILL-546 | upsell_cross_sell | Upsell Cross Sell |
| SKILL-547 | usability_research | Usability Research |
| SKILL-548 | user_research | User Research |
| SKILL-549 | ux_strategy | Ux Strategy |
| SKILL-550 | valuation_support | Valuation Support |
| SKILL-551 | value_realization | Value Realization |
| SKILL-552 | variance_analysis | Variance Analysis |
| SKILL-553 | vector_databases | Vector Databases |
| SKILL-554 | vendor_assessment | Vendor Assessment |
| SKILL-555 | vendor_management | Vendor Management |
| SKILL-556 | vendor_payments | Vendor Payments |
| SKILL-557 | vendor_risk_coordination | Vendor Risk Coordination |
| SKILL-558 | venture_handoff | Venture Handoff |
| SKILL-559 | versioning | Versioning |
| SKILL-560 | voice_interfaces | Voice Interfaces |
| SKILL-561 | vulnerability_management | Vulnerability Management |
| SKILL-562 | workflow_automation | Workflow Automation |
| SKILL-563 | workforce_metrics | Workforce Metrics |
| SKILL-564 | workforce_planning | Workforce Planning |
| SKILL-565 | workforce_support | Workforce Support |
| SKILL-566 | workplace_investigations_coordination | Workplace Investigations Coordination |
| SKILL-567 | workplace_legal | Workplace Legal |
| SKILL-568 | workplace_services | Workplace Services |
| SKILL-569 | workplace_technology | Workplace Technology |
| SKILL-570 | zero_trust | Zero Trust |

Full skill contracts, purposes, required/optional inputs, output schemas, quality checks, failure conditions, escalation paths and memory policies are preserved in JSON. They do not prove executable tooling.

## Dependencies and integration inventory

### DEP-01 — `package.json`

Evidence: [E856: `package.json:1`](../package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |

Scripts: `{"dev": "pnpm --filter app dev", "build": "pnpm --filter app build", "test:router": "pnpm --filter @whink/org-kit test"}`

### DEP-02 — `apps/web/package.json`

Evidence: [E857: `apps/web/package.json:1`](../apps/web/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| dependencies | @anthropic-ai/sdk | ^0.129.0 |
| dependencies | @auth/prisma-adapter | 2.11.3 |
| dependencies | @aws-sdk/client-s3 | 3.1105.0 |
| dependencies | @aws-sdk/s3-request-presigner | 3.1105.0 |
| dependencies | @azure/storage-blob | 12.33.0 |
| dependencies | @floating-ui/react | 0.26.0 |
| dependencies | @google/generative-ai | ^0.24.1 |
| dependencies | @headlessui/react | 2.2.10 |
| dependencies | @hookform/resolvers | 3.9.0 |
| dependencies | @modelcontextprotocol/sdk | 1.32.0 |
| dependencies | @prisma/client | 6.7.0 |
| dependencies | @radix-ui/react-accordion | 1.2.0 |
| dependencies | @radix-ui/react-alert-dialog | 1.1.1 |
| dependencies | @radix-ui/react-aspect-ratio | 1.1.0 |
| dependencies | @radix-ui/react-avatar | 1.1.0 |
| dependencies | @radix-ui/react-checkbox | 1.1.1 |
| dependencies | @radix-ui/react-collapsible | 1.1.0 |
| dependencies | @radix-ui/react-context-menu | 2.2.1 |
| dependencies | @radix-ui/react-dialog | 1.1.1 |
| dependencies | @radix-ui/react-dropdown-menu | 2.1.1 |
| dependencies | @radix-ui/react-hover-card | 1.1.1 |
| dependencies | @radix-ui/react-label | 2.1.0 |
| dependencies | @radix-ui/react-menubar | 1.1.1 |
| dependencies | @radix-ui/react-navigation-menu | 1.2.0 |
| dependencies | @radix-ui/react-popover | 1.1.1 |
| dependencies | @radix-ui/react-progress | 1.1.0 |
| dependencies | @radix-ui/react-radio-group | 1.2.0 |
| dependencies | @radix-ui/react-scroll-area | 1.1.0 |
| dependencies | @radix-ui/react-select | 2.1.1 |
| dependencies | @radix-ui/react-separator | 1.1.0 |
| dependencies | @radix-ui/react-slider | 1.2.0 |
| dependencies | @radix-ui/react-slot | 1.1.0 |
| dependencies | @radix-ui/react-switch | 1.1.0 |
| dependencies | @radix-ui/react-tabs | 1.1.0 |
| dependencies | @radix-ui/react-toast | 1.2.1 |
| dependencies | @radix-ui/react-toggle | 1.1.0 |
| dependencies | @radix-ui/react-toggle-group | 1.1.0 |
| dependencies | @radix-ui/react-tooltip | 1.1.2 |
| dependencies | @simplewebauthn/browser | 14.0.0 |
| dependencies | @simplewebauthn/server | 14.0.3 |
| dependencies | @tanstack/react-query | 5.59.0 |
| dependencies | @whink/org-kit | workspace:* |
| dependencies | autoprefixer | 10.6.1 |
| dependencies | bcryptjs | 2.4.3 |
| dependencies | chart.js | 4.4.9 |
| dependencies | class-variance-authority | 0.7.0 |
| dependencies | clsx | 2.1.1 |
| dependencies | cmdk | 1.0.0 |
| dependencies | cookie | 1.0.2 |
| dependencies | csv | 6.3.11 |
| dependencies | date-fns | 4.0.0 |
| dependencies | dayjs | 1.11.13 |
| dependencies | dotenv | 16.5.0 |
| dependencies | embla-carousel-react | 8.3.0 |
| dependencies | formik | 2.4.5 |
| dependencies | framer-motion | 12.23.12 |
| dependencies | gray-matter | 4.0.3 |
| dependencies | input-otp | 1.2.4 |
| dependencies | jotai | 2.10.0 |
| dependencies | jsonwebtoken | 9.0.2 |
| dependencies | lucide-react | 0.446.0 |
| dependencies | mapbox-gl | 1.13.3 |
| dependencies | next | 16.4.3 |
| dependencies | next-auth | 5.0.0-beta.32 |
| dependencies | next-themes | 0.4.0 |
| dependencies | nodemailer | 10.2.1 |
| dependencies | react | 19.2.8 |
| dependencies | react-chartjs-2 | 5.3.0 |
| dependencies | react-datepicker | 6.1.0 |
| dependencies | react-day-picker | 8.10.1 |
| dependencies | react-dom | 19.2.8 |
| dependencies | react-hook-form | 7.53.0 |
| dependencies | react-hot-toast | 2.4.1 |
| dependencies | react-intersection-observer | 9.8.0 |
| dependencies | react-is | 19.2.8 |
| dependencies | react-resizable-panels | 2.1.3 |
| dependencies | react-select | 5.8.0 |
| dependencies | recharts | 2.15.3 |
| dependencies | sonner | 1.5.0 |
| dependencies | swr | 2.2.4 |
| dependencies | tailwind-scrollbar-hide | 1.1.7 |
| dependencies | three | 0.170.0 |
| dependencies | vaul | 1.0.0 |
| dependencies | webpack | 5.99.5 |
| dependencies | yup | 1.3.0 |
| dependencies | zod | 4.6.7 |
| dependencies | zustand | 5.0.3 |
| devDependencies | @next/swc-wasm-nodejs | 16.3.3 |
| devDependencies | @types/bcryptjs | 2.4.6 |
| devDependencies | @types/jsonwebtoken | 9.0.7 |
| devDependencies | @types/node | 22.0.0 |
| devDependencies | @types/nodemailer | ^8.0.2 |
| devDependencies | @types/react | 19.2.18 |
| devDependencies | @types/react-dom | 19.2.4 |
| devDependencies | @types/three | 0.170.0 |
| devDependencies | @typescript-eslint/eslint-plugin | 8.18.0 |
| devDependencies | @typescript-eslint/parser | 8.18.0 |
| devDependencies | @vitest/coverage-v8 | ^5.0.3 |
| devDependencies | eslint | 9.33.0 |
| devDependencies | eslint-config-next | 16.4.3 |
| devDependencies | eslint-plugin-prettier | 5.1.3 |
| devDependencies | eslint-plugin-react-hooks | 7.1.1 |
| devDependencies | postcss | 8.5.31 |
| devDependencies | prisma | 6.7.0 |
| devDependencies | tailwind-merge | 2.5.2 |
| devDependencies | tailwindcss | 3.4.0 |
| devDependencies | tailwindcss-animate | 1.0.7 |
| devDependencies | ts-node | 10.9.2 |
| devDependencies | tsx | 4.20.3 |
| devDependencies | typescript | 5.6.3 |
| devDependencies | vitest | ^5.0.3 |

Scripts: `{"dev": "next dev -H 127.0.0.1", "build": "next build", "start": "next start", "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "vitest run", "test:watch": "vitest", "memory:reembed": "tsx scripts/backfill-embeddings.ts", "security:scan": "tsx scripts/scan-secrets.ts", "board:import": "tsx scripts/import-board.ts", "worker": "tsx --require dotenv/config scripts/worker.ts"}`

### DEP-03 — `packages/org-kit/package.json`

Evidence: [E858: `packages/org-kit/package.json:1`](../packages/org-kit/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |

Scripts: `{"test": "ts-node src/router.ts"}`

### DEP-04 — `e2e/package.json`

Evidence: [E859: `e2e/package.json:1`](../e2e/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| devDependencies | @playwright/test | 1.64.1 |
| devDependencies | @types/node | 22.0.0 |
| devDependencies | typescript | 5.6.3 |

Scripts: `{"test": "playwright test", "install:browsers": "playwright install chromium"}`

### DEP-05 — `services/openclaw/package.json`

Evidence: [E860: `services/openclaw/package.json:1`](../services/openclaw/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| dependencies | @modelcontextprotocol/sdk | 1.32.0 |
| devDependencies | @types/node | 22.10.2 |
| devDependencies | typescript | 5.7.2 |
| devDependencies | vitest | 2.1.8 |

Scripts: `{"build": "tsc -p tsconfig.build.json", "start": "node dist/index.js", "test": "vitest run", "typecheck": "tsc --noEmit"}`

### DEP-06 — `services/openclaw/upstreams/ref/package.json`

Evidence: [E861: `services/openclaw/upstreams/ref/package.json:1`](../services/openclaw/upstreams/ref/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| dependencies | @modelcontextprotocol/server-everything | 2026.8.31 |

Scripts: `{}`

### DEP-07 — `services/openclaw/upstreams/social/package.json`

Evidence: [E862: `services/openclaw/upstreams/social/package.json:1`](../services/openclaw/upstreams/social/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| dependencies | @modelcontextprotocol/sdk | 1.32.0 |
| devDependencies | @types/node | 22.10.2 |
| devDependencies | typescript | 5.7.2 |

Scripts: `{"build": "tsc -p tsconfig.build.json", "typecheck": "tsc --noEmit"}`

### DEP-08 — `services/voice/package.json`

Evidence: [E863: `services/voice/package.json:1`](../services/voice/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| dependencies | @deepgram/sdk | ^3.9.0 |
| dependencies | express | ^4.21.1 |
| dependencies | multer | ^1.4.5-lts.1 |

Scripts: `{}`

### DEP-09 — `services/whink-content-analyst/package.json`

Evidence: [E864: `services/whink-content-analyst/package.json:1`](../services/whink-content-analyst/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |
| dependencies | @google/generative-ai | ^0.21.0 |

Scripts: `{"start": "node analyst.js", "analyze": "node analyst.js"}`

### DEP-10 — `services/whink-voice/package.json`

Evidence: [E865: `services/whink-voice/package.json:1`](../services/whink-voice/package.json#L1)

| Dependency class | Package | Declared version |
| --- | --- | --- |

Scripts: `{"start": "node server.js", "dev": "node server.js"}`

### Connector capability matrix

| Catalog ID | Name | Capabilities | Class | Assessment |
| --- | --- | --- | --- | --- |
| gmail | Gmail | email_read, email_send | C | No app adapter |
| google_calendar | Google Calendar | calendar_read, calendar_write | C | No app adapter; built-in calendar local |
| google_drive | Google Drive | files_read | C | No app adapter |
| slack | Slack | chat_read, chat_send | C | Requires separate MCP upstream |
| github | GitHub | repo_read, issue_write | C | Requires MCP upstream; separate direct change-request adapter exists |
| twilio | Twilio (SMS and voice) | sms_send, voice_call | C | SMS source implemented; catalog description stale; app calls stubbed |
| telegram | Telegram | telegram_send | C | Delivery stub |
| whatsapp | WhatsApp (Twilio) | whatsapp_send | C | Delivery stub |
| x | X | social_read, social_post | C | Provider calls implemented; authorization untested |
| instagram | Instagram | social_read, social_post | C | Upstream not_implemented |
| tiktok | TikTok | social_read, social_post | C | Upstream not_implemented; no DM tools |
| figma | Figma | design_read | C | Requires separate MCP upstream |
| notion | Notion | notes_read, notes_write | C | Requires separate MCP upstream |
| linear | Linear | issues_read, issues_write | C | Requires separate MCP upstream |
| stripe_readonly | Stripe (read only) | payments_read | C | Requires separate MCP upstream |
| ollama | Local Ollama | local_models, embeddings | A | Transport implemented; server/model availability untested |
| anythingllm | AnythingLLM | document_recall | C | Retrieval/upload implemented; external service untested |
| openclaw | OpenClaw MCP gateway | mcp_tools | C | Gateway implementation present; runtime untested |

## API, database and testing inventory

All entries below are source inventory, not test results.

| ID | API route | Methods | Source |
| --- | --- | --- | --- |
| API-001 | /api/approvals/[id]/decision | POST | apps/web/app/api/approvals/[id]/decision/route.ts |
| API-002 | /api/approvals/history/[id] | GET | apps/web/app/api/approvals/history/[id]/route.ts |
| API-003 | /api/approvals/history | GET | apps/web/app/api/approvals/history/route.ts |
| API-004 | /api/approvals | GET | apps/web/app/api/approvals/route.ts |
| API-005 | /api/auth/[...nextauth] |  | apps/web/app/api/auth/[...nextauth]/route.ts |
| API-006 | /api/auth/passkey/[id] | DELETE | apps/web/app/api/auth/passkey/[id]/route.ts |
| API-007 | /api/auth/passkey/login/options | POST | apps/web/app/api/auth/passkey/login/options/route.ts |
| API-008 | /api/auth/passkey/login/verify | POST | apps/web/app/api/auth/passkey/login/verify/route.ts |
| API-009 | /api/auth/passkey/register/options | POST | apps/web/app/api/auth/passkey/register/options/route.ts |
| API-010 | /api/auth/passkey/register/verify | POST | apps/web/app/api/auth/passkey/register/verify/route.ts |
| API-011 | /api/auth/passkey | GET | apps/web/app/api/auth/passkey/route.ts |
| API-012 | /api/auth/password/forgot | POST | apps/web/app/api/auth/password/forgot/route.ts |
| API-013 | /api/auth/password/reset | POST | apps/web/app/api/auth/password/reset/route.ts |
| API-014 | /api/billing/usage | GET | apps/web/app/api/billing/usage/route.ts |
| API-015 | /api/board/meetings/[id]/minutes | POST | apps/web/app/api/board/meetings/[id]/minutes/route.ts |
| API-016 | /api/board/meetings | GET, POST | apps/web/app/api/board/meetings/route.ts |
| API-017 | /api/board | GET | apps/web/app/api/board/route.ts |
| API-018 | /api/briefing/sms | POST | apps/web/app/api/briefing/sms/route.ts |
| API-019 | /api/change-requests/[id]/export | GET | apps/web/app/api/change-requests/[id]/export/route.ts |
| API-020 | /api/change-requests/[id]/refine | POST | apps/web/app/api/change-requests/[id]/refine/route.ts |
| API-021 | /api/change-requests/[id] | GET, PATCH | apps/web/app/api/change-requests/[id]/route.ts |
| API-022 | /api/change-requests/[id]/status | POST | apps/web/app/api/change-requests/[id]/status/route.ts |
| API-023 | /api/change-requests/[id]/submit | POST | apps/web/app/api/change-requests/[id]/submit/route.ts |
| API-024 | /api/change-requests | GET, POST | apps/web/app/api/change-requests/route.ts |
| API-025 | /api/connectors/[id]/install | POST, DELETE | apps/web/app/api/connectors/[id]/install/route.ts |
| API-026 | /api/connectors/[id] |  | apps/web/app/api/connectors/[id]/route.ts |
| API-027 | /api/connectors/manifest/validate | POST | apps/web/app/api/connectors/manifest/validate/route.ts |
| API-028 | /api/connectors | GET | apps/web/app/api/connectors/route.ts |
| API-029 | /api/contacts/[id]/call | POST | apps/web/app/api/contacts/[id]/call/route.ts |
| API-030 | /api/contacts/[id]/message | POST | apps/web/app/api/contacts/[id]/message/route.ts |
| API-031 | /api/contacts/[id] | PATCH, DELETE | apps/web/app/api/contacts/[id]/route.ts |
| API-032 | /api/contacts/import | POST | apps/web/app/api/contacts/import/route.ts |
| API-033 | /api/contacts | GET, POST | apps/web/app/api/contacts/route.ts |
| API-034 | /api/contracts/[id] | GET, PATCH, DELETE | apps/web/app/api/contracts/[id]/route.ts |
| API-035 | /api/contracts | GET, POST | apps/web/app/api/contracts/route.ts |
| API-036 | /api/conversations/[id]/messages | GET, POST | apps/web/app/api/conversations/[id]/messages/route.ts |
| API-037 | /api/conversations | GET, POST | apps/web/app/api/conversations/route.ts |
| API-038 | /api/documents/[id] | DELETE | apps/web/app/api/documents/[id]/route.ts |
| API-039 | /api/documents | GET | apps/web/app/api/documents/route.ts |
| API-040 | /api/documents/upload | POST | apps/web/app/api/documents/upload/route.ts |
| API-041 | /api/entities | GET, POST | apps/web/app/api/entities/route.ts |
| API-042 | /api/evaluations/run | GET, POST | apps/web/app/api/evaluations/run/route.ts |
| API-043 | /api/finance/summary | GET | apps/web/app/api/finance/summary/route.ts |
| API-044 | /api/gesture/key | GET | apps/web/app/api/gesture/key/route.ts |
| API-045 | /api/gesture | POST | apps/web/app/api/gesture/route.ts |
| API-046 | /api/gesture/stream | GET | apps/web/app/api/gesture/stream/route.ts |
| API-047 | /api/ledger | GET | apps/web/app/api/ledger/route.ts |
| API-048 | /api/ledger/search/facets | GET | apps/web/app/api/ledger/search/facets/route.ts |
| API-049 | /api/ledger/search | GET | apps/web/app/api/ledger/search/route.ts |
| API-050 | /api/meetings/quick-start | POST | apps/web/app/api/meetings/quick-start/route.ts |
| API-051 | /api/memory/[id] | PATCH, DELETE | apps/web/app/api/memory/[id]/route.ts |
| API-052 | /api/memory/correct | POST | apps/web/app/api/memory/correct/route.ts |
| API-053 | /api/memory | GET | apps/web/app/api/memory/route.ts |
| API-054 | /api/memory/search | GET | apps/web/app/api/memory/search/route.ts |
| API-055 | /api/memory/write | POST | apps/web/app/api/memory/write/route.ts |
| API-056 | /api/news | GET | apps/web/app/api/news/route.ts |
| API-057 | /api/notifications/preferences | GET, PUT | apps/web/app/api/notifications/preferences/route.ts |
| API-058 | /api/persona/state | GET | apps/web/app/api/persona/state/route.ts |
| API-059 | /api/persona/switch | POST | apps/web/app/api/persona/switch/route.ts |
| API-060 | /api/projects/[id]/context | GET | apps/web/app/api/projects/[id]/context/route.ts |
| API-061 | /api/projects/[id]/report | GET | apps/web/app/api/projects/[id]/report/route.ts |
| API-062 | /api/projects/[id] | GET, PUT, PATCH | apps/web/app/api/projects/[id]/route.ts |
| API-063 | /api/projects | GET, POST | apps/web/app/api/projects/route.ts |
| API-064 | /api/recommendations/[id]/dismiss | POST | apps/web/app/api/recommendations/[id]/dismiss/route.ts |
| API-065 | /api/recommendations | GET | apps/web/app/api/recommendations/route.ts |
| API-066 | /api/security/status | GET | apps/web/app/api/security/status/route.ts |
| API-067 | /api/settings/api-keys/[provider] | DELETE | apps/web/app/api/settings/api-keys/[provider]/route.ts |
| API-068 | /api/settings/api-keys | GET, POST | apps/web/app/api/settings/api-keys/route.ts |
| API-069 | /api/settings | GET, PATCH | apps/web/app/api/settings/route.ts |
| API-070 | /api/signup | POST | apps/web/app/api/signup/route.ts |
| API-071 | /api/signup/status | GET | apps/web/app/api/signup/status/route.ts |
| API-072 | /api/skills/[id] | GET, DELETE | apps/web/app/api/skills/[id]/route.ts |
| API-073 | /api/skills | GET, POST | apps/web/app/api/skills/route.ts |
| API-074 | /api/social/[platform]/callback | GET | apps/web/app/api/social/[platform]/callback/route.ts |
| API-075 | /api/social/[platform]/connect | POST | apps/web/app/api/social/[platform]/connect/route.ts |
| API-076 | /api/social/[platform]/connection | DELETE | apps/web/app/api/social/[platform]/connection/route.ts |
| API-077 | /api/social/connections | GET | apps/web/app/api/social/connections/route.ts |
| API-078 | /api/social/scheduled/[id] | DELETE, PATCH | apps/web/app/api/social/scheduled/[id]/route.ts |
| API-079 | /api/social/scheduled | GET | apps/web/app/api/social/scheduled/route.ts |
| API-080 | /api/subsidiaries/[id]/projects | GET | apps/web/app/api/subsidiaries/[id]/projects/route.ts |
| API-081 | /api/subsidiaries | GET | apps/web/app/api/subsidiaries/route.ts |
| API-082 | /api/swarm/[id]/cancel | POST | apps/web/app/api/swarm/[id]/cancel/route.ts |
| API-083 | /api/swarm/[id] | GET | apps/web/app/api/swarm/[id]/route.ts |
| API-084 | /api/swarm/[id]/start | POST | apps/web/app/api/swarm/[id]/start/route.ts |
| API-085 | /api/swarm | GET, POST | apps/web/app/api/swarm/route.ts |
| API-086 | /api/system/health | GET | apps/web/app/api/system/health/route.ts |
| API-087 | /api/tasks/[id] | PATCH | apps/web/app/api/tasks/[id]/route.ts |
| API-088 | /api/tasks | GET, POST | apps/web/app/api/tasks/route.ts |
| API-089 | /api/tenant/config | GET, PATCH | apps/web/app/api/tenant/config/route.ts |
| API-090 | /api/tools/execute | POST | apps/web/app/api/tools/execute/route.ts |
| API-091 | /api/usage/budget | PUT | apps/web/app/api/usage/budget/route.ts |
| API-092 | /api/usage | GET | apps/web/app/api/usage/route.ts |
| API-093 | /api/voice/stt | POST | apps/web/app/api/voice/stt/route.ts |
| API-094 | /api/voice/tts | POST | apps/web/app/api/voice/tts/route.ts |
| API-095 | /api/worker/status | GET | apps/web/app/api/worker/status/route.ts |

| ID | Database model | Evidence |
| --- | --- | --- |
| DB-01 | User | [E866: `apps/web/prisma/schema.prisma:14`](../apps/web/prisma/schema.prisma#L14) |
| DB-02 | Account | [E867: `apps/web/prisma/schema.prisma:67`](../apps/web/prisma/schema.prisma#L67) |
| DB-03 | Session | [E868: `apps/web/prisma/schema.prisma:86`](../apps/web/prisma/schema.prisma#L86) |
| DB-04 | VerificationToken | [E869: `apps/web/prisma/schema.prisma:95`](../apps/web/prisma/schema.prisma#L95) |
| DB-05 | UserProfile | [E870: `apps/web/prisma/schema.prisma:106`](../apps/web/prisma/schema.prisma#L106) |
| DB-06 | UserPreference | [E871: `apps/web/prisma/schema.prisma:123`](../apps/web/prisma/schema.prisma#L123) |
| DB-07 | UserApiKey | [E872: `apps/web/prisma/schema.prisma:142`](../apps/web/prisma/schema.prisma#L142) |
| DB-08 | PersonaState | [E873: `apps/web/prisma/schema.prisma:160`](../apps/web/prisma/schema.prisma#L160) |
| DB-09 | Conversation | [E874: `apps/web/prisma/schema.prisma:177`](../apps/web/prisma/schema.prisma#L177) |
| DB-10 | Message | [E875: `apps/web/prisma/schema.prisma:194`](../apps/web/prisma/schema.prisma#L194) |
| DB-11 | Project | [E876: `apps/web/prisma/schema.prisma:214`](../apps/web/prisma/schema.prisma#L214) |
| DB-12 | ProjectMember | [E877: `apps/web/prisma/schema.prisma:244`](../apps/web/prisma/schema.prisma#L244) |
| DB-13 | ProjectTask | [E878: `apps/web/prisma/schema.prisma:258`](../apps/web/prisma/schema.prisma#L258) |
| DB-14 | ProjectMilestone | [E879: `apps/web/prisma/schema.prisma:279`](../apps/web/prisma/schema.prisma#L279) |
| DB-15 | ProjectDecision | [E880: `apps/web/prisma/schema.prisma:294`](../apps/web/prisma/schema.prisma#L294) |
| DB-16 | ProjectRisk | [E881: `apps/web/prisma/schema.prisma:309`](../apps/web/prisma/schema.prisma#L309) |
| DB-17 | ProjectOpenQuestion | [E882: `apps/web/prisma/schema.prisma:325`](../apps/web/prisma/schema.prisma#L325) |
| DB-18 | MemoryEpisode | [E883: `apps/web/prisma/schema.prisma:343`](../apps/web/prisma/schema.prisma#L343) |
| DB-19 | MemorySemantic | [E884: `apps/web/prisma/schema.prisma:369`](../apps/web/prisma/schema.prisma#L369) |
| DB-20 | MemoryDailyCap | [E885: `apps/web/prisma/schema.prisma:399`](../apps/web/prisma/schema.prisma#L399) |
| DB-21 | MemoryProcedural | [E886: `apps/web/prisma/schema.prisma:412`](../apps/web/prisma/schema.prisma#L412) |
| DB-22 | Hypothesis | [E887: `apps/web/prisma/schema.prisma:428`](../apps/web/prisma/schema.prisma#L428) |
| DB-23 | EntityNode | [E888: `apps/web/prisma/schema.prisma:450`](../apps/web/prisma/schema.prisma#L450) |
| DB-24 | EntityAlias | [E889: `apps/web/prisma/schema.prisma:469`](../apps/web/prisma/schema.prisma#L469) |
| DB-25 | EntityEdge | [E890: `apps/web/prisma/schema.prisma:480`](../apps/web/prisma/schema.prisma#L480) |
| DB-26 | Tool | [E891: `apps/web/prisma/schema.prisma:503`](../apps/web/prisma/schema.prisma#L503) |
| DB-27 | ExecutionPlan | [E892: `apps/web/prisma/schema.prisma:521`](../apps/web/prisma/schema.prisma#L521) |
| DB-28 | PlanStep | [E893: `apps/web/prisma/schema.prisma:537`](../apps/web/prisma/schema.prisma#L537) |
| DB-29 | Action | [E894: `apps/web/prisma/schema.prisma:560`](../apps/web/prisma/schema.prisma#L560) |
| DB-30 | Permission | [E895: `apps/web/prisma/schema.prisma:590`](../apps/web/prisma/schema.prisma#L590) |
| DB-31 | Delegation | [E896: `apps/web/prisma/schema.prisma:604`](../apps/web/prisma/schema.prisma#L604) |
| DB-32 | TenantConfig | [E897: `apps/web/prisma/schema.prisma:622`](../apps/web/prisma/schema.prisma#L622) |
| DB-33 | EvaluationScenario | [E898: `apps/web/prisma/schema.prisma:639`](../apps/web/prisma/schema.prisma#L639) |
| DB-34 | EvaluationRun | [E899: `apps/web/prisma/schema.prisma:653`](../apps/web/prisma/schema.prisma#L653) |
| DB-35 | CalendarEvent | [E900: `apps/web/prisma/schema.prisma:669`](../apps/web/prisma/schema.prisma#L669) |
| DB-36 | Note | [E901: `apps/web/prisma/schema.prisma:688`](../apps/web/prisma/schema.prisma#L688) |
| DB-37 | WorkingMemory | [E902: `apps/web/prisma/schema.prisma:705`](../apps/web/prisma/schema.prisma#L705) |
| DB-38 | TaskHandoff | [E903: `apps/web/prisma/schema.prisma:721`](../apps/web/prisma/schema.prisma#L721) |
| DB-39 | DocumentWorkspace | [E904: `apps/web/prisma/schema.prisma:740`](../apps/web/prisma/schema.prisma#L740) |
| DB-40 | Document | [E905: `apps/web/prisma/schema.prisma:756`](../apps/web/prisma/schema.prisma#L756) |
| DB-41 | AgentKnowledge | [E906: `apps/web/prisma/schema.prisma:777`](../apps/web/prisma/schema.prisma#L777) |
| DB-42 | ApprovalRequest | [E907: `apps/web/prisma/schema.prisma:798`](../apps/web/prisma/schema.prisma#L798) |
| DB-43 | SocialConnection | [E908: `apps/web/prisma/schema.prisma:824`](../apps/web/prisma/schema.prisma#L824) |
| DB-44 | OAuthState | [E909: `apps/web/prisma/schema.prisma:846`](../apps/web/prisma/schema.prisma#L846) |
| DB-45 | ScheduledPost | [E910: `apps/web/prisma/schema.prisma:865`](../apps/web/prisma/schema.prisma#L865) |
| DB-46 | NotificationPreference | [E911: `apps/web/prisma/schema.prisma:892`](../apps/web/prisma/schema.prisma#L892) |
| DB-47 | BoardMeeting | [E912: `apps/web/prisma/schema.prisma:914`](../apps/web/prisma/schema.prisma#L914) |
| DB-48 | ConnectorInstall | [E913: `apps/web/prisma/schema.prisma:935`](../apps/web/prisma/schema.prisma#L935) |
| DB-49 | UsageEvent | [E914: `apps/web/prisma/schema.prisma:952`](../apps/web/prisma/schema.prisma#L952) |
| DB-50 | Contact | [E915: `apps/web/prisma/schema.prisma:971`](../apps/web/prisma/schema.prisma#L971) |
| DB-51 | CommsRequest | [E916: `apps/web/prisma/schema.prisma:993`](../apps/web/prisma/schema.prisma#L993) |
| DB-52 | ChangeRequest | [E917: `apps/web/prisma/schema.prisma:1012`](../apps/web/prisma/schema.prisma#L1012) |
| DB-53 | Contract | [E918: `apps/web/prisma/schema.prisma:1033`](../apps/web/prisma/schema.prisma#L1033) |
| DB-54 | SkillSubmission | [E919: `apps/web/prisma/schema.prisma:1064`](../apps/web/prisma/schema.prisma#L1064) |
| DB-55 | PasskeyCredential | [E920: `apps/web/prisma/schema.prisma:1092`](../apps/web/prisma/schema.prisma#L1092) |
| DB-56 | PasskeyChallenge | [E921: `apps/web/prisma/schema.prisma:1111`](../apps/web/prisma/schema.prisma#L1111) |
| DB-57 | AgentJob | [E922: `apps/web/prisma/schema.prisma:1132`](../apps/web/prisma/schema.prisma#L1132) |
| DB-58 | AgentHeartbeat | [E923: `apps/web/prisma/schema.prisma:1155`](../apps/web/prisma/schema.prisma#L1155) |
| DB-59 | NewsSeen | [E924: `apps/web/prisma/schema.prisma:1165`](../apps/web/prisma/schema.prisma#L1165) |
| DB-60 | Recommendation | [E925: `apps/web/prisma/schema.prisma:1179`](../apps/web/prisma/schema.prisma#L1179) |
| DB-61 | SwarmRun | [E926: `apps/web/prisma/schema.prisma:1201`](../apps/web/prisma/schema.prisma#L1201) |
| DB-62 | SwarmTask | [E927: `apps/web/prisma/schema.prisma:1231`](../apps/web/prisma/schema.prisma#L1231) |
| DB-63 | SwarmClaim | [E928: `apps/web/prisma/schema.prisma:1267`](../apps/web/prisma/schema.prisma#L1267) |
| DB-64 | SwarmLearning | [E929: `apps/web/prisma/schema.prisma:1283`](../apps/web/prisma/schema.prisma#L1283) |
| DB-65 | RateLimitBucket | [E930: `apps/web/prisma/schema.prisma:1306`](../apps/web/prisma/schema.prisma#L1306) |
| DB-66 | PasswordResetToken | [E931: `apps/web/prisma/schema.prisma:1318`](../apps/web/prisma/schema.prisma#L1318) |

### Migration files

- `apps/web/prisma/migrations/20261002045845_init/migration.sql`
- `apps/web/prisma/migrations/20261002083522_add_embeddings/migration.sql`
- `apps/web/prisma/migrations/20261002120000_add_tenant_config/migration.sql`
- `apps/web/prisma/migrations/20261002140000_add_calendar_notes/migration.sql`
- `apps/web/prisma/migrations/20261002160000_add_agent_knowledge/migration.sql`
- `apps/web/prisma/migrations/20261002170000_agent_knowledge_tenant/migration.sql`
- `apps/web/prisma/migrations/20261002180000_add_working_memory/migration.sql`
- `apps/web/prisma/migrations/20261002190000_add_task_handoff/migration.sql`
- `apps/web/prisma/migrations/20261002200000_add_search_vectors/migration.sql`
- `apps/web/prisma/migrations/20261002201000_task_handoff_userid/migration.sql`
- `apps/web/prisma/migrations/20261002210000_add_memory_scope/migration.sql`
- `apps/web/prisma/migrations/20261002220000_add_action_postmortem/migration.sql`
- `apps/web/prisma/migrations/20261002230000_add_memory_bitemporalfields/migration.sql`
- `apps/web/prisma/migrations/20261002240000_add_document_workspaces/migration.sql`
- `apps/web/prisma/migrations/20261003000000_mamba_obsidian_only/migration.sql`
- `apps/web/prisma/migrations/20261003120000_approval_requests/migration.sql`
- `apps/web/prisma/migrations/20261003180000_social/migration.sql`
- `apps/web/prisma/migrations/20261003190000_byok_and_preferred_model/migration.sql`
- `apps/web/prisma/migrations/20261003200000_scheduled_post_platform_user/migration.sql`
- `apps/web/prisma/migrations/20261009000000_add_anythingllm_workspace/migration.sql`
- `apps/web/prisma/migrations/20261025000000_phase3a_embeddings/migration.sql`
- `apps/web/prisma/migrations/20261025010000_phase3c_anythingllm/migration.sql`
- `apps/web/prisma/migrations/20261025020000_auto_memory_provenance/migration.sql`
- `apps/web/prisma/migrations/20261025030000_add_document_model_workspace_unique/migration.sql`
- `apps/web/prisma/migrations/20261025040000_add_notification_prefs/migration.sql`
- `apps/web/prisma/migrations/20261025050000_board_connectors_usage_contacts/migration.sql`
- `apps/web/prisma/migrations/20261026000000_project_subsidiary/migration.sql`
- `apps/web/prisma/migrations/20261027000100_rate_limit_buckets/migration.sql`
- `apps/web/prisma/migrations/20261027000200_passkeys/migration.sql`
- `apps/web/prisma/migrations/20261027000300_skill_submissions/migration.sql`
- `apps/web/prisma/migrations/20261027000400_agent_jobs_recommendations/migration.sql`
- `apps/web/prisma/migrations/20261027000500_swarm/migration.sql`
- `apps/web/prisma/migrations/20261027000600_change_requests_contracts/migration.sql`
- `apps/web/prisma/migrations/20261027000800_email_lowercase/migration.sql`
- `apps/web/prisma/migrations/20261027000801_session_version/migration.sql`
- `apps/web/prisma/migrations/20261027001000_password_reset_tokens/migration.sql`
- `apps/web/prisma/migrations/20261027013000_social_consent_audit/migration.sql`

### Existing test files

- `apps/web/lib/__tests__/agent-memory.test.ts`
- `apps/web/lib/__tests__/agent-registry.test.ts`
- `apps/web/lib/__tests__/agent-validator-runtime.test.ts`
- `apps/web/lib/__tests__/anythingllm-client.test.ts`
- `apps/web/lib/__tests__/approval-chat.test.ts`
- `apps/web/lib/__tests__/approval-state.test.ts`
- `apps/web/lib/__tests__/approvals-no-late-approval.test.ts`
- `apps/web/lib/__tests__/approvals-routes.test.ts`
- `apps/web/lib/__tests__/approvals.integration.test.ts`
- `apps/web/lib/__tests__/approvals.test.ts`
- `apps/web/lib/__tests__/auto-memory.test.ts`
- `apps/web/lib/__tests__/autonomy-approval-ui.test.ts`
- `apps/web/lib/__tests__/autonomy-approval.test.ts`
- `apps/web/lib/__tests__/avatar-engine.test.ts`
- `apps/web/lib/__tests__/avatar-renderer.test.ts`
- `apps/web/lib/__tests__/board-meetings.test.ts`
- `apps/web/lib/__tests__/board.test.ts`
- `apps/web/lib/__tests__/briefing-sms-route.test.ts`
- `apps/web/lib/__tests__/byok-api.test.ts`
- `apps/web/lib/__tests__/canonical-json.test.ts`
- `apps/web/lib/__tests__/capabilities.test.ts`
- `apps/web/lib/__tests__/change-requests.test.ts`
- `apps/web/lib/__tests__/connectors.test.ts`
- `apps/web/lib/__tests__/contacts-tool-registry.test.ts`
- `apps/web/lib/__tests__/contacts.test.ts`
- `apps/web/lib/__tests__/content-isolation-filter.test.ts`
- `apps/web/lib/__tests__/context-engine.test.ts`
- `apps/web/lib/__tests__/contracts-finance-meetings.test.ts`
- `apps/web/lib/__tests__/conversation-helpers.test.ts`
- `apps/web/lib/__tests__/csp.test.ts`
- `apps/web/lib/__tests__/csrf.test.ts`
- `apps/web/lib/__tests__/dev-preview.test.ts`
- `apps/web/lib/__tests__/document-search.test.ts`
- `apps/web/lib/__tests__/embedding-service.test.ts`
- `apps/web/lib/__tests__/evaluations-tenant-isolation.test.ts`
- `apps/web/lib/__tests__/gateway-acceptance.test.ts`
- `apps/web/lib/__tests__/gateway-chat.test.ts`
- `apps/web/lib/__tests__/gateway-security.test.ts`
- `apps/web/lib/__tests__/gesture-bridge.test.ts`
- `apps/web/lib/__tests__/gesture-dispatch.test.ts`
- `apps/web/lib/__tests__/gesture-latency.test.ts`
- `apps/web/lib/__tests__/gesture-recognition.test.ts`
- `apps/web/lib/__tests__/gesture-route.test.ts`
- `apps/web/lib/__tests__/gesture-security.test.ts`
- `apps/web/lib/__tests__/history-search-health.test.ts`
- `apps/web/lib/__tests__/holo-rendering.test.ts`
- `apps/web/lib/__tests__/html-text.test.ts`
- `apps/web/lib/__tests__/key-encryption.test.ts`
- `apps/web/lib/__tests__/ledger.test.ts`
- `apps/web/lib/__tests__/local-only-router.test.ts`
- `apps/web/lib/__tests__/local-only-surfaces.test.ts`
- `apps/web/lib/__tests__/mail-routing.test.ts`
- `apps/web/lib/__tests__/mamba-mode.test.ts`
- `apps/web/lib/__tests__/mamba-obsidian-lawful.test.ts`
- `apps/web/lib/__tests__/memory-engine-search.test.ts`
- `apps/web/lib/__tests__/memory-engine.test.ts`
- `apps/web/lib/__tests__/memory-hybrid.test.ts`
- `apps/web/lib/__tests__/messages-route-external-taint.test.ts`
- `apps/web/lib/__tests__/messages-route-injection.test.ts`
- `apps/web/lib/__tests__/messages-route-model-policy.test.ts`
- `apps/web/lib/__tests__/messages-route-taint-propagation.test.ts`
- `apps/web/lib/__tests__/model-policy.test.ts`
- `apps/web/lib/__tests__/model-router-ollama-native.test.ts`
- `apps/web/lib/__tests__/model-router-tools-secrets.test.ts`
- `apps/web/lib/__tests__/model-router.test.ts`
- `apps/web/lib/__tests__/new-routes-auth.test.ts`
- `apps/web/lib/__tests__/news-lib.test.ts`
- `apps/web/lib/__tests__/next-config-headers.test.ts`
- `apps/web/lib/__tests__/openclaw-boundary.test.ts`
- `apps/web/lib/__tests__/openclaw-client.test.ts`
- `apps/web/lib/__tests__/openclaw-credential.test.ts`
- `apps/web/lib/__tests__/orchestrator-injection.test.ts`
- `apps/web/lib/__tests__/owner.test.ts`
- `apps/web/lib/__tests__/passkeys.test.ts`
- `apps/web/lib/__tests__/password-reset.test.ts`
- `apps/web/lib/__tests__/permission-engine.test.ts`
- `apps/web/lib/__tests__/phase3a-embedding.test.ts`
- `apps/web/lib/__tests__/project-access.test.ts`
- `apps/web/lib/__tests__/project-ownership.test.ts`
- `apps/web/lib/__tests__/protected-actions.test.ts`
- `apps/web/lib/__tests__/protected-approvals.test.ts`
- `apps/web/lib/__tests__/protected-permission.test.ts`
- `apps/web/lib/__tests__/protected-prompt.test.ts`
- `apps/web/lib/__tests__/protected-review.test.ts`
- `apps/web/lib/__tests__/protected-taint-route.test.ts`
- `apps/web/lib/__tests__/proxy-public-paths.test.ts`
- `apps/web/lib/__tests__/rate-limit-postgres.test.ts`
- `apps/web/lib/__tests__/rate-limit.test.ts`
- `apps/web/lib/__tests__/recommendations-routes.test.ts`
- `apps/web/lib/__tests__/review-fixes-routes.test.ts`
- `apps/web/lib/__tests__/secret-scan.test.ts`
- `apps/web/lib/__tests__/security-hardening-routes.test.ts`
- `apps/web/lib/__tests__/security-headers.test.ts`
- `apps/web/lib/__tests__/security-status.test.ts`
- `apps/web/lib/__tests__/signup-disabled.test.ts`
- `apps/web/lib/__tests__/signup-gateway.test.ts`
- `apps/web/lib/__tests__/skills-pipeline.test.ts`
- `apps/web/lib/__tests__/skills-recall-taint.test.ts`
- `apps/web/lib/__tests__/sms-briefing-approval.test.ts`
- `apps/web/lib/__tests__/sms-briefing.test.ts`
- `apps/web/lib/__tests__/sms-send.test.ts`
- `apps/web/lib/__tests__/social-d11-disconnect.test.ts`
- `apps/web/lib/__tests__/social-d3-sse.test.ts`
- `apps/web/lib/__tests__/social-d6-write-tools.test.ts`
- `apps/web/lib/__tests__/social-d9-deps.test.ts`
- `apps/web/lib/__tests__/social-hardening.test.ts`
- `apps/web/lib/__tests__/social-schedule-input.test.ts`
- `apps/web/lib/__tests__/social-tools.test.ts`
- `apps/web/lib/__tests__/social-ui.test.ts`
- `apps/web/lib/__tests__/social.integration.test.ts`
- `apps/web/lib/__tests__/spoken-approval.test.ts`
- `apps/web/lib/__tests__/staff-directory.test.ts`
- `apps/web/lib/__tests__/standing-roster.test.ts`
- `apps/web/lib/__tests__/subsidiaries-config.test.ts`
- `apps/web/lib/__tests__/subsidiaries-routes.test.ts`
- `apps/web/lib/__tests__/swarm-routes.test.ts`
- `apps/web/lib/__tests__/swarm.test.ts`
- `apps/web/lib/__tests__/taint-persistence.test.ts`
- `apps/web/lib/__tests__/task-handoff.test.ts`
- `apps/web/lib/__tests__/tenant-config.test.ts`
- `apps/web/lib/__tests__/tool-classes-config.test.ts`
- `apps/web/lib/__tests__/tool-definition.test.ts`
- `apps/web/lib/__tests__/tool-loop-guards.test.ts`
- `apps/web/lib/__tests__/tool-loop-providers.test.ts`
- `apps/web/lib/__tests__/tool-loop-taint.test.ts`
- `apps/web/lib/__tests__/tool-loop-usage-offline.test.ts`
- `apps/web/lib/__tests__/tool-loop.test.ts`
- `apps/web/lib/__tests__/tool-registry-execute.test.ts`
- `apps/web/lib/__tests__/tool-registry-openclaw.test.ts`
- `apps/web/lib/__tests__/usage-budget-offline.test.ts`
- `apps/web/lib/__tests__/voice-routes.test.ts`
- `apps/web/lib/__tests__/worker-jobs.test.ts`
- `apps/web/lib/__tests__/worker-scheduler.test.ts`
- `apps/web/lib/__tests__/working-memory.test.ts`
- `apps/web/lib/__tests__/workspace-git.test.ts`
- `apps/web/lib/__tests__/workspace-redact.test.ts`
- `apps/web/lib/__tests__/workspace-registry.test.ts`
- `apps/web/lib/__tests__/workspace-review2.test.ts`
- `apps/web/lib/__tests__/workspace-sandbox.test.ts`
- `services/openclaw/test/acceptance-2c.test.ts`
- `services/openclaw/test/config.test.ts`
- `services/openclaw/test/gateway.test.ts`
- `services/openclaw/test/meta-forwarding.test.ts`
- `services/openclaw/test/namespace.test.ts`
- `services/openclaw/upstreams/social/test/social.test.ts`
- `e2e/tests/approvals.spec.ts`
- `e2e/tests/auth.spec.ts`
- `e2e/tests/board.spec.ts`
- `e2e/tests/hardening.spec.ts`
- `e2e/tests/projects.spec.ts`
- `e2e/tests/public.spec.ts`

CI config specifies frozen install, Prisma generation, typecheck, lint, real pgvector migrations/seed, unit tests, build and Playwright. Security workflow specifies production audit, Gitleaks and CodeQL. No checks were run in this audit. Historical HANDOFF reports must not be presented as current-commit results.

## Missing capabilities, architectural conflicts and risks

### GAP-001 — P0 — Unified emergency containment absent

**Type:** gap. **Components:** SEC-003, AUTO-003, AUTO-004.

No durable organization-wide stop and recovery control across all execution/egress paths. Run cancellation and local-only config do not substitute.

Recommendation: Implement durable containment state, central enforcement, credential revocation hooks and owner-authorized recovery.

Evidence: [E082: `apps/web/lib/swarm/service.ts:1`](../apps/web/lib/swarm/service.ts#L1); [E083: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E084: `apps/web/lib/swarm/agent-call.ts:1`](../apps/web/lib/swarm/agent-call.ts#L1); [E085: `apps/web/lib/swarm/finalize.ts:1`](../apps/web/lib/swarm/finalize.ts#L1); [E086: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1); [E087: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E088: `apps/web/lib/worker/roster.ts:1`](../apps/web/lib/worker/roster.ts#L1); [E089: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1); [E090: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E091: `apps/web/scripts/worker.ts:1`](../apps/web/scripts/worker.ts#L1); [E137: `apps/web/lib/swarm/service.ts:1`](../apps/web/lib/swarm/service.ts#L1); [E138: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E139: `apps/web/lib/local-only.ts:1`](../apps/web/lib/local-only.ts#L1); [E140: `apps/web/lib/security-status.ts:1`](../apps/web/lib/security-status.ts#L1)

### RISK-001 — P0 — Standalone paid-call service outside governance

**Type:** security_risk. **Components:** INT-004, GOV-001.

Bland.ai webhook authorizes through its own secret, without shared approvals/ledger, and logs full phone/provider data. Not a demonstrated exploit.

Recommendation: Route paid calls through approved request IDs and shared ledger; redact personal data.

Evidence: [E114: `apps/web/lib/permission-engine.ts:1`](../apps/web/lib/permission-engine.ts#L1); [E115: `apps/web/lib/protected-actions.ts:1`](../apps/web/lib/protected-actions.ts#L1); [E116: `apps/web/lib/guarded-action.ts:1`](../apps/web/lib/guarded-action.ts#L1); [E179: `services/voice/server.js:1`](../services/voice/server.js#L1); [E180: `services/voice/docker-compose.yml:1`](../services/voice/docker-compose.yml#L1); [E181: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1); [E182: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1)

### GAP-002 — P0 — Founder confidential-intelligence boundary absent

**Type:** gap. **Components:** PRIV-001, PRIV-002.

Normal tenant scoping does not implement Marcus-only founder intelligence or classified project compartments; global curated lessons need publication controls.

Recommendation: Define classification, compartment ACLs, explicit sharing, declassification and privacy tests.

Evidence: [E108: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E109: `apps/web/lib/project-access.ts:1`](../apps/web/lib/project-access.ts#L1); [E110: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1); [E111: `apps/web/lib/agent-memory.ts:1`](../apps/web/lib/agent-memory.ts#L1); [E112: `apps/web/lib/project-access.ts:1`](../apps/web/lib/project-access.ts#L1); [E113: `apps/web/lib/context-engine.ts:1`](../apps/web/lib/context-engine.ts#L1)

### CONFLICT-001 — P1 — Fragmented 16-directorate claim

**Type:** architectural_conflict. **Components:** ORG-001, ORG-002, UI-002.

Canonical org-kit has 15; Innovation & Opportunity is separate. Directory has seven entries. No unified graph for board, subsidiaries, workforce and permissions.

Recommendation: Unify registries using stable entity IDs and validated reporting edges.

Evidence: [E033: `packages/org-kit/organization/whink_group_leadership.json:1`](../packages/org-kit/organization/whink_group_leadership.json#L1); [E034: `packages/org-kit/organization/team_registry.json:1`](../packages/org-kit/organization/team_registry.json#L1); [E035: `packages/org-kit/organization/workforce_registry.json:1`](../packages/org-kit/organization/workforce_registry.json#L1); [E036: `packages/org-kit/manifest.json:1`](../packages/org-kit/manifest.json#L1); [E037: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E038: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E039: `CLAUDE.md:85`](../CLAUDE.md#L85); [E155: `apps/web/app/dashboard/directory/page.tsx:1`](../apps/web/app/dashboard/directory/page.tsx#L1); [E156: `apps/web/components/screens/directory/directory-screen.tsx:1`](../apps/web/components/screens/directory/directory-screen.tsx#L1); [E157: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1)

### CONFLICT-002 — P1 — Executive identities and titles conflict

**Type:** architectural_conflict. **Components:** EXEC-001, EXEC-002, EXEC-003, ORG-002.

WHINK CEO vs Chief of Staff/MD; MAMBA peer Consigliere vs subsystem/COO; Marcus is marked human, not AI; Amara innovation vs Dr. Amara Data & AI needs disambiguation.

Recommendation: Confirm authoritative identities and titles; separate human, persona and runtime identities.

Evidence: [E037: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E038: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E039: `CLAUDE.md:85`](../CLAUDE.md#L85); [E049: `apps/web/prompts/persona-whink.ts:1`](../apps/web/prompts/persona-whink.ts#L1); [E050: `apps/web/prompts/build-prompt.ts:1`](../apps/web/prompts/build-prompt.ts#L1); [E051: `apps/web/lib/orchestrator.ts:1`](../apps/web/lib/orchestrator.ts#L1); [E052: `apps/web/config/board.json:1`](../apps/web/config/board.json#L1); [E053: `apps/web/prompts/persona-mamba.ts:1`](../apps/web/prompts/persona-mamba.ts#L1); [E054: `apps/web/prompts/mamba-modes.ts:1`](../apps/web/prompts/mamba-modes.ts#L1); [E055: `apps/web/app/api/persona/switch/route.ts:1`](../apps/web/app/api/persona/switch/route.ts#L1); [E056: `apps/web/lib/types.ts:1`](../apps/web/lib/types.ts#L1); [E057: `apps/web/lib/staff-directory.ts:1`](../apps/web/lib/staff-directory.ts#L1); [E058: `apps/web/config/board.json:1`](../apps/web/config/board.json#L1); [E059: `apps/web/components/screens/meeting/props.ts:1`](../apps/web/components/screens/meeting/props.ts#L1); [E060: `apps/web/lib/meetings/provider.ts:1`](../apps/web/lib/meetings/provider.ts#L1)

### GAP-003 — P1 — Kill Team assignment is browser state

**Type:** gap. **Components:** KILL-001, KILL-002, KILL-003.

Assignment neither persists nor dispatches. Five named specialists plus sixth registration card. No Marcus hierarchy; primary five switches lack founder-only enforcement.

Recommendation: Implement persisted authorized objective/task workflow and define specialist role/access policy.

Evidence: [E064: `apps/web/prompts/persona-peter.ts:1`](../apps/web/prompts/persona-peter.ts#L1); [E065: `apps/web/prompts/persona-paul.ts:1`](../apps/web/prompts/persona-paul.ts#L1); [E066: `apps/web/prompts/persona-micah.ts:1`](../apps/web/prompts/persona-micah.ts#L1); [E067: `apps/web/prompts/persona-nandi.ts:1`](../apps/web/prompts/persona-nandi.ts#L1); [E068: `apps/web/prompts/persona-scout.ts:1`](../apps/web/prompts/persona-scout.ts#L1); [E069: `apps/web/prompts/build-prompt.ts:1`](../apps/web/prompts/build-prompt.ts#L1); [E070: `apps/web/components/screens/kill-team/kill-team-screen.tsx:27`](../apps/web/components/screens/kill-team/kill-team-screen.tsx#L27); [E071: `apps/web/app/dashboard/kill-team/page.tsx:1`](../apps/web/app/dashboard/kill-team/page.tsx#L1); [E072: `apps/web/app/api/persona/switch/route.ts:1`](../apps/web/app/api/persona/switch/route.ts#L1); [E073: `apps/web/prompts/persona-registration.ts:1`](../apps/web/prompts/persona-registration.ts#L1); [E074: `apps/web/app/api/persona/switch/route.ts:1`](../apps/web/app/api/persona/switch/route.ts#L1)

### GAP-004 — P1 — Generic EAR approval is not worker dispatch

**Type:** gap. **Components:** AUTO-001, AUTO-003.

EAR completion returns dispatch text; separate swarm does actual model execution. EXECUTED approval is not completed work.

Recommendation: Separate authorization/execution lifecycle and connect approved work to persistent jobs/results.

Evidence: [E075: `apps/web/lib/task-gate.ts:1`](../apps/web/lib/task-gate.ts#L1); [E076: `packages/org-kit/src/router.ts:1`](../packages/org-kit/src/router.ts#L1); [E077: `apps/web/lib/approvals.ts:85`](../apps/web/lib/approvals.ts#L85); [E082: `apps/web/lib/swarm/service.ts:1`](../apps/web/lib/swarm/service.ts#L1); [E083: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E084: `apps/web/lib/swarm/agent-call.ts:1`](../apps/web/lib/swarm/agent-call.ts#L1); [E085: `apps/web/lib/swarm/finalize.ts:1`](../apps/web/lib/swarm/finalize.ts#L1); [E086: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1)

### GAP-005 — P1 — HOLO simulated agent telemetry

**Type:** gap. **Components:** UI-001.

Agent fixture ticks are mixed with actual ledger/approval reads. UI activity is not operational proof.

Recommendation: Connect telemetry to registry/jobs/swarm status; visibly label fixtures until replaced.

Evidence: [E152: `apps/web/components/holo/holo-surface.tsx:109`](../apps/web/components/holo/holo-surface.tsx#L109); [E153: `apps/web/components/holo/holo-fixtures.ts:1`](../apps/web/components/holo/holo-fixtures.ts#L1); [E154: `apps/web/components/holo/holo-orb-field.tsx:1`](../apps/web/components/holo/holo-orb-field.tsx#L1)

### GAP-006 — P1 — Agent lifecycle workflows missing

**Type:** gap. **Components:** AUTO-005, ORG-004.

No recruitment/provisioning/promotion/retirement/reinstatement APIs; reference router differs from other suspended/retired filters.

Recommendation: Implement explicit lifecycle transitions, audit and uniform routability checks.

Evidence: [E042: `packages/org-kit/organization/workforce_registry.json:1`](../packages/org-kit/organization/workforce_registry.json#L1); [E043: `packages/org-kit/agents/AGENT_SCHEMA.json:1`](../packages/org-kit/agents/AGENT_SCHEMA.json#L1); [E044: `apps/web/lib/agent-loader.ts:1`](../apps/web/lib/agent-loader.ts#L1); [E092: `packages/org-kit/governance/core_governance.yaml:1`](../packages/org-kit/governance/core_governance.yaml#L1); [E093: `packages/org-kit/src/router.ts:1`](../packages/org-kit/src/router.ts#L1); [E094: `apps/web/lib/load-balancer.ts:1`](../apps/web/lib/load-balancer.ts#L1); [E095: `apps/web/lib/swarm/assign.ts:1`](../apps/web/lib/swarm/assign.ts#L1)

### RISK-002 — P1 — Workload and accounting exposure

**Type:** operational_risk. **Components:** FIN-001, FIN-002.

Minimum 50 swarm agents and scheduled ~322 calls/day/user conflict with minimum team goal. Unlimited budget default and asynchronous usage writes weaken hard spend assurance.

Recommendation: Use small defaults, opt-in schedules, transactional reservations and provider reconciliation.

Evidence: [E183: `apps/web/lib/budget.ts:1`](../apps/web/lib/budget.ts#L1); [E184: `apps/web/lib/usage.ts:1`](../apps/web/lib/usage.ts#L1); [E185: `apps/web/lib/model-router.ts:1`](../apps/web/lib/model-router.ts#L1); [E186: `apps/web/app/api/conversations/[id]/messages/route.ts:258`](../apps/web/app/api/conversations/[id]/messages/route.ts#L258); [E187: `apps/web/lib/offline.ts:1`](../apps/web/lib/offline.ts#L1); [E188: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1); [E189: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E190: `apps/web/lib/worker/roster.ts:1`](../apps/web/lib/worker/roster.ts#L1); [E191: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1)

### GAP-007 — P1 — Project/subsidiary spend attribution absent

**Type:** gap. **Components:** PROJ-002.

Usage events cannot attribute model spend to project/swarm/subsidiary. Contract values are not an expenditure ledger.

Recommendation: Add attributable usage/cost reservations, expenses, approvals and reconciliation.

Evidence: [E148: `apps/web/lib/contracts/service.ts:1`](../apps/web/lib/contracts/service.ts#L1); [E149: `apps/web/lib/finance/summary.ts:1`](../apps/web/lib/finance/summary.ts#L1); [E150: `apps/web/lib/budget.ts:1`](../apps/web/lib/budget.ts#L1); [E151: `apps/web/lib/usage.ts:1`](../apps/web/lib/usage.ts#L1)

### RISK-003 — P1 — Configured connection mistaken for capability

**Type:** operational_risk. **Components:** INT-001, INT-002, INT-003.

Credential/row existence can yield connected while adapter is absent/stubbed. SMTP/SMS source is ahead of catalog description.

Recommendation: Compute separate configured/reachable/authorized/functional states and fix catalog claims.

Evidence: [E168: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1); [E169: `apps/web/lib/connectors/registry.ts:1`](../apps/web/lib/connectors/registry.ts#L1); [E170: `services/openclaw/config/servers.json:1`](../services/openclaw/config/servers.json#L1); [E171: `apps/web/lib/change-requests/github.ts:1`](../apps/web/lib/change-requests/github.ts#L1); [E172: `services/openclaw/upstreams/social/src/server.ts:1`](../services/openclaw/upstreams/social/src/server.ts#L1); [E173: `services/openclaw/upstreams/social/src/x.ts:1`](../services/openclaw/upstreams/social/src/x.ts#L1); [E174: `apps/web/lib/social/oauth.ts:1`](../apps/web/lib/social/oauth.ts#L1); [E175: `apps/web/lib/social/scheduler.ts:1`](../apps/web/lib/social/scheduler.ts#L1); [E176: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1); [E177: `apps/web/lib/twilio-adapter.ts:1`](../apps/web/lib/twilio-adapter.ts#L1); [E178: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1)

### GAP-008 — P2 — Incomplete communications and social integrations

**Type:** gap. **Components:** INT-001, INT-002, INT-003.

WhatsApp/Telegram/app calls are stubs; Instagram/TikTok upstream not implemented; Google adapters absent; other MCP services require deployment.

Recommendation: Prioritize selected providers; add credential expiry/failure and approval-backed acceptance tests.

Evidence: [E168: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1); [E169: `apps/web/lib/connectors/registry.ts:1`](../apps/web/lib/connectors/registry.ts#L1); [E170: `services/openclaw/config/servers.json:1`](../services/openclaw/config/servers.json#L1); [E171: `apps/web/lib/change-requests/github.ts:1`](../apps/web/lib/change-requests/github.ts#L1); [E172: `services/openclaw/upstreams/social/src/server.ts:1`](../services/openclaw/upstreams/social/src/server.ts#L1); [E173: `services/openclaw/upstreams/social/src/x.ts:1`](../services/openclaw/upstreams/social/src/x.ts#L1); [E174: `apps/web/lib/social/oauth.ts:1`](../apps/web/lib/social/oauth.ts#L1); [E175: `apps/web/lib/social/scheduler.ts:1`](../apps/web/lib/social/scheduler.ts#L1); [E176: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1); [E177: `apps/web/lib/twilio-adapter.ts:1`](../apps/web/lib/twilio-adapter.ts#L1); [E178: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1)

### GAP-009 — P2 — Production and restoration readiness unestablished

**Type:** gap. **Components:** ARCH-011, TEST-002.

No independently established deploy/backup restore/load/uptime evidence. Compose alone does not establish production readiness.

Recommendation: Create reproducible release, supervision, monitoring, backups and exercised recovery.

Evidence: [E030: `apps/web/next.config.js:1`](../apps/web/next.config.js#L1); [E031: `docs/whink-worker.plist.example:1`](../docs/whink-worker.plist.example#L1); [E032: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1); [E200: `docs/HANDOFF.md:1`](../docs/HANDOFF.md#L1); [E201: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E202: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E203: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1)

### RISK-004 — P2 — Runtime and latest-commit evidence unavailable

**Type:** verification_gap. **Components:** TEST-001, TEST-002.

Prior handoff reports earlier-commit outcomes and conflicting phase claims. Current source counts do not prove passing tests.

Recommendation: Run authorized CI on exact commit and representative end-to-end scenarios.

Evidence: [E196: `.github/workflows/ci.yml:1`](../.github/workflows/ci.yml#L1); [E197: `.github/workflows/security.yml:1`](../.github/workflows/security.yml#L1); [E198: `e2e/playwright.config.ts:1`](../e2e/playwright.config.ts#L1); [E199: `docs/testing.md:1`](../docs/testing.md#L1); [E200: `docs/HANDOFF.md:1`](../docs/HANDOFF.md#L1); [E201: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E202: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E203: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1)

### RISK-005 — P2 — Provider/model and voice variants need validation

**Type:** operational_risk. **Components:** ARCH-008, INT-004, UI-004.

Hardcoded model IDs/defaults vary, multiple voice stacks exist, API compatibility not tested. SDKs and prompts do not establish service availability.

Recommendation: Consolidate validated model/provider configuration; test each supported voice transport.

Evidence: [E022: `apps/web/lib/model-router.ts:1`](../apps/web/lib/model-router.ts#L1); [E023: `apps/web/lib/model-router-tools.ts:1`](../apps/web/lib/model-router-tools.ts#L1); [E024: `apps/web/lib/model-policy.ts:1`](../apps/web/lib/model-policy.ts#L1); [E161: `apps/web/components/avatar/avatar-engine.ts:1`](../apps/web/components/avatar/avatar-engine.ts#L1); [E162: `apps/web/lib/hooks/useVoice.ts:1`](../apps/web/lib/hooks/useVoice.ts#L1); [E163: `apps/web/app/api/voice/stt/route.ts:1`](../apps/web/app/api/voice/stt/route.ts#L1); [E164: `apps/web/app/api/voice/tts/route.ts:1`](../apps/web/app/api/voice/tts/route.ts#L1); [E165: `apps/web/lib/gesture/recognize.ts:1`](../apps/web/lib/gesture/recognize.ts#L1); [E166: `apps/web/lib/gesture/hmac.ts:1`](../apps/web/lib/gesture/hmac.ts#L1); [E167: `apps/web/lib/gesture/dispatch.ts:1`](../apps/web/lib/gesture/dispatch.ts#L1); [E179: `services/voice/server.js:1`](../services/voice/server.js#L1); [E180: `services/voice/docker-compose.yml:1`](../services/voice/docker-compose.yml#L1); [E181: `services/whink-voice/server.js:1`](../services/whink-voice/server.js#L1); [E182: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1)

### RISK-006 — P2 — Concurrency and timeout limits

**Type:** operational_risk. **Components:** AUTO-003, TEST-002.

Swarm limiter and load statistics are process-local. Promise-race timeout does not establish cancellation of provider work already started.

Recommendation: Add distributed capacity limits, abort propagation and stuck-work recovery tests.

Evidence: [E082: `apps/web/lib/swarm/service.ts:1`](../apps/web/lib/swarm/service.ts#L1); [E083: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E084: `apps/web/lib/swarm/agent-call.ts:1`](../apps/web/lib/swarm/agent-call.ts#L1); [E085: `apps/web/lib/swarm/finalize.ts:1`](../apps/web/lib/swarm/finalize.ts#L1); [E086: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1); [E200: `docs/HANDOFF.md:1`](../docs/HANDOFF.md#L1); [E201: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E202: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E203: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1)

### GAP-010 — P2 — Knowledge retention and audit durability incomplete

**Type:** gap. **Components:** MEM-003, GOV-003.

Supersession/decay are not complete retention/versioning/restore; shared database ledger is not independently tamper-proof audit.

Recommendation: Specify retention/export/purge/restore and durable external audit requirements.

Evidence: [E106: `apps/web/lib/worker/jobs/memory-curation.ts:1`](../apps/web/lib/worker/jobs/memory-curation.ts#L1); [E107: `apps/web/prisma/schema.prisma:1`](../apps/web/prisma/schema.prisma#L1); [E121: `apps/web/lib/ledger.ts:1`](../apps/web/lib/ledger.ts#L1); [E122: `apps/web/lib/ledger-search.ts:1`](../apps/web/lib/ledger-search.ts#L1); [E123: `apps/web/lib/security-status.ts:1`](../apps/web/lib/security-status.ts#L1); [E124: `apps/web/lib/task-handoff.ts:1`](../apps/web/lib/task-handoff.ts#L1)

### CONFLICT-003 — P2 — Documentation and authority policy drift

**Type:** architectural_conflict. **Components:** FIN-002, GOV-001, INT-003, TEST-002.

Org-kit recommends minimum team; swarms mandate 50+. Older communications docs say Class B while implemented protected sends require Class C. Historical phase/test claims conflict.

Recommendation: Make source-backed capability/authority matrix and update docs after validation.

Evidence: [E114: `apps/web/lib/permission-engine.ts:1`](../apps/web/lib/permission-engine.ts#L1); [E115: `apps/web/lib/protected-actions.ts:1`](../apps/web/lib/protected-actions.ts#L1); [E116: `apps/web/lib/guarded-action.ts:1`](../apps/web/lib/guarded-action.ts#L1); [E176: `apps/web/lib/comms/delivery.ts:1`](../apps/web/lib/comms/delivery.ts#L1); [E177: `apps/web/lib/twilio-adapter.ts:1`](../apps/web/lib/twilio-adapter.ts#L1); [E178: `apps/web/config/connectors.catalog.json:1`](../apps/web/config/connectors.catalog.json#L1); [E188: `apps/web/config/swarm.json:1`](../apps/web/config/swarm.json#L1); [E189: `apps/web/config/standing-roster.json:1`](../apps/web/config/standing-roster.json#L1); [E190: `apps/web/lib/worker/roster.ts:1`](../apps/web/lib/worker/roster.ts#L1); [E191: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E200: `docs/HANDOFF.md:1`](../docs/HANDOFF.md#L1); [E201: `apps/web/lib/swarm/engine.ts:1`](../apps/web/lib/swarm/engine.ts#L1); [E202: `apps/web/lib/worker/runner.ts:1`](../apps/web/lib/worker/runner.ts#L1); [E203: `apps/web/lib/worker/scheduler.ts:1`](../apps/web/lib/worker/scheduler.ts#L1)

## Prioritized implementation roadmap

| ID | Priority | Stage | Findings | Acceptance evidence |
| --- | --- | --- | --- | --- |
| ROAD-01 | P0 | Containment and governance boundary | GAP-001, RISK-001 | Cross-path stop/deny/revoke/recover tests; paid calls require approved request and ledger; logs redact personal data. |
| ROAD-02 | P0 | Founder-private data compartments | GAP-002 | Classification and explicit sharing policy; cross-account/cross-role tests; curated lessons cannot silently publish private information. |
| ROAD-03 | P1 | Unified organizational graph | CONFLICT-001, CONFLICT-002 | One validated identity/reporting graph covering 16 directorates, subsidiaries, board, humans, personas and workforce. |
| ROAD-04 | P1 | Persistent authorized task execution | GAP-003, GAP-004 | Objective -> approved task -> bounded job execution -> result -> audit trace; authorization and completion states distinct. |
| ROAD-05 | P1 | Truthful interface and lifecycle | GAP-005, GAP-006 | HOLO uses real telemetry; directory exposes canonical org; lifecycle actions affect all routers consistently. |
| ROAD-06 | P1 | Financial controls and smaller defaults | RISK-002, GAP-007 | Small opt-in workloads; transactional budget reservation; project/subsidiary usage attribution and reconciliation. |
| ROAD-07 | P2 | Integration completion and truthful readiness | RISK-003, GAP-008, RISK-005 | Configured/reachable/authorized/functional states separated; selected providers pass approval/expiry/failure tests. |
| ROAD-08 | P2 | Operational reliability and current-commit proof | GAP-009, RISK-004, RISK-006, GAP-010, CONFLICT-003 | Reproducible release, distributed capacity limits, supervision, monitoring, backup restoration exercise and CI on exact target commit. |

No roadmap item was implemented as part of this read-only assessment.

## Recommended next steps

1. Review P0 findings and confirm intended authoritative hierarchy, Marcus human/AI status and founder-private information policy.
2. Authorize a separate implementation task for the first roadmap stage; this report makes no source changes.
3. When execution is authorized, validate CI on the exact target commit, then approval-backed integration and recovery scenarios.
4. Retain current source/configuration distinctions and label mock telemetry until wired.

## Exact source evidence index

Paths are repository-relative and anchors identify source lines. For file-wide evidence, the full line range is recorded in JSON. Missing-capability conclusions are bounded search/inspection findings, not proof about inaccessible external systems.

| Evidence ID | Repository path | Lines | Anchor |
| --- | --- | --- | --- |
| E001 | package.json | 1-14 | File-wide inspection |
| E002 | pnpm-workspace.yaml | 1-23 | File-wide inspection |
| E003 | apps/web/package.json | 1-142 | File-wide inspection |
| E004 | .github/workflows/ci.yml | 1-99 | File-wide inspection |
| E005 | README.md | 1-144 | File-wide inspection |
| E006 | apps/web/package.json | 1-142 | File-wide inspection |
| E007 | apps/web/next.config.js | 1-107 | File-wide inspection |
| E008 | apps/web/package.json | 1-142 | File-wide inspection |
| E009 | apps/web/prisma/schema.prisma | 1-1331 | File-wide inspection |
| E010 | docker-compose.yml | 1-46 | File-wide inspection |
| E011 | docker/postgres/init.sql | 1-3 | File-wide inspection |
| E012 | docker-compose.yml | 1-46 | File-wide inspection |
| E013 | services/anythingllm/docker-compose.yml | 1-49 | File-wide inspection |
| E014 | apps/web/lib/anythingllm-client.ts | 1-409 | File-wide inspection |
| E015 | apps/web/app/api/documents/upload/route.ts | 1-169 | File-wide inspection |
| E016 | services/openclaw/src/server.ts | 1-95 | File-wide inspection |
| E017 | services/openclaw/src/config.ts | 1-294 | File-wide inspection |
| E018 | services/openclaw/config/servers.json | 1-37 | File-wide inspection |
| E019 | services/openclaw/docker-compose.yml | 1-71 | File-wide inspection |
| E020 | services/openclaw/Dockerfile | 1-54 | File-wide inspection |
| E021 | services/openclaw/README.md | 1-114 | File-wide inspection |
| E022 | apps/web/lib/model-router.ts | 1-728 | File-wide inspection |
| E023 | apps/web/lib/model-router-tools.ts | 1-428 | File-wide inspection |
| E024 | apps/web/lib/model-policy.ts | 1-47 | File-wide inspection |
| E025 | apps/web/package.json | 1-142 | File-wide inspection |
| E026 | apps/web/app/api/documents/upload/route.ts | 1-169 | File-wide inspection |
| E027 | services/whink-content-analyst/README.md | 1-46 | File-wide inspection |
| E028 | services/whink-content-analyst/analyst.js | 1-493 | File-wide inspection |
| E029 | services/whink-content-analyst/package.json | 1-18 | File-wide inspection |
| E030 | apps/web/next.config.js | 1-107 | File-wide inspection |
| E031 | docs/whink-worker.plist.example | 1-28 | File-wide inspection |
| E032 | services/whink-voice/server.js | 1-193 | File-wide inspection |
| E033 | packages/org-kit/organization/whink_group_leadership.json | 1-245 | File-wide inspection |
| E034 | packages/org-kit/organization/team_registry.json | 1-3046 | File-wide inspection |
| E035 | packages/org-kit/organization/workforce_registry.json | 1-17732 | File-wide inspection |
| E036 | packages/org-kit/manifest.json | 1-22 | File-wide inspection |
| E037 | apps/web/lib/staff-directory.ts | 1-88 | File-wide inspection |
| E038 | apps/web/config/standing-roster.json | 1-438 | File-wide inspection |
| E039 | CLAUDE.md | 85-97 | ## Innovation & Opportunity Directorate |
| E040 | apps/web/config/subsidiaries.json | 1-85 | File-wide inspection |
| E041 | apps/web/lib/subsidiaries.ts | 1-41 | File-wide inspection |
| E042 | packages/org-kit/organization/workforce_registry.json | 1-17732 | File-wide inspection |
| E043 | packages/org-kit/agents/AGENT_SCHEMA.json | 1-28 | File-wide inspection |
| E044 | apps/web/lib/agent-loader.ts | 1-133 | File-wide inspection |
| E045 | packages/org-kit/skills/skill_registry.json | 1-27884 | File-wide inspection |
| E046 | packages/org-kit/skills/shared/SKILL_CONTRACT.yaml | 1-16 | File-wide inspection |
| E047 | apps/web/lib/agent-validator.ts | 1-13 | // 32 validation rules |
| E048 | apps/web/lib/agent-loader.ts | 1-133 | File-wide inspection |
| E049 | apps/web/prompts/persona-whink.ts | 1-23 | File-wide inspection |
| E050 | apps/web/prompts/build-prompt.ts | 1-87 | File-wide inspection |
| E051 | apps/web/lib/orchestrator.ts | 1-320 | File-wide inspection |
| E052 | apps/web/config/board.json | 1-119 | File-wide inspection |
| E053 | apps/web/prompts/persona-mamba.ts | 1-36 | File-wide inspection |
| E054 | apps/web/prompts/mamba-modes.ts | 1-19 | File-wide inspection |
| E055 | apps/web/app/api/persona/switch/route.ts | 1-53 | File-wide inspection |
| E056 | apps/web/lib/types.ts | 1-39 | File-wide inspection |
| E057 | apps/web/lib/staff-directory.ts | 1-88 | File-wide inspection |
| E058 | apps/web/config/board.json | 1-119 | File-wide inspection |
| E059 | apps/web/components/screens/meeting/props.ts | 1-30 | File-wide inspection |
| E060 | apps/web/lib/meetings/provider.ts | 1-37 | File-wide inspection |
| E061 | apps/web/config/board.json | 1-119 | File-wide inspection |
| E062 | apps/web/lib/board-meetings.ts | 1-97 | File-wide inspection |
| E063 | apps/web/components/screens/board/board-screen.tsx | 1-72 | File-wide inspection |
| E064 | apps/web/prompts/persona-peter.ts | 1-47 | File-wide inspection |
| E065 | apps/web/prompts/persona-paul.ts | 1-46 | File-wide inspection |
| E066 | apps/web/prompts/persona-micah.ts | 1-24 | File-wide inspection |
| E067 | apps/web/prompts/persona-nandi.ts | 1-27 | File-wide inspection |
| E068 | apps/web/prompts/persona-scout.ts | 1-25 | File-wide inspection |
| E069 | apps/web/prompts/build-prompt.ts | 1-87 | File-wide inspection |
| E070 | apps/web/components/screens/kill-team/kill-team-screen.tsx | 27-39 | function assignObjective() |
| E071 | apps/web/app/dashboard/kill-team/page.tsx | 1-9 | File-wide inspection |
| E072 | apps/web/app/api/persona/switch/route.ts | 1-53 | File-wide inspection |
| E073 | apps/web/prompts/persona-registration.ts | 1-25 | File-wide inspection |
| E074 | apps/web/app/api/persona/switch/route.ts | 1-53 | File-wide inspection |
| E075 | apps/web/lib/task-gate.ts | 1-164 | File-wide inspection |
| E076 | packages/org-kit/src/router.ts | 1-206 | File-wide inspection |
| E077 | apps/web/lib/approvals.ts | 85-97 | if (row.kind === 'ear') |
| E078 | apps/web/app/api/conversations/[id]/messages/route.ts | 1-509 | File-wide inspection |
| E079 | apps/web/lib/tool-loop.ts | 1-451 | File-wide inspection |
| E080 | apps/web/lib/tool-registry.ts | 1-1430 | File-wide inspection |
| E081 | apps/web/lib/gateway-chat.ts | 1-86 | File-wide inspection |
| E082 | apps/web/lib/swarm/service.ts | 1-238 | File-wide inspection |
| E083 | apps/web/lib/swarm/engine.ts | 1-319 | File-wide inspection |
| E084 | apps/web/lib/swarm/agent-call.ts | 1-142 | File-wide inspection |
| E085 | apps/web/lib/swarm/finalize.ts | 1-100 | File-wide inspection |
| E086 | apps/web/config/swarm.json | 1-36 | File-wide inspection |
| E087 | apps/web/config/standing-roster.json | 1-438 | File-wide inspection |
| E088 | apps/web/lib/worker/roster.ts | 1-73 | File-wide inspection |
| E089 | apps/web/lib/worker/scheduler.ts | 1-96 | File-wide inspection |
| E090 | apps/web/lib/worker/runner.ts | 1-121 | File-wide inspection |
| E091 | apps/web/scripts/worker.ts | 1-47 | File-wide inspection |
| E092 | packages/org-kit/governance/core_governance.yaml | 1-45 | File-wide inspection |
| E093 | packages/org-kit/src/router.ts | 1-206 | File-wide inspection |
| E094 | apps/web/lib/load-balancer.ts | 1-99 | File-wide inspection |
| E095 | apps/web/lib/swarm/assign.ts | 1-50 | File-wide inspection |
| E096 | .claude/agents/whink.md | 1-160 | File-wide inspection |
| E097 | CLAUDE.md | 67-79 | ## The team |
| E098 | apps/web/lib/memory-engine.ts | 1-504 | File-wide inspection |
| E099 | apps/web/lib/context-engine.ts | 1-305 | File-wide inspection |
| E100 | apps/web/lib/working-memory.ts | 1-68 | File-wide inspection |
| E101 | apps/web/prisma/schema.prisma | 1-1331 | File-wide inspection |
| E102 | apps/web/lib/auto-memory.ts | 1-676 | File-wide inspection |
| E103 | apps/web/lib/embedding-service.ts | 1-23 | File-wide inspection |
| E104 | apps/web/lib/agent-memory.ts | 1-91 | File-wide inspection |
| E105 | apps/web/lib/task-handoff.ts | 1-50 | File-wide inspection |
| E106 | apps/web/lib/worker/jobs/memory-curation.ts | 1-68 | File-wide inspection |
| E107 | apps/web/prisma/schema.prisma | 1-1331 | File-wide inspection |
| E108 | apps/web/lib/staff-directory.ts | 1-88 | File-wide inspection |
| E109 | apps/web/lib/project-access.ts | 1-29 | File-wide inspection |
| E110 | apps/web/prisma/schema.prisma | 1-1331 | File-wide inspection |
| E111 | apps/web/lib/agent-memory.ts | 1-91 | File-wide inspection |
| E112 | apps/web/lib/project-access.ts | 1-29 | File-wide inspection |
| E113 | apps/web/lib/context-engine.ts | 1-305 | File-wide inspection |
| E114 | apps/web/lib/permission-engine.ts | 1-242 | File-wide inspection |
| E115 | apps/web/lib/protected-actions.ts | 1-315 | File-wide inspection |
| E116 | apps/web/lib/guarded-action.ts | 1-69 | File-wide inspection |
| E117 | apps/web/lib/approvals.ts | 1-515 | File-wide inspection |
| E118 | apps/web/lib/canonical-json.ts | 1-55 | File-wide inspection |
| E119 | apps/web/lib/autonomy-approval.ts | 1-112 | File-wide inspection |
| E120 | docs/HANDOFF.md | 1-148 | File-wide inspection |
| E121 | apps/web/lib/ledger.ts | 1-211 | File-wide inspection |
| E122 | apps/web/lib/ledger-search.ts | 1-324 | File-wide inspection |
| E123 | apps/web/lib/security-status.ts | 1-96 | File-wide inspection |
| E124 | apps/web/lib/task-handoff.ts | 1-50 | File-wide inspection |
| E125 | apps/web/auth.ts | 1-85 | File-wide inspection |
| E126 | apps/web/lib/key-encryption.ts | 1-62 | File-wide inspection |
| E127 | apps/web/lib/auth/password-reset.ts | 1-106 | File-wide inspection |
| E128 | apps/web/lib/passkeys/guard.ts | 1-82 | File-wide inspection |
| E129 | apps/web/lib/content-isolation.ts | 1-65 | File-wide inspection |
| E130 | apps/web/lib/tool-registry.ts | 1-1430 | File-wide inspection |
| E131 | apps/web/lib/csrf.ts | 1-75 | File-wide inspection |
| E132 | apps/web/lib/csp.ts | 1-55 | File-wide inspection |
| E133 | apps/web/lib/rate-limit.ts | 1-175 | File-wide inspection |
| E134 | apps/web/lib/workspace-tools/sandbox.ts | 1-220 | File-wide inspection |
| E135 | apps/web/lib/workspace-tools/access.ts | 1-18 | File-wide inspection |
| E136 | apps/web/lib/local-only.ts | 1-81 | File-wide inspection |
| E137 | apps/web/lib/swarm/service.ts | 1-238 | File-wide inspection |
| E138 | apps/web/lib/worker/runner.ts | 1-121 | File-wide inspection |
| E139 | apps/web/lib/local-only.ts | 1-81 | File-wide inspection |
| E140 | apps/web/lib/security-status.ts | 1-96 | File-wide inspection |
| E141 | apps/web/lib/worker/jobs/security-watch.ts | 1-40 | File-wide inspection |
| E142 | apps/web/lib/security-status.ts | 1-96 | File-wide inspection |
| E143 | apps/web/components/screens/security/security-screen.tsx | 1-183 | File-wide inspection |
| E144 | apps/web/prisma/schema.prisma | 1-1331 | File-wide inspection |
| E145 | apps/web/app/api/projects/route.ts | 1-62 | File-wide inspection |
| E146 | apps/web/app/api/tasks/route.ts | 1-52 | File-wide inspection |
| E147 | apps/web/app/api/projects/[id]/report/route.ts | 1-56 | File-wide inspection |
| E148 | apps/web/lib/contracts/service.ts | 1-168 | File-wide inspection |
| E149 | apps/web/lib/finance/summary.ts | 1-101 | File-wide inspection |
| E150 | apps/web/lib/budget.ts | 1-90 | File-wide inspection |
| E151 | apps/web/lib/usage.ts | 1-97 | File-wide inspection |
| E152 | apps/web/components/holo/holo-surface.tsx | 109-121 | // Agent registry — fixture data until real API is wired |
| E153 | apps/web/components/holo/holo-fixtures.ts | 1-39 | File-wide inspection |
| E154 | apps/web/components/holo/holo-orb-field.tsx | 1-123 | File-wide inspection |
| E155 | apps/web/app/dashboard/directory/page.tsx | 1-7 | File-wide inspection |
| E156 | apps/web/components/screens/directory/directory-screen.tsx | 1-166 | File-wide inspection |
| E157 | apps/web/lib/staff-directory.ts | 1-88 | File-wide inspection |
| E158 | apps/web/lib/meetings/provider.ts | 1-37 | File-wide inspection |
| E159 | apps/web/app/api/meetings/quick-start/route.ts | 1-62 | File-wide inspection |
| E160 | apps/web/components/screens/meeting/meeting-screen.tsx | 1-164 | File-wide inspection |
| E161 | apps/web/components/avatar/avatar-engine.ts | 1-151 | File-wide inspection |
| E162 | apps/web/lib/hooks/useVoice.ts | 1-333 | File-wide inspection |
| E163 | apps/web/app/api/voice/stt/route.ts | 1-138 | File-wide inspection |
| E164 | apps/web/app/api/voice/tts/route.ts | 1-140 | File-wide inspection |
| E165 | apps/web/lib/gesture/recognize.ts | 1-16 | File-wide inspection |
| E166 | apps/web/lib/gesture/hmac.ts | 1-99 | File-wide inspection |
| E167 | apps/web/lib/gesture/dispatch.ts | 1-247 | File-wide inspection |
| E168 | apps/web/config/connectors.catalog.json | 1-376 | File-wide inspection |
| E169 | apps/web/lib/connectors/registry.ts | 1-197 | File-wide inspection |
| E170 | services/openclaw/config/servers.json | 1-37 | File-wide inspection |
| E171 | apps/web/lib/change-requests/github.ts | 1-62 | File-wide inspection |
| E172 | services/openclaw/upstreams/social/src/server.ts | 1-38 | File-wide inspection |
| E173 | services/openclaw/upstreams/social/src/x.ts | 1-166 | File-wide inspection |
| E174 | apps/web/lib/social/oauth.ts | 1-294 | File-wide inspection |
| E175 | apps/web/lib/social/scheduler.ts | 1-462 | File-wide inspection |
| E176 | apps/web/lib/comms/delivery.ts | 1-235 | File-wide inspection |
| E177 | apps/web/lib/twilio-adapter.ts | 1-124 | File-wide inspection |
| E178 | apps/web/config/connectors.catalog.json | 1-376 | File-wide inspection |
| E179 | services/voice/server.js | 1-139 | File-wide inspection |
| E180 | services/voice/docker-compose.yml | 1-24 | File-wide inspection |
| E181 | services/whink-voice/server.js | 1-193 | File-wide inspection |
| E182 | apps/web/lib/comms/delivery.ts | 1-235 | File-wide inspection |
| E183 | apps/web/lib/budget.ts | 1-90 | File-wide inspection |
| E184 | apps/web/lib/usage.ts | 1-97 | File-wide inspection |
| E185 | apps/web/lib/model-router.ts | 1-728 | File-wide inspection |
| E186 | apps/web/app/api/conversations/[id]/messages/route.ts | 258-270 | // Resolve model: request body > user preference > env default |
| E187 | apps/web/lib/offline.ts | 1-138 | File-wide inspection |
| E188 | apps/web/config/swarm.json | 1-36 | File-wide inspection |
| E189 | apps/web/config/standing-roster.json | 1-438 | File-wide inspection |
| E190 | apps/web/lib/worker/roster.ts | 1-73 | File-wide inspection |
| E191 | apps/web/lib/worker/runner.ts | 1-121 | File-wide inspection |
| E192 | apps/web/lib/protected-actions.ts | 1-315 | File-wide inspection |
| E193 | apps/web/lib/model-router.ts | 1-728 | File-wide inspection |
| E194 | apps/web/lib/usage.ts | 1-97 | File-wide inspection |
| E195 | services/whink-voice/server.js | 1-193 | File-wide inspection |
| E196 | .github/workflows/ci.yml | 1-99 | File-wide inspection |
| E197 | .github/workflows/security.yml | 1-64 | File-wide inspection |
| E198 | e2e/playwright.config.ts | 1-50 | File-wide inspection |
| E199 | docs/testing.md | 1-58 | File-wide inspection |
| E200 | docs/HANDOFF.md | 1-148 | File-wide inspection |
| E201 | apps/web/lib/swarm/engine.ts | 1-319 | File-wide inspection |
| E202 | apps/web/lib/worker/runner.ts | 1-121 | File-wide inspection |
| E203 | apps/web/lib/worker/scheduler.ts | 1-96 | File-wide inspection |
| E204 | packages/org-kit/organization/workforce_registry.json | 3-15 | "agent_id": "executive_office_corporate_strategy.office_of_the_ceo_executive_operations.office_of_the_ceo_executive_operations_core.aarav_kapoor" |
| E205 | packages/org-kit/organization/workforce_registry.json | 59-71 | "agent_id": "executive_office_corporate_strategy.office_of_the_ceo_executive_operations.office_of_the_ceo_executive_operations_core.amina_diallo" |
| E206 | packages/org-kit/organization/workforce_registry.json | 115-127 | "agent_id": "executive_office_corporate_strategy.corporate_strategy_strategic_planning.corporate_strategy_strategic_planning_core.lucia_navarro" |
| E207 | packages/org-kit/organization/workforce_registry.json | 171-183 | "agent_id": "executive_office_corporate_strategy.corporate_strategy_strategic_planning.corporate_strategy_strategic_planning_core.mikael_johansson" |
| E208 | packages/org-kit/organization/workforce_registry.json | 227-239 | "agent_id": "executive_office_corporate_strategy.corporate_development_strategic_investments.corporate_development_strategic_investments_core.nadia_rahman" |
| E209 | packages/org-kit/organization/workforce_registry.json | 283-295 | "agent_id": "executive_office_corporate_strategy.corporate_development_strategic_investments.corporate_development_strategic_investments_core.kofi_mensah" |
| E210 | packages/org-kit/organization/workforce_registry.json | 339-351 | "agent_id": "executive_office_corporate_strategy.enterprise_transformation_strategic_programs.enterprise_transformation_strategic_programs_core.soo_jin_park" |
| E211 | packages/org-kit/organization/workforce_registry.json | 395-407 | "agent_id": "executive_office_corporate_strategy.enterprise_transformation_strategic_programs.enterprise_transformation_strategic_programs_core.mateo_silva" |
| E212 | packages/org-kit/organization/workforce_registry.json | 451-463 | "agent_id": "executive_office_corporate_strategy.enterprise_business_intelligence_performance.enterprise_business_intelligence_performance_core.leila_haddad" |
| E213 | packages/org-kit/organization/workforce_registry.json | 507-519 | "agent_id": "executive_office_corporate_strategy.enterprise_business_intelligence_performance.enterprise_business_intelligence_performance_core.thabo_mbeki" |
| E214 | packages/org-kit/organization/workforce_registry.json | 563-575 | "agent_id": "executive_office_corporate_strategy.strategic_portfolio_pmo.strategic_portfolio_pmo_core.aya_nakamura" |
| E215 | packages/org-kit/organization/workforce_registry.json | 619-631 | "agent_id": "executive_office_corporate_strategy.strategic_portfolio_pmo.strategic_portfolio_pmo_core.santiago_rojas" |
| E216 | packages/org-kit/organization/workforce_registry.json | 675-687 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.atlas.ingrid_larsen" |
| E217 | packages/org-kit/organization/workforce_registry.json | 726-738 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.atlas.zainab_okeke" |
| E218 | packages/org-kit/organization/workforce_registry.json | 777-789 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.nova.ravi_subramanian" |
| E219 | packages/org-kit/organization/workforce_registry.json | 828-840 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.nova.maya_cohen" |
| E220 | packages/org-kit/organization/workforce_registry.json | 879-891 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.vanta.jelena_markovic" |
| E221 | packages/org-kit/organization/workforce_registry.json | 930-942 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.vanta.noah_williams" |
| E222 | packages/org-kit/organization/workforce_registry.json | 981-993 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.oracle.fatou_diop" |
| E223 | packages/org-kit/organization/workforce_registry.json | 1032-1044 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.oracle.kenji_sato" |
| E224 | packages/org-kit/organization/workforce_registry.json | 1083-1095 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.quanta.sofia_alvarez" |
| E225 | packages/org-kit/organization/workforce_registry.json | 1134-1146 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.quanta.kwame_boateng" |
| E226 | packages/org-kit/organization/workforce_registry.json | 1185-1197 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.pulse.anika_patel" |
| E227 | packages/org-kit/organization/workforce_registry.json | 1236-1248 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.pulse.lars_andersen" |
| E228 | packages/org-kit/organization/workforce_registry.json | 1287-1299 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.verity.amara_nwosu" |
| E229 | packages/org-kit/organization/workforce_registry.json | 1338-1350 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.verity.diego_martinez" |
| E230 | packages/org-kit/organization/workforce_registry.json | 1389-1401 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.forge.mariam_el_sayed" |
| E231 | packages/org-kit/organization/workforce_registry.json | 1440-1452 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.forge.joao_pereira" |
| E232 | packages/org-kit/organization/workforce_registry.json | 1491-1503 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.rhodes.tariro_moyo" |
| E233 | packages/org-kit/organization/workforce_registry.json | 1542-1554 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.rhodes.eun_ji_kim" |
| E234 | packages/org-kit/organization/workforce_registry.json | 1593-1605 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.prism.isabella_rossi" |
| E235 | packages/org-kit/organization/workforce_registry.json | 1644-1656 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.prism.omar_farouk" |
| E236 | packages/org-kit/organization/workforce_registry.json | 1695-1707 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.halo.nia_robinson" |
| E237 | packages/org-kit/organization/workforce_registry.json | 1746-1758 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.halo.arjun_mehta" |
| E238 | packages/org-kit/organization/workforce_registry.json | 1797-1809 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.titan.camille_tremblay" |
| E239 | packages/org-kit/organization/workforce_registry.json | 1848-1860 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.titan.tomas_novak" |
| E240 | packages/org-kit/organization/workforce_registry.json | 1899-1911 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.magnet.aisha_bello" |
| E241 | packages/org-kit/organization/workforce_registry.json | 1950-1962 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.magnet.hugo_moreau" |
| E242 | packages/org-kit/organization/workforce_registry.json | 2001-2013 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.flux.priya_shah" |
| E243 | packages/org-kit/organization/workforce_registry.json | 2052-2064 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.flux.bongani_khumalo" |
| E244 | packages/org-kit/organization/workforce_registry.json | 2103-2115 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.livewire.lina_nguyen" |
| E245 | packages/org-kit/organization/workforce_registry.json | 2154-2166 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.livewire.gabriel_costa" |
| E246 | packages/org-kit/organization/workforce_registry.json | 2205-2217 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.echo.samira_qureshi" |
| E247 | packages/org-kit/organization/workforce_registry.json | 2256-2268 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.echo.elias_petrov" |
| E248 | packages/org-kit/organization/workforce_registry.json | 2307-2319 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.cut.yara_mansour" |
| E249 | packages/org-kit/organization/workforce_registry.json | 2358-2370 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.cut.emeka_eze" |
| E250 | packages/org-kit/organization/workforce_registry.json | 2409-2421 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.sonic.marta_kowalska" |
| E251 | packages/org-kit/organization/workforce_registry.json | 2460-2472 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.sonic.min_ho_lee" |
| E252 | packages/org-kit/organization/workforce_registry.json | 2511-2523 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.signal.chloe_bennett" |
| E253 | packages/org-kit/organization/workforce_registry.json | 2562-2574 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.signal.rafael_mendes" |
| E254 | packages/org-kit/organization/workforce_registry.json | 2613-2625 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.mosaic.noura_al_mansouri" |
| E255 | packages/org-kit/organization/workforce_registry.json | 2664-2676 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.mosaic.tendai_muchengeti" |
| E256 | packages/org-kit/organization/workforce_registry.json | 2715-2727 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.chorus.freja_lindholm" |
| E257 | packages/org-kit/organization/workforce_registry.json | 2766-2778 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.chorus.dario_conti" |
| E258 | packages/org-kit/organization/workforce_registry.json | 2817-2829 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.shield.mei_lin" |
| E259 | packages/org-kit/organization/workforce_registry.json | 2868-2880 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.shield.grace_owusu" |
| E260 | packages/org-kit/organization/workforce_registry.json | 2919-2931 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.mirror.alejandro_ruiz" |
| E261 | packages/org-kit/organization/workforce_registry.json | 2970-2982 | "agent_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.mirror.sana_khan" |
| E262 | packages/org-kit/organization/workforce_registry.json | 3021-3033 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.vector.theo_martin" |
| E263 | packages/org-kit/organization/workforce_registry.json | 3072-3084 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.vector.nneka_obi" |
| E264 | packages/org-kit/organization/workforce_registry.json | 3123-3135 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.nexus.yuki_tanaka" |
| E265 | packages/org-kit/organization/workforce_registry.json | 3174-3186 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.nexus.andres_valdes" |
| E266 | packages/org-kit/organization/workforce_registry.json | 3225-3237 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.ledger.claire_dubois" |
| E267 | packages/org-kit/organization/workforce_registry.json | 3276-3288 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.ledger.sipho_dlamini" |
| E268 | packages/org-kit/organization/workforce_registry.json | 3327-3339 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.conductor.helena_varga" |
| E269 | packages/org-kit/organization/workforce_registry.json | 3378-3390 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.conductor.rajiv_menon" |
| E270 | packages/org-kit/organization/workforce_registry.json | 3429-3441 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.sentinel.farah_hussein" |
| E271 | packages/org-kit/organization/workforce_registry.json | 3480-3492 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.sentinel.caleb_adebayo" |
| E272 | packages/org-kit/organization/workforce_registry.json | 3531-3543 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.muse.elena_popescu" |
| E273 | packages/org-kit/organization/workforce_registry.json | 3582-3594 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.muse.marcus_chen" |
| E274 | packages/org-kit/organization/workforce_registry.json | 3633-3645 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.propel.aiko_fujimoto" |
| E275 | packages/org-kit/organization/workforce_registry.json | 3684-3696 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.propel.javier_morales" |
| E276 | packages/org-kit/organization/workforce_registry.json | 3735-3747 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.demand.naomi_ito" |
| E277 | packages/org-kit/organization/workforce_registry.json | 3786-3798 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.demand.kojo_asante" |
| E278 | packages/org-kit/organization/workforce_registry.json | 3837-3849 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.revops.sven_bergstrom" |
| E279 | packages/org-kit/organization/workforce_registry.json | 3888-3900 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.revops.dalia_habib" |
| E280 | packages/org-kit/organization/workforce_registry.json | 3939-3951 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.lifecycle.ife_ogunleye" |
| E281 | packages/org-kit/organization/workforce_registry.json | 3990-4002 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.lifecycle.pavel_horak" |
| E282 | packages/org-kit/organization/workforce_registry.json | 4041-4053 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.convert.sora_choi" |
| E283 | packages/org-kit/organization/workforce_registry.json | 4092-4104 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.convert.luca_romano" |
| E284 | packages/org-kit/organization/workforce_registry.json | 4143-4155 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.authority.amelie_laurent" |
| E285 | packages/org-kit/organization/workforce_registry.json | 4194-4206 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.authority.katarina_novak" |
| E286 | packages/org-kit/organization/workforce_registry.json | 4245-4257 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.enable.mikhail_sokolov" |
| E287 | packages/org-kit/organization/workforce_registry.json | 4296-4308 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.enable.hana_suzuki" |
| E288 | packages/org-kit/organization/workforce_registry.json | 4347-4359 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.advocate.samuel_okoro" |
| E289 | packages/org-kit/organization/workforce_registry.json | 4398-4410 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.advocate.lea_bernard" |
| E290 | packages/org-kit/organization/workforce_registry.json | 4449-4461 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.field.nicolas_fernandez" |
| E291 | packages/org-kit/organization/workforce_registry.json | 4500-4512 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.field.rania_khalil" |
| E292 | packages/org-kit/organization/workforce_registry.json | 4551-4563 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.compass.zuri_kamau" |
| E293 | packages/org-kit/organization/workforce_registry.json | 4602-4614 | "agent_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.compass.viktor_meyer" |
| E294 | packages/org-kit/organization/workforce_registry.json | 4653-4665 | "agent_id": "sales_revenue.enterprise_sales.enterprise_sales_core.adewale_bakare" |
| E295 | packages/org-kit/organization/workforce_registry.json | 4709-4721 | "agent_id": "sales_revenue.enterprise_sales.enterprise_sales_core.giulia_bianchi" |
| E296 | packages/org-kit/organization/workforce_registry.json | 4765-4777 | "agent_id": "sales_revenue.smb_mid_market_sales.smb_mid_market_sales_core.noor_al_khatib" |
| E297 | packages/org-kit/organization/workforce_registry.json | 4821-4833 | "agent_id": "sales_revenue.smb_mid_market_sales.smb_mid_market_sales_core.ren_watanabe" |
| E298 | packages/org-kit/organization/workforce_registry.json | 4877-4889 | "agent_id": "sales_revenue.sales_development_pipeline_generation.sales_development_pipeline_generation_core.mpho_ndlovu" |
| E299 | packages/org-kit/organization/workforce_registry.json | 4933-4945 | "agent_id": "sales_revenue.sales_development_pipeline_generation.sales_development_pipeline_generation_core.carmen_ortega" |
| E300 | packages/org-kit/organization/workforce_registry.json | 4989-5001 | "agent_id": "sales_revenue.solutions_technical_sales.solutions_technical_sales_core.yusuf_karim" |
| E301 | packages/org-kit/organization/workforce_registry.json | 5045-5057 | "agent_id": "sales_revenue.solutions_technical_sales.solutions_technical_sales_core.bruno_costa" |
| E302 | packages/org-kit/organization/workforce_registry.json | 5101-5113 | "agent_id": "sales_revenue.channel_partner_sales.channel_partner_sales_core.lena_schmidt" |
| E303 | packages/org-kit/organization/workforce_registry.json | 5157-5169 | "agent_id": "sales_revenue.channel_partner_sales.channel_partner_sales_core.tobi_akinola" |
| E304 | packages/org-kit/organization/workforce_registry.json | 5213-5225 | "agent_id": "sales_revenue.account_management_expansion.account_management_expansion_core.ana_petrescu" |
| E305 | packages/org-kit/organization/workforce_registry.json | 5269-5281 | "agent_id": "sales_revenue.account_management_expansion.account_management_expansion_core.daisuke_mori" |
| E306 | packages/org-kit/organization/workforce_registry.json | 5325-5337 | "agent_id": "sales_revenue.revenue_operations_sales_intelligence.revenue_operations_sales_intelligence_core.imani_carter" |
| E307 | packages/org-kit/organization/workforce_registry.json | 5381-5393 | "agent_id": "sales_revenue.revenue_operations_sales_intelligence.revenue_operations_sales_intelligence_core.mina_hosseini" |
| E308 | packages/org-kit/organization/workforce_registry.json | 5437-5449 | "agent_id": "product.product_strategy_portfolio.product_strategy_portfolio_core.leandro_souza" |
| E309 | packages/org-kit/organization/workforce_registry.json | 5493-5505 | "agent_id": "product.product_strategy_portfolio.product_strategy_portfolio_core.saanvi_rao" |
| E310 | packages/org-kit/organization/workforce_registry.json | 5549-5561 | "agent_id": "product.product_management.product_management_core.osei_agyeman" |
| E311 | packages/org-kit/organization/workforce_registry.json | 5605-5617 | "agent_id": "product.product_management.product_management_core.marina_kovac" |
| E312 | packages/org-kit/organization/workforce_registry.json | 5661-5673 | "agent_id": "product.product_operations.product_operations_core.hassan_bashir" |
| E313 | packages/org-kit/organization/workforce_registry.json | 5717-5729 | "agent_id": "product.product_operations.product_operations_core.erika_srensen" |
| E314 | packages/org-kit/organization/workforce_registry.json | 5773-5785 | "agent_id": "product.product_research_customer_discovery.product_research_customer_discovery_core.kelechi_umeh" |
| E315 | packages/org-kit/organization/workforce_registry.json | 5829-5841 | "agent_id": "product.product_research_customer_discovery.product_research_customer_discovery_core.adriana_paz" |
| E316 | packages/org-kit/organization/workforce_registry.json | 5885-5897 | "agent_id": "product.product_analytics_intelligence.product_analytics_intelligence_core.victor_liu" |
| E317 | packages/org-kit/organization/workforce_registry.json | 5941-5953 | "agent_id": "product.product_analytics_intelligence.product_analytics_intelligence_core.mariam_ncube" |
| E318 | packages/org-kit/organization/workforce_registry.json | 5997-6009 | "agent_id": "product.user_experience_service_design.user_experience_service_design_core.fiona_macleod" |
| E319 | packages/org-kit/organization/workforce_registry.json | 6053-6065 | "agent_id": "product.user_experience_service_design.user_experience_service_design_core.ximena_torres" |
| E320 | packages/org-kit/organization/workforce_registry.json | 6109-6121 | "agent_id": "product.release_product_lifecycle_management.release_product_lifecycle_management_core.seyi_adeyemi" |
| E321 | packages/org-kit/organization/workforce_registry.json | 6165-6177 | "agent_id": "product.release_product_lifecycle_management.release_product_lifecycle_management_core.nikolai_ivanov" |
| E322 | packages/org-kit/organization/workforce_registry.json | 6221-6233 | "agent_id": "engineering_technology.software_engineering.software_engineering_core.hye_jin_seo" |
| E323 | packages/org-kit/organization/workforce_registry.json | 6277-6289 | "agent_id": "engineering_technology.software_engineering.software_engineering_core.salma_zahra" |
| E324 | packages/org-kit/organization/workforce_registry.json | 6333-6345 | "agent_id": "engineering_technology.mobile_client_platforms.mobile_client_platforms_core.daniel_cho" |
| E325 | packages/org-kit/organization/workforce_registry.json | 6389-6401 | "agent_id": "engineering_technology.mobile_client_platforms.mobile_client_platforms_core.ariane_beaumont" |
| E326 | packages/org-kit/organization/workforce_registry.json | 6445-6457 | "agent_id": "engineering_technology.platform_engineering_core_infrastructure.platform_engineering_core_infrastructure_core.felix_weber" |
| E327 | packages/org-kit/organization/workforce_registry.json | 6501-6513 | "agent_id": "engineering_technology.platform_engineering_core_infrastructure.platform_engineering_core_infrastructure_core.talia_green" |
| E328 | packages/org-kit/organization/workforce_registry.json | 6557-6569 | "agent_id": "engineering_technology.architecture_technical_strategy.architecture_technical_strategy_core.rami_aziz" |
| E329 | packages/org-kit/organization/workforce_registry.json | 6613-6625 | "agent_id": "engineering_technology.architecture_technical_strategy.architecture_technical_strategy_core.sophie_muller" |
| E330 | packages/org-kit/organization/workforce_registry.json | 6669-6681 | "agent_id": "engineering_technology.api_integrations_developer_ecosystem.api_integrations_developer_ecosystem_core.olu_afolayan" |
| E331 | packages/org-kit/organization/workforce_registry.json | 6725-6737 | "agent_id": "engineering_technology.api_integrations_developer_ecosystem.api_integrations_developer_ecosystem_core.marisol_vega" |
| E332 | packages/org-kit/organization/workforce_registry.json | 6781-6793 | "agent_id": "engineering_technology.devops_sre_cloud_engineering.devops_sre_cloud_engineering_core.joon_kang" |
| E333 | packages/org-kit/organization/workforce_registry.json | 6837-6849 | "agent_id": "engineering_technology.devops_sre_cloud_engineering.devops_sre_cloud_engineering_core.abena_ofori" |
| E334 | packages/org-kit/organization/workforce_registry.json | 6893-6905 | "agent_id": "engineering_technology.quality_engineering_test_automation.quality_engineering_test_automation_core.sebastian_keller" |
| E335 | packages/org-kit/organization/workforce_registry.json | 6949-6961 | "agent_id": "engineering_technology.quality_engineering_test_automation.quality_engineering_test_automation_core.laila_benali" |
| E336 | packages/org-kit/organization/workforce_registry.json | 7005-7017 | "agent_id": "engineering_technology.release_engineering_configuration_management.release_engineering_configuration_management_core.chiamaka_nnaji" |
| E337 | packages/org-kit/organization/workforce_registry.json | 7061-7073 | "agent_id": "engineering_technology.release_engineering_configuration_management.release_engineering_configuration_management_core.milan_jovanovic" |
| E338 | packages/org-kit/organization/workforce_registry.json | 7117-7129 | "agent_id": "engineering_technology.engineering_productivity_developer_experience.engineering_productivity_developer_experience_core.reina_matsuda" |
| E339 | packages/org-kit/organization/workforce_registry.json | 7173-7185 | "agent_id": "engineering_technology.engineering_productivity_developer_experience.engineering_productivity_developer_experience_core.owen_murphy" |
| E340 | packages/org-kit/organization/workforce_registry.json | 7229-7241 | "agent_id": "engineering_technology.technical_documentation_engineering_knowledge.technical_documentation_engineering_knowledge_core.adjoa_quartey" |
| E341 | packages/org-kit/organization/workforce_registry.json | 7285-7297 | "agent_id": "engineering_technology.technical_documentation_engineering_knowledge.technical_documentation_engineering_knowledge_core.luis_herrera" |
| E342 | packages/org-kit/organization/workforce_registry.json | 7341-7353 | "agent_id": "data_artificial_intelligence.ai_engineering_applied_intelligence.ai_engineering_applied_intelligence_core.neha_desai" |
| E343 | packages/org-kit/organization/workforce_registry.json | 7397-7409 | "agent_id": "data_artificial_intelligence.ai_engineering_applied_intelligence.ai_engineering_applied_intelligence_core.hakeem_lawal" |
| E344 | packages/org-kit/organization/workforce_registry.json | 7453-7465 | "agent_id": "data_artificial_intelligence.agent_architecture_ai_workforce_systems.agent_architecture_ai_workforce_systems_core.nora_jensen" |
| E345 | packages/org-kit/organization/workforce_registry.json | 7509-7521 | "agent_id": "data_artificial_intelligence.agent_architecture_ai_workforce_systems.agent_architecture_ai_workforce_systems_core.ming_zhao" |
| E346 | packages/org-kit/organization/workforce_registry.json | 7565-7577 | "agent_id": "data_artificial_intelligence.skill_engineering_tool_orchestration.skill_engineering_tool_orchestration_core.esteban_cruz" |
| E347 | packages/org-kit/organization/workforce_registry.json | 7621-7633 | "agent_id": "data_artificial_intelligence.skill_engineering_tool_orchestration.skill_engineering_tool_orchestration_core.yetunde_salami" |
| E348 | packages/org-kit/organization/workforce_registry.json | 7677-7689 | "agent_id": "data_artificial_intelligence.machine_learning_model_development.machine_learning_model_development_core.ivan_dimitrov" |
| E349 | packages/org-kit/organization/workforce_registry.json | 7733-7745 | "agent_id": "data_artificial_intelligence.machine_learning_model_development.machine_learning_model_development_core.muna_abbas" |
| E350 | packages/org-kit/organization/workforce_registry.json | 7789-7801 | "agent_id": "data_artificial_intelligence.model_evaluation_reliability_intelligence_quality.model_evaluation_reliability_intelligence_quality_core.tatsuya_kobayashi" |
| E351 | packages/org-kit/organization/workforce_registry.json | 7845-7857 | "agent_id": "data_artificial_intelligence.model_evaluation_reliability_intelligence_quality.model_evaluation_reliability_intelligence_quality_core.sabrina_fontaine" |
| E352 | packages/org-kit/organization/workforce_registry.json | 7901-7913 | "agent_id": "data_artificial_intelligence.model_routing_ai_infrastructure.model_routing_ai_infrastructure_core.femi_balogun" |
| E353 | packages/org-kit/organization/workforce_registry.json | 7957-7969 | "agent_id": "data_artificial_intelligence.model_routing_ai_infrastructure.model_routing_ai_infrastructure_core.alina_ionescu" |
| E354 | packages/org-kit/organization/workforce_registry.json | 8013-8025 | "agent_id": "data_artificial_intelligence.data_engineering_data_platforms.data_engineering_data_platforms_core.kwesi_appiah" |
| E355 | packages/org-kit/organization/workforce_registry.json | 8069-8081 | "agent_id": "data_artificial_intelligence.data_engineering_data_platforms.data_engineering_data_platforms_core.maya_ben_david" |
| E356 | packages/org-kit/organization/workforce_registry.json | 8125-8137 | "agent_id": "data_artificial_intelligence.data_science_decision_intelligence.data_science_decision_intelligence_core.rahul_iyer" |
| E357 | packages/org-kit/organization/workforce_registry.json | 8181-8193 | "agent_id": "data_artificial_intelligence.data_science_decision_intelligence.data_science_decision_intelligence_core.noelle_brooks" |
| E358 | packages/org-kit/organization/workforce_registry.json | 8237-8249 | "agent_id": "data_artificial_intelligence.knowledge_systems_enterprise_memory.knowledge_systems_enterprise_memory_core.jorge_almeida" |
| E359 | packages/org-kit/organization/workforce_registry.json | 8293-8305 | "agent_id": "data_artificial_intelligence.knowledge_systems_enterprise_memory.knowledge_systems_enterprise_memory_core.tara_singh" |
| E360 | packages/org-kit/organization/workforce_registry.json | 8349-8361 | "agent_id": "data_artificial_intelligence.ai_governance_technology_responsible_ai_systems.ai_governance_technology_responsible_ai_systems_core.maksim_volkov" |
| E361 | packages/org-kit/organization/workforce_registry.json | 8405-8417 | "agent_id": "data_artificial_intelligence.ai_governance_technology_responsible_ai_systems.ai_governance_technology_responsible_ai_systems_core.safiya_abdullahi" |
| E362 | packages/org-kit/organization/workforce_registry.json | 8461-8473 | "agent_id": "data_artificial_intelligence.ai_finops_usage_intelligence.ai_finops_usage_intelligence_core.enzo_marchetti" |
| E363 | packages/org-kit/organization/workforce_registry.json | 8517-8529 | "agent_id": "data_artificial_intelligence.ai_finops_usage_intelligence.ai_finops_usage_intelligence_core.zoe_lam" |
| E364 | packages/org-kit/organization/workforce_registry.json | 8573-8585 | "agent_id": "data_artificial_intelligence.ai_platform_operations_observability.ai_platform_operations_observability_core.chinedu_okafor" |
| E365 | packages/org-kit/organization/workforce_registry.json | 8629-8641 | "agent_id": "data_artificial_intelligence.ai_platform_operations_observability.ai_platform_operations_observability_core.elise_van_dijk" |
| E366 | packages/org-kit/organization/workforce_registry.json | 8685-8697 | "agent_id": "research_development.applied_research.applied_research_core.hasan_demir" |
| E367 | packages/org-kit/organization/workforce_registry.json | 8741-8753 | "agent_id": "research_development.applied_research.applied_research_core.natsuki_arai" |
| E368 | packages/org-kit/organization/workforce_registry.json | 8797-8809 | "agent_id": "research_development.emerging_technologies_future_systems.emerging_technologies_future_systems_core.bianca_santos" |
| E369 | packages/org-kit/organization/workforce_registry.json | 8852-8864 | "agent_id": "research_development.emerging_technologies_future_systems.emerging_technologies_future_systems_core.tawanda_ncube" |
| E370 | packages/org-kit/organization/workforce_registry.json | 8907-8919 | "agent_id": "research_development.experimental_engineering_prototyping.experimental_engineering_prototyping_core.linh_tran" |
| E371 | packages/org-kit/organization/workforce_registry.json | 8962-8974 | "agent_id": "research_development.experimental_engineering_prototyping.experimental_engineering_prototyping_core.isaac_mensah" |
| E372 | packages/org-kit/organization/workforce_registry.json | 9017-9029 | "agent_id": "research_development.ai_autonomous_systems_research.ai_autonomous_systems_research_core.mariam_said" |
| E373 | packages/org-kit/organization/workforce_registry.json | 9072-9084 | "agent_id": "research_development.ai_autonomous_systems_research.ai_autonomous_systems_research_core.jonas_eriksen" |
| E374 | packages/org-kit/organization/workforce_registry.json | 9127-9139 | "agent_id": "research_development.humancomputer_interaction_future_interfaces.humancomputer_interaction_future_interfaces_core.amina_yusuf" |
| E375 | packages/org-kit/organization/workforce_registry.json | 9183-9195 | "agent_id": "research_development.humancomputer_interaction_future_interfaces.humancomputer_interaction_future_interfaces_core.kaito_ishikawa" |
| E376 | packages/org-kit/organization/workforce_registry.json | 9239-9251 | "agent_id": "research_development.advanced_computing_systems_research.advanced_computing_systems_research_core.camila_ferreira" |
| E377 | packages/org-kit/organization/workforce_registry.json | 9294-9306 | "agent_id": "research_development.advanced_computing_systems_research.advanced_computing_systems_research_core.olivia_reed" |
| E378 | packages/org-kit/organization/workforce_registry.json | 9349-9361 | "agent_id": "research_development.research_partnerships_academic_collaboration.research_partnerships_academic_collaboration_core.ade_mabaso" |
| E379 | packages/org-kit/organization/workforce_registry.json | 9404-9416 | "agent_id": "research_development.research_partnerships_academic_collaboration.research_partnerships_academic_collaboration_core.sofia_ivanova" |
| E380 | packages/org-kit/organization/workforce_registry.json | 9459-9471 | "agent_id": "research_development.innovation_incubation_technology_transfer.innovation_incubation_technology_transfer_core.nabil_rahman" |
| E381 | packages/org-kit/organization/workforce_registry.json | 9514-9526 | "agent_id": "research_development.innovation_incubation_technology_transfer.innovation_incubation_technology_transfer_core.akosua_nyarko" |
| E382 | packages/org-kit/organization/workforce_registry.json | 9569-9581 | "agent_id": "research_development.intellectual_property_discovery_invention_management.intellectual_property_discovery_invention_management_core.lorenzo_greco" |
| E383 | packages/org-kit/organization/workforce_registry.json | 9624-9636 | "agent_id": "research_development.intellectual_property_discovery_invention_management.intellectual_property_discovery_invention_management_core.jia_chen" |
| E384 | packages/org-kit/organization/workforce_registry.json | 9679-9691 | "agent_id": "research_development.research_intelligence_scientific_foresight.research_intelligence_scientific_foresight_core.agent181_whink181" |
| E385 | packages/org-kit/organization/workforce_registry.json | 9734-9746 | "agent_id": "research_development.research_intelligence_scientific_foresight.research_intelligence_scientific_foresight_core.agent182_whink182" |
| E386 | packages/org-kit/organization/workforce_registry.json | 9789-9801 | "agent_id": "information_technology.enterprise_applications_business_systems.enterprise_applications_business_systems_core.agent183_whink183" |
| E387 | packages/org-kit/organization/workforce_registry.json | 9844-9856 | "agent_id": "information_technology.enterprise_applications_business_systems.enterprise_applications_business_systems_core.agent184_whink184" |
| E388 | packages/org-kit/organization/workforce_registry.json | 9899-9911 | "agent_id": "information_technology.end_user_computing_workplace_technology.end_user_computing_workplace_technology_core.agent185_whink185" |
| E389 | packages/org-kit/organization/workforce_registry.json | 9954-9966 | "agent_id": "information_technology.end_user_computing_workplace_technology.end_user_computing_workplace_technology_core.agent186_whink186" |
| E390 | packages/org-kit/organization/workforce_registry.json | 10009-10021 | "agent_id": "information_technology.it_service_management_service_desk.it_service_management_service_desk_core.agent187_whink187" |
| E391 | packages/org-kit/organization/workforce_registry.json | 10065-10077 | "agent_id": "information_technology.it_service_management_service_desk.it_service_management_service_desk_core.agent188_whink188" |
| E392 | packages/org-kit/organization/workforce_registry.json | 10121-10133 | "agent_id": "information_technology.cloud_infrastructure_operations.cloud_infrastructure_operations_core.agent189_whink189" |
| E393 | packages/org-kit/organization/workforce_registry.json | 10176-10188 | "agent_id": "information_technology.cloud_infrastructure_operations.cloud_infrastructure_operations_core.agent190_whink190" |
| E394 | packages/org-kit/organization/workforce_registry.json | 10231-10243 | "agent_id": "information_technology.network_connectivity_services.network_connectivity_services_core.agent191_whink191" |
| E395 | packages/org-kit/organization/workforce_registry.json | 10286-10298 | "agent_id": "information_technology.network_connectivity_services.network_connectivity_services_core.agent192_whink192" |
| E396 | packages/org-kit/organization/workforce_registry.json | 10341-10353 | "agent_id": "information_technology.identity_access_administration.identity_access_administration_core.agent193_whink193" |
| E397 | packages/org-kit/organization/workforce_registry.json | 10397-10409 | "agent_id": "information_technology.identity_access_administration.identity_access_administration_core.agent194_whink194" |
| E398 | packages/org-kit/organization/workforce_registry.json | 10453-10465 | "agent_id": "information_technology.collaboration_productivity_platforms.collaboration_productivity_platforms_core.agent195_whink195" |
| E399 | packages/org-kit/organization/workforce_registry.json | 10508-10520 | "agent_id": "information_technology.collaboration_productivity_platforms.collaboration_productivity_platforms_core.agent196_whink196" |
| E400 | packages/org-kit/organization/workforce_registry.json | 10563-10575 | "agent_id": "information_technology.it_asset_configuration_management.it_asset_configuration_management_core.agent197_whink197" |
| E401 | packages/org-kit/organization/workforce_registry.json | 10618-10630 | "agent_id": "information_technology.it_asset_configuration_management.it_asset_configuration_management_core.agent198_whink198" |
| E402 | packages/org-kit/organization/workforce_registry.json | 10673-10685 | "agent_id": "information_technology.enterprise_systems_administration.enterprise_systems_administration_core.agent199_whink199" |
| E403 | packages/org-kit/organization/workforce_registry.json | 10728-10740 | "agent_id": "information_technology.enterprise_systems_administration.enterprise_systems_administration_core.agent200_whink200" |
| E404 | packages/org-kit/organization/workforce_registry.json | 10783-10795 | "agent_id": "information_technology.it_architecture_technology_standards.it_architecture_technology_standards_core.agent201_whink201" |
| E405 | packages/org-kit/organization/workforce_registry.json | 10838-10850 | "agent_id": "information_technology.it_architecture_technology_standards.it_architecture_technology_standards_core.agent202_whink202" |
| E406 | packages/org-kit/organization/workforce_registry.json | 10893-10905 | "agent_id": "cybersecurity_resilience.security_operations_incident_response.security_operations_incident_response_core.agent203_whink203" |
| E407 | packages/org-kit/organization/workforce_registry.json | 10949-10961 | "agent_id": "cybersecurity_resilience.security_operations_incident_response.security_operations_incident_response_core.agent204_whink204" |
| E408 | packages/org-kit/organization/workforce_registry.json | 11005-11017 | "agent_id": "cybersecurity_resilience.threat_intelligence_threat_hunting.threat_intelligence_threat_hunting_core.agent205_whink205" |
| E409 | packages/org-kit/organization/workforce_registry.json | 11060-11072 | "agent_id": "cybersecurity_resilience.threat_intelligence_threat_hunting.threat_intelligence_threat_hunting_core.agent206_whink206" |
| E410 | packages/org-kit/organization/workforce_registry.json | 11115-11127 | "agent_id": "cybersecurity_resilience.identity_security_privileged_access.identity_security_privileged_access_core.agent207_whink207" |
| E411 | packages/org-kit/organization/workforce_registry.json | 11171-11183 | "agent_id": "cybersecurity_resilience.identity_security_privileged_access.identity_security_privileged_access_core.agent208_whink208" |
| E412 | packages/org-kit/organization/workforce_registry.json | 11227-11239 | "agent_id": "cybersecurity_resilience.security_engineering.security_engineering_core.agent209_whink209" |
| E413 | packages/org-kit/organization/workforce_registry.json | 11282-11294 | "agent_id": "cybersecurity_resilience.security_engineering.security_engineering_core.agent210_whink210" |
| E414 | packages/org-kit/organization/workforce_registry.json | 11337-11349 | "agent_id": "cybersecurity_resilience.cloud_infrastructure_security.cloud_infrastructure_security_core.agent211_whink211" |
| E415 | packages/org-kit/organization/workforce_registry.json | 11392-11404 | "agent_id": "cybersecurity_resilience.cloud_infrastructure_security.cloud_infrastructure_security_core.agent212_whink212" |
| E416 | packages/org-kit/organization/workforce_registry.json | 11447-11459 | "agent_id": "cybersecurity_resilience.application_product_security.application_product_security_core.agent213_whink213" |
| E417 | packages/org-kit/organization/workforce_registry.json | 11502-11514 | "agent_id": "cybersecurity_resilience.application_product_security.application_product_security_core.agent214_whink214" |
| E418 | packages/org-kit/organization/workforce_registry.json | 11557-11569 | "agent_id": "cybersecurity_resilience.security_architecture.security_architecture_core.agent215_whink215" |
| E419 | packages/org-kit/organization/workforce_registry.json | 11612-11624 | "agent_id": "cybersecurity_resilience.security_architecture.security_architecture_core.agent216_whink216" |
| E420 | packages/org-kit/organization/workforce_registry.json | 11667-11679 | "agent_id": "cybersecurity_resilience.vulnerability_exposure_management.vulnerability_exposure_management_core.agent217_whink217" |
| E421 | packages/org-kit/organization/workforce_registry.json | 11722-11734 | "agent_id": "cybersecurity_resilience.vulnerability_exposure_management.vulnerability_exposure_management_core.agent218_whink218" |
| E422 | packages/org-kit/organization/workforce_registry.json | 11777-11789 | "agent_id": "cybersecurity_resilience.data_security_information_protection.data_security_information_protection_core.agent219_whink219" |
| E423 | packages/org-kit/organization/workforce_registry.json | 11833-11845 | "agent_id": "cybersecurity_resilience.data_security_information_protection.data_security_information_protection_core.agent220_whink220" |
| E424 | packages/org-kit/organization/workforce_registry.json | 11889-11901 | "agent_id": "cybersecurity_resilience.third_party_supply_chain_security.third_party_supply_chain_security_core.agent221_whink221" |
| E425 | packages/org-kit/organization/workforce_registry.json | 11944-11956 | "agent_id": "cybersecurity_resilience.third_party_supply_chain_security.third_party_supply_chain_security_core.agent222_whink222" |
| E426 | packages/org-kit/organization/workforce_registry.json | 11999-12011 | "agent_id": "cybersecurity_resilience.cyber_risk_security_governance.cyber_risk_security_governance_core.agent223_whink223" |
| E427 | packages/org-kit/organization/workforce_registry.json | 12054-12066 | "agent_id": "cybersecurity_resilience.cyber_risk_security_governance.cyber_risk_security_governance_core.agent224_whink224" |
| E428 | packages/org-kit/organization/workforce_registry.json | 12109-12121 | "agent_id": "cybersecurity_resilience.business_continuity_disaster_recovery_cyber_resilience.business_continuity_disaster_recovery_cyber_resilience_core.agent225_whink225" |
| E429 | packages/org-kit/organization/workforce_registry.json | 12164-12176 | "agent_id": "cybersecurity_resilience.business_continuity_disaster_recovery_cyber_resilience.business_continuity_disaster_recovery_cyber_resilience_core.agent226_whink226" |
| E430 | packages/org-kit/organization/workforce_registry.json | 12219-12231 | "agent_id": "finance_accounting.accounting_close.accounting_close_core.agent227_whink227" |
| E431 | packages/org-kit/organization/workforce_registry.json | 12275-12287 | "agent_id": "finance_accounting.accounting_close.accounting_close_core.agent228_whink228" |
| E432 | packages/org-kit/organization/workforce_registry.json | 12331-12343 | "agent_id": "finance_accounting.financial_reporting_consolidation.financial_reporting_consolidation_core.agent229_whink229" |
| E433 | packages/org-kit/organization/workforce_registry.json | 12386-12398 | "agent_id": "finance_accounting.financial_reporting_consolidation.financial_reporting_consolidation_core.agent230_whink230" |
| E434 | packages/org-kit/organization/workforce_registry.json | 12441-12453 | "agent_id": "finance_accounting.fp_a_budgeting_forecasting.fp_a_budgeting_forecasting_core.agent231_whink231" |
| E435 | packages/org-kit/organization/workforce_registry.json | 12497-12509 | "agent_id": "finance_accounting.fp_a_budgeting_forecasting.fp_a_budgeting_forecasting_core.agent232_whink232" |
| E436 | packages/org-kit/organization/workforce_registry.json | 12553-12565 | "agent_id": "finance_accounting.treasury_capital_management.treasury_capital_management_core.agent233_whink233" |
| E437 | packages/org-kit/organization/workforce_registry.json | 12609-12621 | "agent_id": "finance_accounting.treasury_capital_management.treasury_capital_management_core.agent234_whink234" |
| E438 | packages/org-kit/organization/workforce_registry.json | 12665-12677 | "agent_id": "finance_accounting.tax.tax_core.agent235_whink235" |
| E439 | packages/org-kit/organization/workforce_registry.json | 12721-12733 | "agent_id": "finance_accounting.tax.tax_core.agent236_whink236" |
| E440 | packages/org-kit/organization/workforce_registry.json | 12777-12789 | "agent_id": "finance_accounting.billing_accounts_receivable_accounts_payable.billing_accounts_receivable_accounts_payable_core.agent237_whink237" |
| E441 | packages/org-kit/organization/workforce_registry.json | 12833-12845 | "agent_id": "finance_accounting.billing_accounts_receivable_accounts_payable.billing_accounts_receivable_accounts_payable_core.agent238_whink238" |
| E442 | packages/org-kit/organization/workforce_registry.json | 12889-12901 | "agent_id": "finance_accounting.payroll_finance.payroll_finance_core.agent239_whink239" |
| E443 | packages/org-kit/organization/workforce_registry.json | 12944-12956 | "agent_id": "finance_accounting.payroll_finance.payroll_finance_core.agent240_whink240" |
| E444 | packages/org-kit/organization/workforce_registry.json | 12999-13011 | "agent_id": "finance_accounting.financial_controls_management_accounting.financial_controls_management_accounting_core.agent241_whink241" |
| E445 | packages/org-kit/organization/workforce_registry.json | 13055-13067 | "agent_id": "finance_accounting.financial_controls_management_accounting.financial_controls_management_accounting_core.agent242_whink242" |
| E446 | packages/org-kit/organization/workforce_registry.json | 13111-13123 | "agent_id": "legal_risk_governance.corporate_commercial_legal.corporate_commercial_legal_core.agent243_whink243" |
| E447 | packages/org-kit/organization/workforce_registry.json | 13166-13178 | "agent_id": "legal_risk_governance.corporate_commercial_legal.corporate_commercial_legal_core.agent244_whink244" |
| E448 | packages/org-kit/organization/workforce_registry.json | 13221-13233 | "agent_id": "legal_risk_governance.contracts_transactions.contracts_transactions_core.agent245_whink245" |
| E449 | packages/org-kit/organization/workforce_registry.json | 13276-13288 | "agent_id": "legal_risk_governance.contracts_transactions.contracts_transactions_core.agent246_whink246" |
| E450 | packages/org-kit/organization/workforce_registry.json | 13331-13343 | "agent_id": "legal_risk_governance.intellectual_property_technology_legal.intellectual_property_technology_legal_core.agent247_whink247" |
| E451 | packages/org-kit/organization/workforce_registry.json | 13387-13399 | "agent_id": "legal_risk_governance.intellectual_property_technology_legal.intellectual_property_technology_legal_core.agent248_whink248" |
| E452 | packages/org-kit/organization/workforce_registry.json | 13443-13455 | "agent_id": "legal_risk_governance.employment_legal.employment_legal_core.agent249_whink249" |
| E453 | packages/org-kit/organization/workforce_registry.json | 13498-13510 | "agent_id": "legal_risk_governance.employment_legal.employment_legal_core.agent250_whink250" |
| E454 | packages/org-kit/organization/workforce_registry.json | 13553-13565 | "agent_id": "legal_risk_governance.privacy_data_protection.privacy_data_protection_core.agent251_whink251" |
| E455 | packages/org-kit/organization/workforce_registry.json | 13609-13621 | "agent_id": "legal_risk_governance.privacy_data_protection.privacy_data_protection_core.agent252_whink252" |
| E456 | packages/org-kit/organization/workforce_registry.json | 13665-13677 | "agent_id": "legal_risk_governance.enterprise_risk_management.enterprise_risk_management_core.agent253_whink253" |
| E457 | packages/org-kit/organization/workforce_registry.json | 13720-13732 | "agent_id": "legal_risk_governance.enterprise_risk_management.enterprise_risk_management_core.agent254_whink254" |
| E458 | packages/org-kit/organization/workforce_registry.json | 13775-13787 | "agent_id": "legal_risk_governance.governance_board_affairs.governance_board_affairs_core.agent255_whink255" |
| E459 | packages/org-kit/organization/workforce_registry.json | 13830-13842 | "agent_id": "legal_risk_governance.governance_board_affairs.governance_board_affairs_core.agent256_whink256" |
| E460 | packages/org-kit/organization/workforce_registry.json | 13885-13897 | "agent_id": "legal_risk_governance.regulatory_compliance_ethics.regulatory_compliance_ethics_core.agent257_whink257" |
| E461 | packages/org-kit/organization/workforce_registry.json | 13940-13952 | "agent_id": "legal_risk_governance.regulatory_compliance_ethics.regulatory_compliance_ethics_core.agent258_whink258" |
| E462 | packages/org-kit/organization/workforce_registry.json | 13995-14007 | "agent_id": "legal_risk_governance.records_information_governance.records_information_governance_core.agent259_whink259" |
| E463 | packages/org-kit/organization/workforce_registry.json | 14050-14062 | "agent_id": "legal_risk_governance.records_information_governance.records_information_governance_core.agent260_whink260" |
| E464 | packages/org-kit/organization/workforce_registry.json | 14105-14117 | "agent_id": "people_culture.hr_business_partnering_people_operations.hr_business_partnering_people_operations_core.agent261_whink261" |
| E465 | packages/org-kit/organization/workforce_registry.json | 14160-14172 | "agent_id": "people_culture.hr_business_partnering_people_operations.hr_business_partnering_people_operations_core.agent262_whink262" |
| E466 | packages/org-kit/organization/workforce_registry.json | 14215-14227 | "agent_id": "people_culture.talent_acquisition.talent_acquisition_core.agent263_whink263" |
| E467 | packages/org-kit/organization/workforce_registry.json | 14270-14282 | "agent_id": "people_culture.talent_acquisition.talent_acquisition_core.agent264_whink264" |
| E468 | packages/org-kit/organization/workforce_registry.json | 14325-14337 | "agent_id": "people_culture.onboarding_employee_experience.onboarding_employee_experience_core.agent265_whink265" |
| E469 | packages/org-kit/organization/workforce_registry.json | 14380-14392 | "agent_id": "people_culture.onboarding_employee_experience.onboarding_employee_experience_core.agent266_whink266" |
| E470 | packages/org-kit/organization/workforce_registry.json | 14435-14447 | "agent_id": "people_culture.employee_relations.employee_relations_core.agent267_whink267" |
| E471 | packages/org-kit/organization/workforce_registry.json | 14490-14502 | "agent_id": "people_culture.employee_relations.employee_relations_core.agent268_whink268" |
| E472 | packages/org-kit/organization/workforce_registry.json | 14545-14557 | "agent_id": "people_culture.total_rewards_compensation_benefits.total_rewards_compensation_benefits_core.agent269_whink269" |
| E473 | packages/org-kit/organization/workforce_registry.json | 14600-14612 | "agent_id": "people_culture.total_rewards_compensation_benefits.total_rewards_compensation_benefits_core.agent270_whink270" |
| E474 | packages/org-kit/organization/workforce_registry.json | 14655-14667 | "agent_id": "people_culture.performance_talent_management.performance_talent_management_core.agent271_whink271" |
| E475 | packages/org-kit/organization/workforce_registry.json | 14710-14722 | "agent_id": "people_culture.performance_talent_management.performance_talent_management_core.agent272_whink272" |
| E476 | packages/org-kit/organization/workforce_registry.json | 14765-14777 | "agent_id": "people_culture.learning_development.learning_development_core.agent273_whink273" |
| E477 | packages/org-kit/organization/workforce_registry.json | 14820-14832 | "agent_id": "people_culture.learning_development.learning_development_core.agent274_whink274" |
| E478 | packages/org-kit/organization/workforce_registry.json | 14875-14887 | "agent_id": "people_culture.organizational_design_workforce_planning.organizational_design_workforce_planning_core.agent275_whink275" |
| E479 | packages/org-kit/organization/workforce_registry.json | 14930-14942 | "agent_id": "people_culture.organizational_design_workforce_planning.organizational_design_workforce_planning_core.agent276_whink276" |
| E480 | packages/org-kit/organization/workforce_registry.json | 14985-14997 | "agent_id": "people_culture.people_analytics.people_analytics_core.agent277_whink277" |
| E481 | packages/org-kit/organization/workforce_registry.json | 15040-15052 | "agent_id": "people_culture.people_analytics.people_analytics_core.agent278_whink278" |
| E482 | packages/org-kit/organization/workforce_registry.json | 15095-15107 | "agent_id": "people_culture.ai_workforce_organizational_intelligence.ai_workforce_organizational_intelligence_core.agent279_whink279" |
| E483 | packages/org-kit/organization/workforce_registry.json | 15151-15163 | "agent_id": "people_culture.ai_workforce_organizational_intelligence.ai_workforce_organizational_intelligence_core.agent280_whink280" |
| E484 | packages/org-kit/organization/workforce_registry.json | 15207-15219 | "agent_id": "operations_procurement.corporate_operations.corporate_operations_core.agent281_whink281" |
| E485 | packages/org-kit/organization/workforce_registry.json | 15262-15274 | "agent_id": "operations_procurement.corporate_operations.corporate_operations_core.agent282_whink282" |
| E486 | packages/org-kit/organization/workforce_registry.json | 15317-15329 | "agent_id": "operations_procurement.business_process_continuous_improvement.business_process_continuous_improvement_core.agent283_whink283" |
| E487 | packages/org-kit/organization/workforce_registry.json | 15372-15384 | "agent_id": "operations_procurement.business_process_continuous_improvement.business_process_continuous_improvement_core.agent284_whink284" |
| E488 | packages/org-kit/organization/workforce_registry.json | 15427-15439 | "agent_id": "operations_procurement.procurement_strategic_sourcing.procurement_strategic_sourcing_core.agent285_whink285" |
| E489 | packages/org-kit/organization/workforce_registry.json | 15482-15494 | "agent_id": "operations_procurement.procurement_strategic_sourcing.procurement_strategic_sourcing_core.agent286_whink286" |
| E490 | packages/org-kit/organization/workforce_registry.json | 15537-15549 | "agent_id": "operations_procurement.vendor_supplier_management.vendor_supplier_management_core.agent287_whink287" |
| E491 | packages/org-kit/organization/workforce_registry.json | 15592-15604 | "agent_id": "operations_procurement.vendor_supplier_management.vendor_supplier_management_core.agent288_whink288" |
| E492 | packages/org-kit/organization/workforce_registry.json | 15647-15659 | "agent_id": "operations_procurement.facilities_workplace.facilities_workplace_core.agent289_whink289" |
| E493 | packages/org-kit/organization/workforce_registry.json | 15702-15714 | "agent_id": "operations_procurement.facilities_workplace.facilities_workplace_core.agent290_whink290" |
| E494 | packages/org-kit/organization/workforce_registry.json | 15757-15769 | "agent_id": "operations_procurement.real_estate_physical_infrastructure.real_estate_physical_infrastructure_core.agent291_whink291" |
| E495 | packages/org-kit/organization/workforce_registry.json | 15812-15824 | "agent_id": "operations_procurement.real_estate_physical_infrastructure.real_estate_physical_infrastructure_core.agent292_whink292" |
| E496 | packages/org-kit/organization/workforce_registry.json | 15867-15879 | "agent_id": "operations_procurement.quality_management.quality_management_core.agent293_whink293" |
| E497 | packages/org-kit/organization/workforce_registry.json | 15922-15934 | "agent_id": "operations_procurement.quality_management.quality_management_core.agent294_whink294" |
| E498 | packages/org-kit/organization/workforce_registry.json | 15977-15989 | "agent_id": "operations_procurement.operational_performance_service_excellence.operational_performance_service_excellence_core.agent295_whink295" |
| E499 | packages/org-kit/organization/workforce_registry.json | 16032-16044 | "agent_id": "operations_procurement.operational_performance_service_excellence.operational_performance_service_excellence_core.agent296_whink296" |
| E500 | packages/org-kit/organization/workforce_registry.json | 16087-16099 | "agent_id": "customer_organization.customer_success.customer_success_core.agent297_whink297" |
| E501 | packages/org-kit/organization/workforce_registry.json | 16142-16154 | "agent_id": "customer_organization.customer_success.customer_success_core.agent298_whink298" |
| E502 | packages/org-kit/organization/workforce_registry.json | 16197-16209 | "agent_id": "customer_organization.customer_onboarding_implementation.customer_onboarding_implementation_core.agent299_whink299" |
| E503 | packages/org-kit/organization/workforce_registry.json | 16252-16264 | "agent_id": "customer_organization.customer_onboarding_implementation.customer_onboarding_implementation_core.agent300_whink300" |
| E504 | packages/org-kit/organization/workforce_registry.json | 16307-16319 | "agent_id": "customer_organization.professional_services.professional_services_core.agent301_whink301" |
| E505 | packages/org-kit/organization/workforce_registry.json | 16362-16374 | "agent_id": "customer_organization.professional_services.professional_services_core.agent302_whink302" |
| E506 | packages/org-kit/organization/workforce_registry.json | 16417-16429 | "agent_id": "customer_organization.technical_account_management.technical_account_management_core.agent303_whink303" |
| E507 | packages/org-kit/organization/workforce_registry.json | 16472-16484 | "agent_id": "customer_organization.technical_account_management.technical_account_management_core.agent304_whink304" |
| E508 | packages/org-kit/organization/workforce_registry.json | 16527-16539 | "agent_id": "customer_organization.customer_support_service_desk.customer_support_service_desk_core.agent305_whink305" |
| E509 | packages/org-kit/organization/workforce_registry.json | 16582-16594 | "agent_id": "customer_organization.customer_support_service_desk.customer_support_service_desk_core.agent306_whink306" |
| E510 | packages/org-kit/organization/workforce_registry.json | 16637-16649 | "agent_id": "customer_organization.customer_education_adoption.customer_education_adoption_core.agent307_whink307" |
| E511 | packages/org-kit/organization/workforce_registry.json | 16692-16704 | "agent_id": "customer_organization.customer_education_adoption.customer_education_adoption_core.agent308_whink308" |
| E512 | packages/org-kit/organization/workforce_registry.json | 16747-16759 | "agent_id": "customer_organization.renewals_expansion.renewals_expansion_core.agent309_whink309" |
| E513 | packages/org-kit/organization/workforce_registry.json | 16802-16814 | "agent_id": "customer_organization.renewals_expansion.renewals_expansion_core.agent310_whink310" |
| E514 | packages/org-kit/organization/workforce_registry.json | 16857-16869 | "agent_id": "customer_organization.customer_health_escalation_management.customer_health_escalation_management_core.agent311_whink311" |
| E515 | packages/org-kit/organization/workforce_registry.json | 16912-16924 | "agent_id": "customer_organization.customer_health_escalation_management.customer_health_escalation_management_core.agent312_whink312" |
| E516 | packages/org-kit/organization/workforce_registry.json | 16967-16979 | "agent_id": "internal_audit_assurance.financial_audit_assurance.financial_audit_assurance_core.agent313_whink313" |
| E517 | packages/org-kit/organization/workforce_registry.json | 17022-17034 | "agent_id": "internal_audit_assurance.financial_audit_assurance.financial_audit_assurance_core.agent314_whink314" |
| E518 | packages/org-kit/organization/workforce_registry.json | 17077-17089 | "agent_id": "internal_audit_assurance.technology_audit.technology_audit_core.agent315_whink315" |
| E519 | packages/org-kit/organization/workforce_registry.json | 17132-17144 | "agent_id": "internal_audit_assurance.technology_audit.technology_audit_core.agent316_whink316" |
| E520 | packages/org-kit/organization/workforce_registry.json | 17187-17199 | "agent_id": "internal_audit_assurance.cybersecurity_assurance.cybersecurity_assurance_core.agent317_whink317" |
| E521 | packages/org-kit/organization/workforce_registry.json | 17242-17254 | "agent_id": "internal_audit_assurance.cybersecurity_assurance.cybersecurity_assurance_core.agent318_whink318" |
| E522 | packages/org-kit/organization/workforce_registry.json | 17297-17309 | "agent_id": "internal_audit_assurance.operational_audit.operational_audit_core.agent319_whink319" |
| E523 | packages/org-kit/organization/workforce_registry.json | 17352-17364 | "agent_id": "internal_audit_assurance.operational_audit.operational_audit_core.agent320_whink320" |
| E524 | packages/org-kit/organization/workforce_registry.json | 17407-17419 | "agent_id": "internal_audit_assurance.compliance_governance_audit.compliance_governance_audit_core.agent321_whink321" |
| E525 | packages/org-kit/organization/workforce_registry.json | 17460-17472 | "agent_id": "internal_audit_assurance.compliance_governance_audit.compliance_governance_audit_core.agent322_whink322" |
| E526 | packages/org-kit/organization/workforce_registry.json | 17513-17525 | "agent_id": "internal_audit_assurance.controls_assurance.controls_assurance_core.agent323_whink323" |
| E527 | packages/org-kit/organization/workforce_registry.json | 17568-17580 | "agent_id": "internal_audit_assurance.controls_assurance.controls_assurance_core.agent324_whink324" |
| E528 | packages/org-kit/organization/workforce_registry.json | 17623-17635 | "agent_id": "internal_audit_assurance.ai_systems_agent_governance_audit.ai_systems_agent_governance_audit_core.agent325_whink325" |
| E529 | packages/org-kit/organization/workforce_registry.json | 17678-17690 | "agent_id": "internal_audit_assurance.ai_systems_agent_governance_audit.ai_systems_agent_governance_audit_core.agent326_whink326" |
| E530 | packages/org-kit/organization/team_registry.json | 3-15 | "team_id": "executive_office_corporate_strategy.office_of_the_ceo_executive_operations.office_of_the_ceo_executive_operations_core" |
| E531 | packages/org-kit/organization/team_registry.json | 24-36 | "team_id": "executive_office_corporate_strategy.corporate_strategy_strategic_planning.corporate_strategy_strategic_planning_core" |
| E532 | packages/org-kit/organization/team_registry.json | 45-57 | "team_id": "executive_office_corporate_strategy.corporate_development_strategic_investments.corporate_development_strategic_investments_core" |
| E533 | packages/org-kit/organization/team_registry.json | 66-78 | "team_id": "executive_office_corporate_strategy.enterprise_transformation_strategic_programs.enterprise_transformation_strategic_programs_core" |
| E534 | packages/org-kit/organization/team_registry.json | 86-98 | "team_id": "executive_office_corporate_strategy.enterprise_business_intelligence_performance.enterprise_business_intelligence_performance_core" |
| E535 | packages/org-kit/organization/team_registry.json | 106-118 | "team_id": "executive_office_corporate_strategy.strategic_portfolio_pmo.strategic_portfolio_pmo_core" |
| E536 | packages/org-kit/organization/team_registry.json | 126-138 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.atlas" |
| E537 | packages/org-kit/organization/team_registry.json | 142-154 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.nova" |
| E538 | packages/org-kit/organization/team_registry.json | 158-170 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.vanta" |
| E539 | packages/org-kit/organization/team_registry.json | 174-186 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.oracle" |
| E540 | packages/org-kit/organization/team_registry.json | 190-202 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.quanta" |
| E541 | packages/org-kit/organization/team_registry.json | 206-218 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.pulse" |
| E542 | packages/org-kit/organization/team_registry.json | 222-234 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.verity" |
| E543 | packages/org-kit/organization/team_registry.json | 238-250 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.forge" |
| E544 | packages/org-kit/organization/team_registry.json | 254-266 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.rhodes" |
| E545 | packages/org-kit/organization/team_registry.json | 270-282 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.prism" |
| E546 | packages/org-kit/organization/team_registry.json | 286-298 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.halo" |
| E547 | packages/org-kit/organization/team_registry.json | 302-314 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.titan" |
| E548 | packages/org-kit/organization/team_registry.json | 318-330 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.magnet" |
| E549 | packages/org-kit/organization/team_registry.json | 334-346 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.flux" |
| E550 | packages/org-kit/organization/team_registry.json | 350-362 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.livewire" |
| E551 | packages/org-kit/organization/team_registry.json | 366-378 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.echo" |
| E552 | packages/org-kit/organization/team_registry.json | 382-394 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.cut" |
| E553 | packages/org-kit/organization/team_registry.json | 398-410 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.sonic" |
| E554 | packages/org-kit/organization/team_registry.json | 414-426 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.signal" |
| E555 | packages/org-kit/organization/team_registry.json | 430-442 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.mosaic" |
| E556 | packages/org-kit/organization/team_registry.json | 446-458 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.chorus" |
| E557 | packages/org-kit/organization/team_registry.json | 462-474 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.shield" |
| E558 | packages/org-kit/organization/team_registry.json | 478-490 | "team_id": "whink_group_marketing_intelligence.brand_media_audience_intelligence.mirror" |
| E559 | packages/org-kit/organization/team_registry.json | 494-506 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.vector" |
| E560 | packages/org-kit/organization/team_registry.json | 510-522 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.nexus" |
| E561 | packages/org-kit/organization/team_registry.json | 526-538 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.ledger" |
| E562 | packages/org-kit/organization/team_registry.json | 542-554 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.conductor" |
| E563 | packages/org-kit/organization/team_registry.json | 558-570 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.sentinel" |
| E564 | packages/org-kit/organization/team_registry.json | 574-586 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.muse" |
| E565 | packages/org-kit/organization/team_registry.json | 590-602 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.propel" |
| E566 | packages/org-kit/organization/team_registry.json | 606-618 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.demand" |
| E567 | packages/org-kit/organization/team_registry.json | 622-634 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.revops" |
| E568 | packages/org-kit/organization/team_registry.json | 638-650 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.lifecycle" |
| E569 | packages/org-kit/organization/team_registry.json | 654-666 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.convert" |
| E570 | packages/org-kit/organization/team_registry.json | 670-682 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.authority" |
| E571 | packages/org-kit/organization/team_registry.json | 686-698 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.enable" |
| E572 | packages/org-kit/organization/team_registry.json | 702-714 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.advocate" |
| E573 | packages/org-kit/organization/team_registry.json | 718-730 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.field" |
| E574 | packages/org-kit/organization/team_registry.json | 734-746 | "team_id": "whink_group_marketing_intelligence.commercial_growth_marketing_intelligence.compass" |
| E575 | packages/org-kit/organization/team_registry.json | 750-762 | "team_id": "sales_revenue.enterprise_sales.enterprise_sales_core" |
| E576 | packages/org-kit/organization/team_registry.json | 770-782 | "team_id": "sales_revenue.smb_mid_market_sales.smb_mid_market_sales_core" |
| E577 | packages/org-kit/organization/team_registry.json | 790-802 | "team_id": "sales_revenue.sales_development_pipeline_generation.sales_development_pipeline_generation_core" |
| E578 | packages/org-kit/organization/team_registry.json | 810-822 | "team_id": "sales_revenue.solutions_technical_sales.solutions_technical_sales_core" |
| E579 | packages/org-kit/organization/team_registry.json | 830-842 | "team_id": "sales_revenue.channel_partner_sales.channel_partner_sales_core" |
| E580 | packages/org-kit/organization/team_registry.json | 850-862 | "team_id": "sales_revenue.account_management_expansion.account_management_expansion_core" |
| E581 | packages/org-kit/organization/team_registry.json | 870-882 | "team_id": "sales_revenue.revenue_operations_sales_intelligence.revenue_operations_sales_intelligence_core" |
| E582 | packages/org-kit/organization/team_registry.json | 891-903 | "team_id": "product.product_strategy_portfolio.product_strategy_portfolio_core" |
| E583 | packages/org-kit/organization/team_registry.json | 911-923 | "team_id": "product.product_management.product_management_core" |
| E584 | packages/org-kit/organization/team_registry.json | 931-943 | "team_id": "product.product_operations.product_operations_core" |
| E585 | packages/org-kit/organization/team_registry.json | 951-963 | "team_id": "product.product_research_customer_discovery.product_research_customer_discovery_core" |
| E586 | packages/org-kit/organization/team_registry.json | 971-983 | "team_id": "product.product_analytics_intelligence.product_analytics_intelligence_core" |
| E587 | packages/org-kit/organization/team_registry.json | 991-1003 | "team_id": "product.user_experience_service_design.user_experience_service_design_core" |
| E588 | packages/org-kit/organization/team_registry.json | 1011-1023 | "team_id": "product.release_product_lifecycle_management.release_product_lifecycle_management_core" |
| E589 | packages/org-kit/organization/team_registry.json | 1031-1043 | "team_id": "engineering_technology.software_engineering.software_engineering_core" |
| E590 | packages/org-kit/organization/team_registry.json | 1051-1063 | "team_id": "engineering_technology.mobile_client_platforms.mobile_client_platforms_core" |
| E591 | packages/org-kit/organization/team_registry.json | 1071-1083 | "team_id": "engineering_technology.platform_engineering_core_infrastructure.platform_engineering_core_infrastructure_core" |
| E592 | packages/org-kit/organization/team_registry.json | 1091-1103 | "team_id": "engineering_technology.architecture_technical_strategy.architecture_technical_strategy_core" |
| E593 | packages/org-kit/organization/team_registry.json | 1111-1123 | "team_id": "engineering_technology.api_integrations_developer_ecosystem.api_integrations_developer_ecosystem_core" |
| E594 | packages/org-kit/organization/team_registry.json | 1131-1143 | "team_id": "engineering_technology.devops_sre_cloud_engineering.devops_sre_cloud_engineering_core" |
| E595 | packages/org-kit/organization/team_registry.json | 1152-1164 | "team_id": "engineering_technology.quality_engineering_test_automation.quality_engineering_test_automation_core" |
| E596 | packages/org-kit/organization/team_registry.json | 1172-1184 | "team_id": "engineering_technology.release_engineering_configuration_management.release_engineering_configuration_management_core" |
| E597 | packages/org-kit/organization/team_registry.json | 1192-1204 | "team_id": "engineering_technology.engineering_productivity_developer_experience.engineering_productivity_developer_experience_core" |
| E598 | packages/org-kit/organization/team_registry.json | 1212-1224 | "team_id": "engineering_technology.technical_documentation_engineering_knowledge.technical_documentation_engineering_knowledge_core" |
| E599 | packages/org-kit/organization/team_registry.json | 1232-1244 | "team_id": "data_artificial_intelligence.ai_engineering_applied_intelligence.ai_engineering_applied_intelligence_core" |
| E600 | packages/org-kit/organization/team_registry.json | 1252-1264 | "team_id": "data_artificial_intelligence.agent_architecture_ai_workforce_systems.agent_architecture_ai_workforce_systems_core" |
| E601 | packages/org-kit/organization/team_registry.json | 1273-1285 | "team_id": "data_artificial_intelligence.skill_engineering_tool_orchestration.skill_engineering_tool_orchestration_core" |
| E602 | packages/org-kit/organization/team_registry.json | 1293-1305 | "team_id": "data_artificial_intelligence.machine_learning_model_development.machine_learning_model_development_core" |
| E603 | packages/org-kit/organization/team_registry.json | 1313-1325 | "team_id": "data_artificial_intelligence.model_evaluation_reliability_intelligence_quality.model_evaluation_reliability_intelligence_quality_core" |
| E604 | packages/org-kit/organization/team_registry.json | 1333-1345 | "team_id": "data_artificial_intelligence.model_routing_ai_infrastructure.model_routing_ai_infrastructure_core" |
| E605 | packages/org-kit/organization/team_registry.json | 1353-1365 | "team_id": "data_artificial_intelligence.data_engineering_data_platforms.data_engineering_data_platforms_core" |
| E606 | packages/org-kit/organization/team_registry.json | 1373-1385 | "team_id": "data_artificial_intelligence.data_science_decision_intelligence.data_science_decision_intelligence_core" |
| E607 | packages/org-kit/organization/team_registry.json | 1393-1405 | "team_id": "data_artificial_intelligence.knowledge_systems_enterprise_memory.knowledge_systems_enterprise_memory_core" |
| E608 | packages/org-kit/organization/team_registry.json | 1414-1426 | "team_id": "data_artificial_intelligence.ai_governance_technology_responsible_ai_systems.ai_governance_technology_responsible_ai_systems_core" |
| E609 | packages/org-kit/organization/team_registry.json | 1434-1446 | "team_id": "data_artificial_intelligence.ai_finops_usage_intelligence.ai_finops_usage_intelligence_core" |
| E610 | packages/org-kit/organization/team_registry.json | 1454-1466 | "team_id": "data_artificial_intelligence.ai_platform_operations_observability.ai_platform_operations_observability_core" |
| E611 | packages/org-kit/organization/team_registry.json | 1474-1486 | "team_id": "research_development.applied_research.applied_research_core" |
| E612 | packages/org-kit/organization/team_registry.json | 1494-1506 | "team_id": "research_development.emerging_technologies_future_systems.emerging_technologies_future_systems_core" |
| E613 | packages/org-kit/organization/team_registry.json | 1513-1525 | "team_id": "research_development.experimental_engineering_prototyping.experimental_engineering_prototyping_core" |
| E614 | packages/org-kit/organization/team_registry.json | 1532-1544 | "team_id": "research_development.ai_autonomous_systems_research.ai_autonomous_systems_research_core" |
| E615 | packages/org-kit/organization/team_registry.json | 1551-1563 | "team_id": "research_development.humancomputer_interaction_future_interfaces.humancomputer_interaction_future_interfaces_core" |
| E616 | packages/org-kit/organization/team_registry.json | 1571-1583 | "team_id": "research_development.advanced_computing_systems_research.advanced_computing_systems_research_core" |
| E617 | packages/org-kit/organization/team_registry.json | 1590-1602 | "team_id": "research_development.research_partnerships_academic_collaboration.research_partnerships_academic_collaboration_core" |
| E618 | packages/org-kit/organization/team_registry.json | 1609-1621 | "team_id": "research_development.innovation_incubation_technology_transfer.innovation_incubation_technology_transfer_core" |
| E619 | packages/org-kit/organization/team_registry.json | 1628-1640 | "team_id": "research_development.intellectual_property_discovery_invention_management.intellectual_property_discovery_invention_management_core" |
| E620 | packages/org-kit/organization/team_registry.json | 1647-1659 | "team_id": "research_development.research_intelligence_scientific_foresight.research_intelligence_scientific_foresight_core" |
| E621 | packages/org-kit/organization/team_registry.json | 1666-1678 | "team_id": "information_technology.enterprise_applications_business_systems.enterprise_applications_business_systems_core" |
| E622 | packages/org-kit/organization/team_registry.json | 1685-1697 | "team_id": "information_technology.end_user_computing_workplace_technology.end_user_computing_workplace_technology_core" |
| E623 | packages/org-kit/organization/team_registry.json | 1704-1716 | "team_id": "information_technology.it_service_management_service_desk.it_service_management_service_desk_core" |
| E624 | packages/org-kit/organization/team_registry.json | 1724-1736 | "team_id": "information_technology.cloud_infrastructure_operations.cloud_infrastructure_operations_core" |
| E625 | packages/org-kit/organization/team_registry.json | 1743-1755 | "team_id": "information_technology.network_connectivity_services.network_connectivity_services_core" |
| E626 | packages/org-kit/organization/team_registry.json | 1762-1774 | "team_id": "information_technology.identity_access_administration.identity_access_administration_core" |
| E627 | packages/org-kit/organization/team_registry.json | 1782-1794 | "team_id": "information_technology.collaboration_productivity_platforms.collaboration_productivity_platforms_core" |
| E628 | packages/org-kit/organization/team_registry.json | 1801-1813 | "team_id": "information_technology.it_asset_configuration_management.it_asset_configuration_management_core" |
| E629 | packages/org-kit/organization/team_registry.json | 1820-1832 | "team_id": "information_technology.enterprise_systems_administration.enterprise_systems_administration_core" |
| E630 | packages/org-kit/organization/team_registry.json | 1839-1851 | "team_id": "information_technology.it_architecture_technology_standards.it_architecture_technology_standards_core" |
| E631 | packages/org-kit/organization/team_registry.json | 1858-1870 | "team_id": "cybersecurity_resilience.security_operations_incident_response.security_operations_incident_response_core" |
| E632 | packages/org-kit/organization/team_registry.json | 1878-1890 | "team_id": "cybersecurity_resilience.threat_intelligence_threat_hunting.threat_intelligence_threat_hunting_core" |
| E633 | packages/org-kit/organization/team_registry.json | 1897-1909 | "team_id": "cybersecurity_resilience.identity_security_privileged_access.identity_security_privileged_access_core" |
| E634 | packages/org-kit/organization/team_registry.json | 1917-1929 | "team_id": "cybersecurity_resilience.security_engineering.security_engineering_core" |
| E635 | packages/org-kit/organization/team_registry.json | 1936-1948 | "team_id": "cybersecurity_resilience.cloud_infrastructure_security.cloud_infrastructure_security_core" |
| E636 | packages/org-kit/organization/team_registry.json | 1955-1967 | "team_id": "cybersecurity_resilience.application_product_security.application_product_security_core" |
| E637 | packages/org-kit/organization/team_registry.json | 1974-1986 | "team_id": "cybersecurity_resilience.security_architecture.security_architecture_core" |
| E638 | packages/org-kit/organization/team_registry.json | 1993-2005 | "team_id": "cybersecurity_resilience.vulnerability_exposure_management.vulnerability_exposure_management_core" |
| E639 | packages/org-kit/organization/team_registry.json | 2012-2024 | "team_id": "cybersecurity_resilience.data_security_information_protection.data_security_information_protection_core" |
| E640 | packages/org-kit/organization/team_registry.json | 2032-2044 | "team_id": "cybersecurity_resilience.third_party_supply_chain_security.third_party_supply_chain_security_core" |
| E641 | packages/org-kit/organization/team_registry.json | 2051-2063 | "team_id": "cybersecurity_resilience.cyber_risk_security_governance.cyber_risk_security_governance_core" |
| E642 | packages/org-kit/organization/team_registry.json | 2070-2082 | "team_id": "cybersecurity_resilience.business_continuity_disaster_recovery_cyber_resilience.business_continuity_disaster_recovery_cyber_resilience_core" |
| E643 | packages/org-kit/organization/team_registry.json | 2089-2101 | "team_id": "finance_accounting.accounting_close.accounting_close_core" |
| E644 | packages/org-kit/organization/team_registry.json | 2109-2121 | "team_id": "finance_accounting.financial_reporting_consolidation.financial_reporting_consolidation_core" |
| E645 | packages/org-kit/organization/team_registry.json | 2128-2140 | "team_id": "finance_accounting.fp_a_budgeting_forecasting.fp_a_budgeting_forecasting_core" |
| E646 | packages/org-kit/organization/team_registry.json | 2148-2160 | "team_id": "finance_accounting.treasury_capital_management.treasury_capital_management_core" |
| E647 | packages/org-kit/organization/team_registry.json | 2168-2180 | "team_id": "finance_accounting.tax.tax_core" |
| E648 | packages/org-kit/organization/team_registry.json | 2188-2200 | "team_id": "finance_accounting.billing_accounts_receivable_accounts_payable.billing_accounts_receivable_accounts_payable_core" |
| E649 | packages/org-kit/organization/team_registry.json | 2208-2220 | "team_id": "finance_accounting.payroll_finance.payroll_finance_core" |
| E650 | packages/org-kit/organization/team_registry.json | 2227-2239 | "team_id": "finance_accounting.financial_controls_management_accounting.financial_controls_management_accounting_core" |
| E651 | packages/org-kit/organization/team_registry.json | 2247-2259 | "team_id": "legal_risk_governance.corporate_commercial_legal.corporate_commercial_legal_core" |
| E652 | packages/org-kit/organization/team_registry.json | 2266-2278 | "team_id": "legal_risk_governance.contracts_transactions.contracts_transactions_core" |
| E653 | packages/org-kit/organization/team_registry.json | 2285-2297 | "team_id": "legal_risk_governance.intellectual_property_technology_legal.intellectual_property_technology_legal_core" |
| E654 | packages/org-kit/organization/team_registry.json | 2305-2317 | "team_id": "legal_risk_governance.employment_legal.employment_legal_core" |
| E655 | packages/org-kit/organization/team_registry.json | 2324-2336 | "team_id": "legal_risk_governance.privacy_data_protection.privacy_data_protection_core" |
| E656 | packages/org-kit/organization/team_registry.json | 2344-2356 | "team_id": "legal_risk_governance.enterprise_risk_management.enterprise_risk_management_core" |
| E657 | packages/org-kit/organization/team_registry.json | 2363-2375 | "team_id": "legal_risk_governance.governance_board_affairs.governance_board_affairs_core" |
| E658 | packages/org-kit/organization/team_registry.json | 2382-2394 | "team_id": "legal_risk_governance.regulatory_compliance_ethics.regulatory_compliance_ethics_core" |
| E659 | packages/org-kit/organization/team_registry.json | 2401-2413 | "team_id": "legal_risk_governance.records_information_governance.records_information_governance_core" |
| E660 | packages/org-kit/organization/team_registry.json | 2420-2432 | "team_id": "people_culture.hr_business_partnering_people_operations.hr_business_partnering_people_operations_core" |
| E661 | packages/org-kit/organization/team_registry.json | 2439-2451 | "team_id": "people_culture.talent_acquisition.talent_acquisition_core" |
| E662 | packages/org-kit/organization/team_registry.json | 2458-2470 | "team_id": "people_culture.onboarding_employee_experience.onboarding_employee_experience_core" |
| E663 | packages/org-kit/organization/team_registry.json | 2477-2489 | "team_id": "people_culture.employee_relations.employee_relations_core" |
| E664 | packages/org-kit/organization/team_registry.json | 2496-2508 | "team_id": "people_culture.total_rewards_compensation_benefits.total_rewards_compensation_benefits_core" |
| E665 | packages/org-kit/organization/team_registry.json | 2515-2527 | "team_id": "people_culture.performance_talent_management.performance_talent_management_core" |
| E666 | packages/org-kit/organization/team_registry.json | 2534-2546 | "team_id": "people_culture.learning_development.learning_development_core" |
| E667 | packages/org-kit/organization/team_registry.json | 2553-2565 | "team_id": "people_culture.organizational_design_workforce_planning.organizational_design_workforce_planning_core" |
| E668 | packages/org-kit/organization/team_registry.json | 2572-2584 | "team_id": "people_culture.people_analytics.people_analytics_core" |
| E669 | packages/org-kit/organization/team_registry.json | 2591-2603 | "team_id": "people_culture.ai_workforce_organizational_intelligence.ai_workforce_organizational_intelligence_core" |
| E670 | packages/org-kit/organization/team_registry.json | 2611-2623 | "team_id": "operations_procurement.corporate_operations.corporate_operations_core" |
| E671 | packages/org-kit/organization/team_registry.json | 2630-2642 | "team_id": "operations_procurement.business_process_continuous_improvement.business_process_continuous_improvement_core" |
| E672 | packages/org-kit/organization/team_registry.json | 2649-2661 | "team_id": "operations_procurement.procurement_strategic_sourcing.procurement_strategic_sourcing_core" |
| E673 | packages/org-kit/organization/team_registry.json | 2668-2680 | "team_id": "operations_procurement.vendor_supplier_management.vendor_supplier_management_core" |
| E674 | packages/org-kit/organization/team_registry.json | 2687-2699 | "team_id": "operations_procurement.facilities_workplace.facilities_workplace_core" |
| E675 | packages/org-kit/organization/team_registry.json | 2706-2718 | "team_id": "operations_procurement.real_estate_physical_infrastructure.real_estate_physical_infrastructure_core" |
| E676 | packages/org-kit/organization/team_registry.json | 2725-2737 | "team_id": "operations_procurement.quality_management.quality_management_core" |
| E677 | packages/org-kit/organization/team_registry.json | 2744-2756 | "team_id": "operations_procurement.operational_performance_service_excellence.operational_performance_service_excellence_core" |
| E678 | packages/org-kit/organization/team_registry.json | 2763-2775 | "team_id": "customer_organization.customer_success.customer_success_core" |
| E679 | packages/org-kit/organization/team_registry.json | 2782-2794 | "team_id": "customer_organization.customer_onboarding_implementation.customer_onboarding_implementation_core" |
| E680 | packages/org-kit/organization/team_registry.json | 2801-2813 | "team_id": "customer_organization.professional_services.professional_services_core" |
| E681 | packages/org-kit/organization/team_registry.json | 2820-2832 | "team_id": "customer_organization.technical_account_management.technical_account_management_core" |
| E682 | packages/org-kit/organization/team_registry.json | 2839-2851 | "team_id": "customer_organization.customer_support_service_desk.customer_support_service_desk_core" |
| E683 | packages/org-kit/organization/team_registry.json | 2858-2870 | "team_id": "customer_organization.customer_education_adoption.customer_education_adoption_core" |
| E684 | packages/org-kit/organization/team_registry.json | 2877-2889 | "team_id": "customer_organization.renewals_expansion.renewals_expansion_core" |
| E685 | packages/org-kit/organization/team_registry.json | 2896-2908 | "team_id": "customer_organization.customer_health_escalation_management.customer_health_escalation_management_core" |
| E686 | packages/org-kit/organization/team_registry.json | 2915-2927 | "team_id": "internal_audit_assurance.financial_audit_assurance.financial_audit_assurance_core" |
| E687 | packages/org-kit/organization/team_registry.json | 2934-2946 | "team_id": "internal_audit_assurance.technology_audit.technology_audit_core" |
| E688 | packages/org-kit/organization/team_registry.json | 2953-2965 | "team_id": "internal_audit_assurance.cybersecurity_assurance.cybersecurity_assurance_core" |
| E689 | packages/org-kit/organization/team_registry.json | 2972-2984 | "team_id": "internal_audit_assurance.operational_audit.operational_audit_core" |
| E690 | packages/org-kit/organization/team_registry.json | 2991-3003 | "team_id": "internal_audit_assurance.compliance_governance_audit.compliance_governance_audit_core" |
| E691 | packages/org-kit/organization/team_registry.json | 3009-3021 | "team_id": "internal_audit_assurance.controls_assurance.controls_assurance_core" |
| E692 | packages/org-kit/organization/team_registry.json | 3028-3040 | "team_id": "internal_audit_assurance.ai_systems_agent_governance_audit.ai_systems_agent_governance_audit_core" |
| E693 | packages/org-kit/organization/whink_group_leadership.json | 29-41 | Executive Office & Corporate Strategy |
| E694 | packages/org-kit/organization/whink_group_leadership.json | 32-44 | Office of the CEO & Executive Operations |
| E695 | packages/org-kit/organization/whink_group_leadership.json | 33-45 | Corporate Strategy & Strategic Planning |
| E696 | packages/org-kit/organization/whink_group_leadership.json | 34-46 | Corporate Development & Strategic Investments |
| E697 | packages/org-kit/organization/whink_group_leadership.json | 35-47 | Enterprise Transformation & Strategic Programs |
| E698 | packages/org-kit/organization/whink_group_leadership.json | 36-48 | Enterprise Business Intelligence & Performance |
| E699 | packages/org-kit/organization/whink_group_leadership.json | 37-49 | Strategic Portfolio & PMO |
| E700 | packages/org-kit/organization/whink_group_leadership.json | 41-53 | WHINK Group Marketing Intelligence |
| E701 | packages/org-kit/organization/whink_group_leadership.json | 44-56 | Brand, Media & Audience Intelligence |
| E702 | packages/org-kit/organization/whink_group_leadership.json | 45-57 | Commercial & Growth Marketing Intelligence |
| E703 | packages/org-kit/organization/whink_group_leadership.json | 49-61 | Sales & Revenue |
| E704 | packages/org-kit/organization/whink_group_leadership.json | 52-64 | Enterprise Sales |
| E705 | packages/org-kit/organization/whink_group_leadership.json | 53-65 | SMB & Mid-Market Sales |
| E706 | packages/org-kit/organization/whink_group_leadership.json | 54-66 | Sales Development & Pipeline Generation |
| E707 | packages/org-kit/organization/whink_group_leadership.json | 55-67 | Solutions & Technical Sales |
| E708 | packages/org-kit/organization/whink_group_leadership.json | 56-68 | Channel & Partner Sales |
| E709 | packages/org-kit/organization/whink_group_leadership.json | 57-69 | Account Management & Expansion |
| E710 | packages/org-kit/organization/whink_group_leadership.json | 58-70 | Revenue Operations & Sales Intelligence |
| E711 | packages/org-kit/organization/whink_group_leadership.json | 62-74 | Product |
| E712 | packages/org-kit/organization/whink_group_leadership.json | 65-77 | Product Strategy & Portfolio |
| E713 | packages/org-kit/organization/whink_group_leadership.json | 66-78 | Product Management |
| E714 | packages/org-kit/organization/whink_group_leadership.json | 67-79 | Product Operations |
| E715 | packages/org-kit/organization/whink_group_leadership.json | 68-80 | Product Research & Customer Discovery |
| E716 | packages/org-kit/organization/whink_group_leadership.json | 69-81 | Product Analytics & Intelligence |
| E717 | packages/org-kit/organization/whink_group_leadership.json | 70-82 | User Experience & Service Design |
| E718 | packages/org-kit/organization/whink_group_leadership.json | 71-83 | Release & Product Lifecycle Management |
| E719 | packages/org-kit/organization/whink_group_leadership.json | 75-87 | Engineering & Technology |
| E720 | packages/org-kit/organization/whink_group_leadership.json | 78-90 | Software Engineering |
| E721 | packages/org-kit/organization/whink_group_leadership.json | 79-91 | Mobile & Client Platforms |
| E722 | packages/org-kit/organization/whink_group_leadership.json | 80-92 | Platform Engineering & Core Infrastructure |
| E723 | packages/org-kit/organization/whink_group_leadership.json | 81-93 | Architecture & Technical Strategy |
| E724 | packages/org-kit/organization/whink_group_leadership.json | 82-94 | API, Integrations & Developer Ecosystem |
| E725 | packages/org-kit/organization/whink_group_leadership.json | 83-95 | DevOps, SRE & Cloud Engineering |
| E726 | packages/org-kit/organization/whink_group_leadership.json | 84-96 | Quality Engineering & Test Automation |
| E727 | packages/org-kit/organization/whink_group_leadership.json | 85-97 | Release Engineering & Configuration Management |
| E728 | packages/org-kit/organization/whink_group_leadership.json | 86-98 | Engineering Productivity & Developer Experience |
| E729 | packages/org-kit/organization/whink_group_leadership.json | 87-99 | Technical Documentation & Engineering Knowledge |
| E730 | packages/org-kit/organization/whink_group_leadership.json | 91-103 | Data & Artificial Intelligence |
| E731 | packages/org-kit/organization/whink_group_leadership.json | 94-106 | AI Engineering & Applied Intelligence |
| E732 | packages/org-kit/organization/whink_group_leadership.json | 95-107 | Agent Architecture & AI Workforce Systems |
| E733 | packages/org-kit/organization/whink_group_leadership.json | 96-108 | Skill Engineering & Tool Orchestration |
| E734 | packages/org-kit/organization/whink_group_leadership.json | 97-109 | Machine Learning & Model Development |
| E735 | packages/org-kit/organization/whink_group_leadership.json | 98-110 | Model Evaluation, Reliability & Intelligence Quality |
| E736 | packages/org-kit/organization/whink_group_leadership.json | 99-111 | Model Routing & AI Infrastructure |
| E737 | packages/org-kit/organization/whink_group_leadership.json | 100-112 | Data Engineering & Data Platforms |
| E738 | packages/org-kit/organization/whink_group_leadership.json | 101-113 | Data Science & Decision Intelligence |
| E739 | packages/org-kit/organization/whink_group_leadership.json | 102-114 | Knowledge Systems & Enterprise Memory |
| E740 | packages/org-kit/organization/whink_group_leadership.json | 103-115 | AI Governance Technology & Responsible AI Systems |
| E741 | packages/org-kit/organization/whink_group_leadership.json | 104-116 | AI FinOps & Usage Intelligence |
| E742 | packages/org-kit/organization/whink_group_leadership.json | 105-117 | AI Platform Operations & Observability |
| E743 | packages/org-kit/organization/whink_group_leadership.json | 109-121 | Research & Development |
| E744 | packages/org-kit/organization/whink_group_leadership.json | 112-124 | Applied Research |
| E745 | packages/org-kit/organization/whink_group_leadership.json | 113-125 | Emerging Technologies & Future Systems |
| E746 | packages/org-kit/organization/whink_group_leadership.json | 114-126 | Experimental Engineering & Prototyping |
| E747 | packages/org-kit/organization/whink_group_leadership.json | 115-127 | AI & Autonomous Systems Research |
| E748 | packages/org-kit/organization/whink_group_leadership.json | 116-128 | Human–Computer Interaction & Future Interfaces |
| E749 | packages/org-kit/organization/whink_group_leadership.json | 117-129 | Advanced Computing & Systems Research |
| E750 | packages/org-kit/organization/whink_group_leadership.json | 118-130 | Research Partnerships & Academic Collaboration |
| E751 | packages/org-kit/organization/whink_group_leadership.json | 119-131 | Innovation Incubation & Technology Transfer |
| E752 | packages/org-kit/organization/whink_group_leadership.json | 120-132 | Intellectual Property Discovery & Invention Management |
| E753 | packages/org-kit/organization/whink_group_leadership.json | 121-133 | Research Intelligence & Scientific Foresight |
| E754 | packages/org-kit/organization/whink_group_leadership.json | 125-137 | Information Technology |
| E755 | packages/org-kit/organization/whink_group_leadership.json | 128-140 | Enterprise Applications & Business Systems |
| E756 | packages/org-kit/organization/whink_group_leadership.json | 129-141 | End-User Computing & Workplace Technology |
| E757 | packages/org-kit/organization/whink_group_leadership.json | 130-142 | IT Service Management & Service Desk |
| E758 | packages/org-kit/organization/whink_group_leadership.json | 131-143 | Cloud & Infrastructure Operations |
| E759 | packages/org-kit/organization/whink_group_leadership.json | 132-144 | Network & Connectivity Services |
| E760 | packages/org-kit/organization/whink_group_leadership.json | 133-145 | Identity & Access Administration |
| E761 | packages/org-kit/organization/whink_group_leadership.json | 134-146 | Collaboration & Productivity Platforms |
| E762 | packages/org-kit/organization/whink_group_leadership.json | 135-147 | IT Asset & Configuration Management |
| E763 | packages/org-kit/organization/whink_group_leadership.json | 136-148 | Enterprise Systems Administration |
| E764 | packages/org-kit/organization/whink_group_leadership.json | 137-149 | IT Architecture & Technology Standards |
| E765 | packages/org-kit/organization/whink_group_leadership.json | 141-153 | Cybersecurity & Resilience |
| E766 | packages/org-kit/organization/whink_group_leadership.json | 144-156 | Security Operations & Incident Response |
| E767 | packages/org-kit/organization/whink_group_leadership.json | 145-157 | Threat Intelligence & Threat Hunting |
| E768 | packages/org-kit/organization/whink_group_leadership.json | 146-158 | Identity Security & Privileged Access |
| E769 | packages/org-kit/organization/whink_group_leadership.json | 147-159 | Security Engineering |
| E770 | packages/org-kit/organization/whink_group_leadership.json | 148-160 | Cloud & Infrastructure Security |
| E771 | packages/org-kit/organization/whink_group_leadership.json | 149-161 | Application & Product Security |
| E772 | packages/org-kit/organization/whink_group_leadership.json | 150-162 | Security Architecture |
| E773 | packages/org-kit/organization/whink_group_leadership.json | 151-163 | Vulnerability & Exposure Management |
| E774 | packages/org-kit/organization/whink_group_leadership.json | 152-164 | Data Security & Information Protection |
| E775 | packages/org-kit/organization/whink_group_leadership.json | 153-165 | Third-Party & Supply Chain Security |
| E776 | packages/org-kit/organization/whink_group_leadership.json | 154-166 | Cyber Risk & Security Governance |
| E777 | packages/org-kit/organization/whink_group_leadership.json | 155-167 | Business Continuity, Disaster Recovery & Cyber Resilience |
| E778 | packages/org-kit/organization/whink_group_leadership.json | 159-171 | Finance & Accounting |
| E779 | packages/org-kit/organization/whink_group_leadership.json | 162-174 | Accounting & Close |
| E780 | packages/org-kit/organization/whink_group_leadership.json | 163-175 | Financial Reporting & Consolidation |
| E781 | packages/org-kit/organization/whink_group_leadership.json | 164-176 | FP&A, Budgeting & Forecasting |
| E782 | packages/org-kit/organization/whink_group_leadership.json | 165-177 | Treasury & Capital Management |
| E783 | packages/org-kit/organization/whink_group_leadership.json | 166-178 | Tax |
| E784 | packages/org-kit/organization/whink_group_leadership.json | 167-179 | Billing, Accounts Receivable & Accounts Payable |
| E785 | packages/org-kit/organization/whink_group_leadership.json | 168-180 | Payroll Finance |
| E786 | packages/org-kit/organization/whink_group_leadership.json | 169-181 | Financial Controls & Management Accounting |
| E787 | packages/org-kit/organization/whink_group_leadership.json | 173-185 | Legal, Risk & Governance |
| E788 | packages/org-kit/organization/whink_group_leadership.json | 176-188 | Corporate & Commercial Legal |
| E789 | packages/org-kit/organization/whink_group_leadership.json | 177-189 | Contracts & Transactions |
| E790 | packages/org-kit/organization/whink_group_leadership.json | 178-190 | Intellectual Property & Technology Legal |
| E791 | packages/org-kit/organization/whink_group_leadership.json | 179-191 | Employment Legal |
| E792 | packages/org-kit/organization/whink_group_leadership.json | 180-192 | Privacy & Data Protection |
| E793 | packages/org-kit/organization/whink_group_leadership.json | 181-193 | Enterprise Risk Management |
| E794 | packages/org-kit/organization/whink_group_leadership.json | 182-194 | Governance & Board Affairs |
| E795 | packages/org-kit/organization/whink_group_leadership.json | 183-195 | Regulatory Compliance & Ethics |
| E796 | packages/org-kit/organization/whink_group_leadership.json | 184-196 | Records & Information Governance |
| E797 | packages/org-kit/organization/whink_group_leadership.json | 188-200 | People & Culture |
| E798 | packages/org-kit/organization/whink_group_leadership.json | 191-203 | HR Business Partnering & People Operations |
| E799 | packages/org-kit/organization/whink_group_leadership.json | 192-204 | Talent Acquisition |
| E800 | packages/org-kit/organization/whink_group_leadership.json | 193-205 | Onboarding & Employee Experience |
| E801 | packages/org-kit/organization/whink_group_leadership.json | 194-206 | Employee Relations |
| E802 | packages/org-kit/organization/whink_group_leadership.json | 195-207 | Total Rewards, Compensation & Benefits |
| E803 | packages/org-kit/organization/whink_group_leadership.json | 196-208 | Performance & Talent Management |
| E804 | packages/org-kit/organization/whink_group_leadership.json | 197-209 | Learning & Development |
| E805 | packages/org-kit/organization/whink_group_leadership.json | 198-210 | Organizational Design & Workforce Planning |
| E806 | packages/org-kit/organization/whink_group_leadership.json | 199-211 | People Analytics |
| E807 | packages/org-kit/organization/whink_group_leadership.json | 200-212 | AI Workforce & Organizational Intelligence |
| E808 | packages/org-kit/organization/whink_group_leadership.json | 204-216 | Operations & Procurement |
| E809 | packages/org-kit/organization/whink_group_leadership.json | 207-219 | Corporate Operations |
| E810 | packages/org-kit/organization/whink_group_leadership.json | 208-220 | Business Process & Continuous Improvement |
| E811 | packages/org-kit/organization/whink_group_leadership.json | 209-221 | Procurement & Strategic Sourcing |
| E812 | packages/org-kit/organization/whink_group_leadership.json | 210-222 | Vendor & Supplier Management |
| E813 | packages/org-kit/organization/whink_group_leadership.json | 211-223 | Facilities & Workplace |
| E814 | packages/org-kit/organization/whink_group_leadership.json | 212-224 | Real Estate & Physical Infrastructure |
| E815 | packages/org-kit/organization/whink_group_leadership.json | 213-225 | Quality Management |
| E816 | packages/org-kit/organization/whink_group_leadership.json | 214-226 | Operational Performance & Service Excellence |
| E817 | packages/org-kit/organization/whink_group_leadership.json | 218-230 | Customer Organization |
| E818 | packages/org-kit/organization/whink_group_leadership.json | 221-233 | Customer Success |
| E819 | packages/org-kit/organization/whink_group_leadership.json | 222-234 | Customer Onboarding & Implementation |
| E820 | packages/org-kit/organization/whink_group_leadership.json | 223-235 | Professional Services |
| E821 | packages/org-kit/organization/whink_group_leadership.json | 224-236 | Technical Account Management |
| E822 | packages/org-kit/organization/whink_group_leadership.json | 225-237 | Customer Support & Service Desk |
| E823 | packages/org-kit/organization/whink_group_leadership.json | 226-238 | Customer Education & Adoption |
| E824 | packages/org-kit/organization/whink_group_leadership.json | 227-239 | Renewals & Expansion |
| E825 | packages/org-kit/organization/whink_group_leadership.json | 228-240 | Customer Health & Escalation Management |
| E826 | packages/org-kit/organization/whink_group_leadership.json | 232-244 | Internal Audit & Assurance |
| E827 | packages/org-kit/organization/whink_group_leadership.json | 235-245 | Financial Audit & Assurance |
| E828 | packages/org-kit/organization/whink_group_leadership.json | 236-245 | Technology Audit |
| E829 | packages/org-kit/organization/whink_group_leadership.json | 237-245 | Cybersecurity Assurance |
| E830 | packages/org-kit/organization/whink_group_leadership.json | 238-245 | Operational Audit |
| E831 | packages/org-kit/organization/whink_group_leadership.json | 239-245 | Compliance & Governance Audit |
| E832 | packages/org-kit/organization/whink_group_leadership.json | 240-245 | Controls Assurance |
| E833 | packages/org-kit/organization/whink_group_leadership.json | 241-245 | AI Systems & Agent Governance Audit |
| E834 | apps/web/lib/staff-directory.ts | 71-83 | agent('amara-okafor' |
| E835 | apps/web/prompts/persona-whink.ts | 1-23 | File-wide inspection |
| E836 | apps/web/prompts/persona-mamba.ts | 1-36 | File-wide inspection |
| E837 | apps/web/prompts/persona-peter.ts | 1-47 | File-wide inspection |
| E838 | apps/web/prompts/persona-paul.ts | 1-46 | File-wide inspection |
| E839 | apps/web/prompts/persona-micah.ts | 1-24 | File-wide inspection |
| E840 | apps/web/prompts/persona-nandi.ts | 1-27 | File-wide inspection |
| E841 | apps/web/prompts/persona-scout.ts | 1-25 | File-wide inspection |
| E842 | apps/web/prompts/persona-registration.ts | 1-25 | File-wide inspection |
| E843 | .claude/agents/ai-evaluator.md | 1-35 | File-wide inspection |
| E844 | .claude/agents/backend-engineer.md | 1-41 | File-wide inspection |
| E845 | .claude/agents/brand-guardian.md | 1-32 | File-wide inspection |
| E846 | .claude/agents/compliance-checker.md | 1-33 | File-wide inspection |
| E847 | .claude/agents/devops-engineer.md | 1-32 | File-wide inspection |
| E848 | .claude/agents/frontend-engineer.md | 1-33 | File-wide inspection |
| E849 | .claude/agents/integrations-engineer.md | 1-30 | File-wide inspection |
| E850 | .claude/agents/lead-architect.md | 1-41 | File-wide inspection |
| E851 | .claude/agents/performance-benchmarker.md | 1-30 | File-wide inspection |
| E852 | .claude/agents/qa-engineer.md | 1-36 | File-wide inspection |
| E853 | .claude/agents/security-reviewer.md | 1-39 | File-wide inspection |
| E854 | .claude/agents/test-engineer.md | 1-35 | File-wide inspection |
| E855 | .claude/agents/whink.md | 1-160 | File-wide inspection |
| E856 | package.json | 1-14 | File-wide inspection |
| E857 | apps/web/package.json | 1-142 | File-wide inspection |
| E858 | packages/org-kit/package.json | 1-12 | File-wide inspection |
| E859 | e2e/package.json | 1-15 | File-wide inspection |
| E860 | services/openclaw/package.json | 1-25 | File-wide inspection |
| E861 | services/openclaw/upstreams/ref/package.json | 1-9 | File-wide inspection |
| E862 | services/openclaw/upstreams/social/package.json | 1-20 | File-wide inspection |
| E863 | services/voice/package.json | 1-12 | File-wide inspection |
| E864 | services/whink-content-analyst/package.json | 1-18 | File-wide inspection |
| E865 | services/whink-voice/package.json | 1-15 | File-wide inspection |
| E866 | apps/web/prisma/schema.prisma | 14-26 | model User { |
| E867 | apps/web/prisma/schema.prisma | 67-79 | model Account { |
| E868 | apps/web/prisma/schema.prisma | 86-98 | model Session { |
| E869 | apps/web/prisma/schema.prisma | 95-107 | model VerificationToken { |
| E870 | apps/web/prisma/schema.prisma | 106-118 | model UserProfile { |
| E871 | apps/web/prisma/schema.prisma | 123-135 | model UserPreference { |
| E872 | apps/web/prisma/schema.prisma | 142-154 | model UserApiKey { |
| E873 | apps/web/prisma/schema.prisma | 160-172 | model PersonaState { |
| E874 | apps/web/prisma/schema.prisma | 177-189 | model Conversation { |
| E875 | apps/web/prisma/schema.prisma | 194-206 | model Message { |
| E876 | apps/web/prisma/schema.prisma | 214-226 | model Project { |
| E877 | apps/web/prisma/schema.prisma | 244-256 | model ProjectMember { |
| E878 | apps/web/prisma/schema.prisma | 258-270 | model ProjectTask { |
| E879 | apps/web/prisma/schema.prisma | 279-291 | model ProjectMilestone { |
| E880 | apps/web/prisma/schema.prisma | 294-306 | model ProjectDecision { |
| E881 | apps/web/prisma/schema.prisma | 309-321 | model ProjectRisk { |
| E882 | apps/web/prisma/schema.prisma | 325-337 | model ProjectOpenQuestion { |
| E883 | apps/web/prisma/schema.prisma | 343-355 | model MemoryEpisode { |
| E884 | apps/web/prisma/schema.prisma | 369-381 | model MemorySemantic { |
| E885 | apps/web/prisma/schema.prisma | 399-411 | model MemoryDailyCap { |
| E886 | apps/web/prisma/schema.prisma | 412-424 | model MemoryProcedural { |
| E887 | apps/web/prisma/schema.prisma | 428-440 | model Hypothesis { |
| E888 | apps/web/prisma/schema.prisma | 450-462 | model EntityNode { |
| E889 | apps/web/prisma/schema.prisma | 469-481 | model EntityAlias { |
| E890 | apps/web/prisma/schema.prisma | 480-492 | model EntityEdge { |
| E891 | apps/web/prisma/schema.prisma | 503-515 | model Tool { |
| E892 | apps/web/prisma/schema.prisma | 521-533 | model ExecutionPlan { |
| E893 | apps/web/prisma/schema.prisma | 537-549 | model PlanStep { |
| E894 | apps/web/prisma/schema.prisma | 560-572 | model Action { |
| E895 | apps/web/prisma/schema.prisma | 590-602 | model Permission { |
| E896 | apps/web/prisma/schema.prisma | 604-616 | model Delegation { |
| E897 | apps/web/prisma/schema.prisma | 622-634 | model TenantConfig { |
| E898 | apps/web/prisma/schema.prisma | 639-651 | model EvaluationScenario { |
| E899 | apps/web/prisma/schema.prisma | 653-665 | model EvaluationRun { |
| E900 | apps/web/prisma/schema.prisma | 669-681 | model CalendarEvent { |
| E901 | apps/web/prisma/schema.prisma | 688-700 | model Note { |
| E902 | apps/web/prisma/schema.prisma | 705-717 | model WorkingMemory { |
| E903 | apps/web/prisma/schema.prisma | 721-733 | model TaskHandoff { |
| E904 | apps/web/prisma/schema.prisma | 740-752 | model DocumentWorkspace { |
| E905 | apps/web/prisma/schema.prisma | 756-768 | model Document { |
| E906 | apps/web/prisma/schema.prisma | 777-789 | model AgentKnowledge { |
| E907 | apps/web/prisma/schema.prisma | 798-810 | model ApprovalRequest { |
| E908 | apps/web/prisma/schema.prisma | 824-836 | model SocialConnection { |
| E909 | apps/web/prisma/schema.prisma | 846-858 | model OAuthState { |
| E910 | apps/web/prisma/schema.prisma | 865-877 | model ScheduledPost { |
| E911 | apps/web/prisma/schema.prisma | 892-904 | model NotificationPreference { |
| E912 | apps/web/prisma/schema.prisma | 914-926 | model BoardMeeting { |
| E913 | apps/web/prisma/schema.prisma | 935-947 | model ConnectorInstall { |
| E914 | apps/web/prisma/schema.prisma | 952-964 | model UsageEvent { |
| E915 | apps/web/prisma/schema.prisma | 971-983 | model Contact { |
| E916 | apps/web/prisma/schema.prisma | 993-1005 | model CommsRequest { |
| E917 | apps/web/prisma/schema.prisma | 1012-1024 | model ChangeRequest { |
| E918 | apps/web/prisma/schema.prisma | 1033-1045 | model Contract { |
| E919 | apps/web/prisma/schema.prisma | 1064-1076 | model SkillSubmission { |
| E920 | apps/web/prisma/schema.prisma | 1092-1104 | model PasskeyCredential { |
| E921 | apps/web/prisma/schema.prisma | 1111-1123 | model PasskeyChallenge { |
| E922 | apps/web/prisma/schema.prisma | 1132-1144 | model AgentJob { |
| E923 | apps/web/prisma/schema.prisma | 1155-1167 | model AgentHeartbeat { |
| E924 | apps/web/prisma/schema.prisma | 1165-1177 | model NewsSeen { |
| E925 | apps/web/prisma/schema.prisma | 1179-1191 | model Recommendation { |
| E926 | apps/web/prisma/schema.prisma | 1201-1213 | model SwarmRun { |
| E927 | apps/web/prisma/schema.prisma | 1231-1243 | model SwarmTask { |
| E928 | apps/web/prisma/schema.prisma | 1267-1279 | model SwarmClaim { |
| E929 | apps/web/prisma/schema.prisma | 1283-1295 | model SwarmLearning { |
| E930 | apps/web/prisma/schema.prisma | 1306-1318 | model RateLimitBucket { |
| E931 | apps/web/prisma/schema.prisma | 1318-1330 | model PasswordResetToken { |

## Export integrity and limitations

Companion: `KAMSI_PRIME_AUDIT_DATA.json`. Both reports use the same 56 components, 19 findings, 14 area IDs and 931 evidence IDs. JSON retains raw registry details and original dependency version constraints, provider templates/configuration distinctions, schema definitions and source hashes. No secret values are included. Source links are relative to this report directory; exact repository paths and line numbers remain available even outside the checkout.

No application test pass, cloud readiness, successful provider request, security exploit, operational uptime or recovery result is claimed. Runtime verification remains a separate authorized task.


## Supplemental machine-readable hierarchy records

The companion JSON also includes STAFF-01–STAFF-07, explicit configured reporting/membership edges, all five provider adapter templates (ADAPTER-01–ADAPTER-05), and original org-kit governance/routing YAML. Reporting edges express configured relationships, not executable authorization.

| ID | Name | Role | Reports to | Kind / status |
| --- | --- | --- | --- | --- |
| STAFF-01 | Victor Igboekwe | Founder & CEO | Root | human / active |
| STAFF-02 | Marcus Vale | Executive Assistant | victor-igboekwe | human / active |
| STAFF-03 | Amara Okafor | Chief Innovation & Opportunity Officer | victor-igboekwe | agent / pending |
| STAFF-04 | Mateo Restrepo | Senior Opportunity Scout | amara-okafor | agent / pending |
| STAFF-05 | Priya Raghunathan | Strategic Market Analyst | amara-okafor | agent / pending |
| STAFF-06 | Soren O'Connell | Growth Strategist, Existing Businesses | amara-okafor | agent / pending |
| STAFF-07 | Mei-Ling Tan | Venture Scout, New Business Identification | amara-okafor | agent / pending |

Staff evidence: `apps/web/lib/staff-directory.ts:40`; provider templates: `packages/org-kit/providers/*/adapter_template.json:1`; governance: `packages/org-kit/governance/core_governance.yaml:1`; routing rules: `packages/org-kit/workflows/routing_rules.yaml:1`. Full definitions are retained in JSON.
