# WHINK Ultimate | Cross-Component System Contracts
**v0.3 approved behavioral baseline (exact wire/schema details subject to code reconciliation).** These are **normative proposed interfaces**, not claims that the current repo already implements them. Precise code/API/DB schema must be reconciled before approval and modifications.

## SC-01 Task envelope (one logical contract across Mac and remote)
```yaml
task_id: immutable-id
request_id: correlation-id
founder_scope: owner-id
agent_id: canonical-orgkit-id
team_id: canonical-orgkit-team-id
mission_id: optional-id
purpose: bounded-description
input_ref: immutable-or-versioned-reference
information_class: public|organization|founder_sealed
allowed_capabilities: [allowlisted-capability-id]
execution_class: reasoning|tool|scheduled|communication
execution_location: prefer_local|off_device_required|policy_decides
remote_data_permission: explicit-scope-or-deny
approval: {required: true, id: immutable-id, action_hash: sha256, valid_until: ISO-8601}
monetary: {paid_allowed: false, approved_limit_minor_units: 0, currency: CAD, reservation_id: null}
limits: {max_attempts: number, deadline: ISO-8601, cancellation_token: opaque-id}
idempotency_key: stable-key
policy_version: immutable-policy-ref
correlation_id: cross-provider-correlation-id
```
**Numbers, currency, default values and wire format are illustrative, not yet signed business settings.** Monetary costs must use integer minor units or an exact decimal representation. WHINK must distinguish a Founder authorization for task activation from a separate authorization to incur monetary charges. Task data, secrets and private information should be references rather than embedded in transport logs.

## SC-02 Task state machine
`PROPOSED → AWAITING_APPROVAL → APPROVED → QUEUED → CLAIMED → RUNNING → SUCCEEDED / FAILED / CANCELLED`.
`BLOCKED_POLICY`, `BLOCKED_COST`, `WAITING_FOR_MAC`, `WAITING_FOR_CONNECTIVITY`, `RETRY_SCHEDULED` and `NEEDS_REVIEW` are explicit reasons/states where applicable. Persist timestamp, actor, attempt, agent, proof and authoritative version/etag atomically. `APPROVED` ≠ `DISPATCHED`, `CLAIMED` ≠ `RUNNING`, and `RUNNING` ≠ `SUCCEEDED`. A provider ACK alone is not proof a side effect succeeded. No status based only on model-generated text or visual fixture timers.

## SC-03 Worker admission/receipt across machines
`submit(envelope) -> accepted(task_id) | denied(reason)`; `claim(worker_id, capabilities, lease)`; `heartbeat(lease)`; `checkpoint(task_id, version, state)`; `complete(task_id, evidence)`; `cancel(task_id, reason)`; `reconcile(worker_id, task_id)`.
- A remote worker and local Mac worker share canonical task state and the **same policy**. Local is preferred when online; Mac-off remote must independently claim/continue tasks for which it has scoped permissions.
- Durable lease/heartbeat plus idempotency is required; ambiguous network timeouts must NOT blindly repeat emails, purchases or publications. Provider-specific idempotency and external delivery receipts are required for non-idempotent operations.
- Resumption rechecks approval hash, expiry, scope, data classification, permissions, provider budget and cancellation. A previously approved task does not authorize newly expanded scope.
- Remote runtime must not require the Mac to serve API, DB, secrets, or an approval UI. Reconnection resolves versions without overwriting newer canonical state.

## SC-04 Model selection and cloud escalation
`route(task, quality_requirements, location, available_providers, privacy_policy, budget) -> local | authorized_cloud | no_eligible_provider`.
- Default to local if reachable and capable. Trigger escalation for verified tool-schema failure, inadequate quality, inability to meet deadline, context limits, unavailable Mac, or a task requiring capabilities the local model lacks; log **why**, source/final model, allowed-context payload checksum, latency and token/cost metrics.
- Before a paid call, perform atomic budget reservation/admission for the precise provider and scope; settle usage after receipt, and stop when cap exhausted. Under zero-new-spend policy, only validated **zero incremental cost** routes can proceed absent a new Founder budget authorization. Subscription entitlements do not automatically prove free API usage.
- Escalation can be proposed automatically; paid execution cannot be silently authorized automatically. Model selection (Qwen/Gemma/hybrid) remains undecided until safe paired tests; avoid hard-coded model-specific policy.
- Context assembler respects actual model window including system, tools, history and output reserve; Founder/security rules never trimmed or downgraded. Sending sealed Founder context to remote providers requires its own explicit authorization, minimization/redaction and audit.

