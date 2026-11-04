# Historical handoff — current status superseded 2026-11-04

The imported handoff below preserves its original dated claims; old repo names, branches, test results and "next action" are **not current instructions**. Current repo is `whinkproducts-alt/ECHELON-CORP`, main code baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. Read [docs/ECHELON-AUDIT-HANDOFF-2026-11-04.md](docs/ECHELON-AUDIT-HANDOFF-2026-11-04.md), [docs/pending-tasks.md](docs/pending-tasks.md) and the newest daily sync. For root handoffs, these documents are under `docs/`. Mandatory engineering/security rules remain binding. Do not execute old import/reset/merge instructions or claim historical failures as current.

---

# WHINK Ultimate — Local-Only Autonomous CEO Build Handoff

You are implementing this plan locally in the WHINK Ultimate repository. Work read-only first, then make small reversible changes. Do not use cloud models, cloud APIs, hosted embeddings, web search, external plugins, or external OAuth. Do not spend money, send external communications, alter production, delete data, or weaken founder controls.

## Objective

Build a genuinely autonomous local-first executive system:

- The founder gives WHINK a goal.
- WHINK/MAMBA decompose it into bounded tasks.
- Kill Team specialists execute locally through Ollama and approved local tools.
- Work continues through retries, replanning, and durable jobs.
- Every action reports progress, model choice, tool use, blockers, and result.
- High-risk actions stop for founder approval.
- All state survives restart and is auditable.
- The entire system works with no internet or cloud access.

## Non-negotiable local-only boundary

Allowed:

- Ollama on localhost or a private local address.
- Whisper and Kokoro on localhost.
- Local PostgreSQL/pgvector.
- Local filesystem inside the approved workspace.
- Local browser automation only when explicitly enabled and gated.

Blocked in Local-Only mode:

- Anthropic, OpenAI, Gemini, DeepSeek cloud, or any remote model.
- Web search and web fetch.
- OpenClaw, MCP servers, hosted plugins, or remote connectors.
- Gmail, social media, SMS, Twilio, Telegram, calendar invites, and SMTP.
- OAuth flows and external account registration.
- Remote embeddings, rerankers, telemetry, update checks, and package downloads.

Enforce this server-side immediately before every model call, tool call, fetch, connector call, and plugin operation. A UI toggle alone is not sufficient. Fail closed if the mode cannot be verified. Log every blocked attempt.

## Build sequence

### Phase 0 — Inventory and safety baseline

1. Read repository instructions and map existing router, tool registry, approval, ledger, task, worker, memory, and Kill Team code.
2. Record every external egress path.
3. Add tests proving Local-Only blocks each path.
4. Never expose secrets in logs or reports.

### Phase 1 — Real Offline Mode

1. Add a persisted server-side network mode: `LOCAL_ONLY` or `CONNECTED`.
2. Add a visible control in Settings and the Command Center.
3. Show provider, model, network mode, and local-service health.
4. Add a shared `assertExecutionPolicy()` used by model routing and every tool.
5. Permit only loopback/private local services and approved workspace paths.
6. Add audit records for mode changes and blocked actions.
7. Test with the network unavailable, not merely with cloud credentials absent.

### Phase 2 — Provider and model seam

1. Define one provider-neutral adapter interface.
2. Implement Ollama as the only enabled provider in Local-Only mode.
3. Include model metadata: local/remote, tool support, context limit, reasoning setting, and health.
4. Keep Qwen thinking disabled by default for routine work unless explicitly needed.
5. Record why a model was selected.

### Phase 3 — Durable autonomous jobs

1. Create durable objective, task, job, attempt, dependency, and handoff records.
2. Add a local worker queue with leases, retries, cancellation, timeout, and recovery after restart.
3. Make jobs owner-scoped to the founder.
4. Ensure duplicate retries are idempotent.
5. Add a clear status lifecycle: queued, running, waiting, blocked, completed, failed, cancelled.

### Phase 4 — WHINK/MAMBA executive orchestration

1. WHINK receives the founder’s objective and creates a plan.
2. MAMBA reviews the plan for contradictions, risk, missing dependencies, and task order.
3. Directors receive department-specific tasks.
4. Kill Team specialists receive bounded assignments with explicit capabilities.
5. Specialists report progress and results to their director, then to MAMBA and WHINK.
6. MAMBA can re-plan non-destructive work without asking each time.
7. Preserve WHINK and MAMBA’s executive authority; do not reduce their powers.

### Phase 5 — Capability and approval gates

Use per-action capabilities, never one global permission:

- local_read
- local_write
- local_process
- network_read
- external_communication
- money
- destructive_change
- production_change
- permission_change

Local-only work can run automatically when inside its capability boundary. Founder approval remains mandatory for money, external communications, destructive or irreversible changes, production changes, permission changes, and anything representing the founder.

Late approvals are not automatically rejected. After expiry, WHINK, MAMBA, and the configured directors reassess the request; consensus may approve only when it does not spend money, communicate externally, or create high-level destructive risk.

### Phase 6 — Durable memory and evidence

1. Store objective, source, confidence, timestamp, owner, and provenance for every memory.
2. Separate facts, observations, recommendations, and assumptions.
3. Link memories to tasks and decisions.
4. Never treat an unverified model output as a fact.
5. Add local backup and restore checks for PostgreSQL/pgvector.

### Phase 7 — Local tools and voice

1. Keep Whisper for local speech-to-text.
2. Keep Kokoro for local text-to-speech.
3. Keep voice independent from the text model so switching models does not change WHINK/MAMBA’s voice.
4. Disable web, messaging, and connected-app tools in Local-Only mode.

### Phase 8 — Evaluation and hardening

Create local evaluation scenarios for:

- objective decomposition;
- specialist handoff;
- restart recovery;
- retry/idempotency;
- memory accuracy and provenance;
- Offline Mode enforcement;
- approval expiry and consensus;
- destructive-action denial;
- secret redaction;
- Ollama outage and recovery;
- voice end-to-end flow.

Run lint, typecheck, unit tests, integration tests, security scans, and a production build. Do not claim completion until the tests demonstrate that no external request occurs in Local-Only mode.

## Borrow from DeepSeek Harness, Hermes, and GBrain

- Provider-neutral model adapters.
- Plugin/capability seams.
- Durable event/session logs.
- Managed child agents with cancellation and bounded capabilities.
- Local-first provider profiles.
- Source-backed memory with uncertainty.
- Visible token/context and provider status.
- Fail-closed approvals and per-call sandbox policies.

Do not import their code wholesale. Do not install remote plugins. Recreate the useful patterns inside WHINK’s existing architecture and preserve its authority model.

## Required final report

Return:

1. Files changed.
2. Database migrations.
3. Local-only enforcement points.
4. New job, objective, memory, and handoff behavior.
5. Approval behavior and denied-action tests.
6. Exact commands run and results.
7. Remaining blockers requiring the founder.
8. Confirmation that no cloud or internet dependency was used.

Do not commit or push unless the founder explicitly requests it after reviewing the report.