## SC-05 Persistent memory + learning
Central cloud-reachable memory/state is authoritative while Mac is off. Local caches are replicas/projections, never the only copy of critical task/approval state. Use identity-safe versioning, access classification, tenant/owner scope, encryption transport/storage, credential rotation, audit and restore validation. Multi-agent learning may share permitted outcomes/patterns, with source provenance, review and avoidance of Founder-sealed facts. Do not assume AnythingLLM or any embedding model is already installed or healthy. Offline Mac work, where permitted, queues versioned updates and reconciles on reconnect with conflict handling—not blind last-writer-wins over approvals/finance.

## SC-06 OpenClaw/tool adapter
Capabilities are exposed under a **WHINK capability registry** and executed only through the envelope and policy gate. Never forward unrestricted `tools: full`, ambient environment credentials, shell access or unvalidated filesystem paths. Resolve upstream WebSocket vs WHINK MCP transport explicitly. For every candidate feature, record license/updates, allowed tools, data access, isolation/sandbox proof, error/cancel semantics, idempotency, observability, test results and alternative 'keep existing WHINK'. Extraction of upstream source without compliance review is not authorized.

## SC-07 HOLO/command centre
Only authenticated task/approval/memory/cost events from canonical state may appear as live. Simulation is explicitly labeled **DEMO**. Command centre may initiate a proposal and submit Founder decisions, but must verify authorization source and signed action scope. ChatGPT→Codex flow is a target workflow, not currently proven end-to-end; report connection and approval limits. UI must distinguish pending, scheduled, blocked-cost, Mac-off, executing remotely, failed, completed and awaiting Founder.

## SC-08 Tests that define evidence
1. Approved harmless task actually reaches worker and returns persisted result; denied/expired/changed-hash approvals do not execute.
2. **Power Mac completely OFF:** remote worker independently runs an approved schedule, persists to central memory/ledger, presents result and approval from another device; then Mac reconnects without duplicate work or data loss.
3. Mac online → eligible local task uses local; local fail → permitted cloud with context and reason, but **zero billed provider calls** under zero-spend setting. Paid-only path truthfully blocks and asks for authorization.
4. Test race/retry/crash/power-loss, cancellation, event duplication, idempotency, budget exhaustion, blocked sensitive-data exfiltration, identity/agent isolation, cross-agent learning permissions and sealed Founder knowledge.
5. Verify HOLO live status corresponds 1:1 to persisted events; fixture animation remains demo-only.
6. Verify OpenClaw adapter with stubbed untrusted tool responses first, then sandbox and permission tests before any live use.
7. Test accessibility/reliability of command centre approvals when Mac is off and clearly show any unimplemented connector as blocked.

**Evidence levels:** source inspection ≠ unit tests ≠ mocked integration ≠ live local E2E ≠ real remote Mac-off E2E. Acceptance requires the appropriate level, not merely passing mock tests.
## SC-09 Conditional hierarchy, mission activation and qualified takeover (FDR-024/026/028)
On a permitted request the team lead or lowest competent manager resolves and delegates within mission authorization, without obligatory WHINK/MAMBA calls; escalate unresolved high-impact questions through relevant directorate, applicable subsidiary MD, peer executives then Founder where reserved. Every active assignment uses canonical agent identity, capability subset, mission/approval reference, start/end and audit. A qualified substitute can take over a stalled task inside identical allowed scope; send manager notification, preserve original owner and substitution reason in the ledger, and require explicit higher approval for permanent roster edits, added access, cost or changed mission. Agent availability is a registry/scheduling concept; no per-agent always-running model.

## SC-10 Founder-private EA and Kill Team (FDR-025)
Marcus Vale's private task channel, scoped personnel/evaluation records and sealed knowledge are authorized only by Founder. Tunde, Peter and Paul remain Founder-private team members/roles subject to existing registry reconciliation before permanent mutations. Standard org sharing, model context building, Cloud escalation and HOLO UI must deny access to Founder-sealed data by default. Tests must prove a director, WHINK and MAMBA persona cannot retrieve that sealed channel without specific Founder authorization.
