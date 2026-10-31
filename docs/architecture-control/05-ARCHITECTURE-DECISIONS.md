# WHINK Ultimate | Architecture Decisions / ADR Governance
**v0.3 post-Founder approval of six corrections** · Historical facts, current Founder requirements and proposed future choices deliberately separated.

## 1. What the audits actually found (AUDIT-OBSERVED; not current live verification)
- Earliest imported design includes WHINK, ADA V2, OpenClaw actions, AnythingLLM and a swappable model router; **not** proof that upstream OpenClaw was supposed to own all 326 agents.
- 2026-10-03 recorded choice used WHINK-owned MCP aggregator in `services/openclaw` for transport/availability. The installed upstream OpenClaw v2026.10.8 is distinct, and the audit did **not** find a configured bridge.
- WHINK MCP `/mcp` port ~3100 vs upstream WebSocket gateway ~18789: different transports; endpoint substitution alone is invalid.
- Upstream installation was bound loopback and token authenticated, but configured `tools: full`, no explicit sandbox configuration, and a default local model not present in observed Ollama inventory. Its safe execution and successful WHINK integration are **unverified**.
- EAR approval currently says 'TEAM DISPATCHED' without actually handing a job to an executor. Analytical swarm assigns agents but they have no tools. HOLO visual activity uses fixtures. Business operations may be independent of this path.
- Local file settings selected Gemma. Independent comparative evaluation was incomplete: Qwen had four scored trials with strict 0/4 full compliance and partial successes, Gemma inference not run; disk exhaustion stopped tests. No reliable comparative winner.
- Historic `ARCHITECTURE.md` incorrectly implies 16 directorates, Tauri, Python/SQLite; audited code shows **15 directorates**, Next.js, Prisma/Postgres. Older notes are evidence, not binding current-state descriptions.
- Cloud spending is not universally gated; direct content analyst, detached jobs and uncommitted coding runner may not share execution contracts. The existing late-approval council is deterministic policy, not five independent AI judgements.
**Sources:** see `evidence/FORENSIC-ARCHITECTURE-AUDIT.md` and `evidence/INDEPENDENT-LOCAL-MODEL-EVALUATION.md`. These snapshots inspected local source/selected metadata; did not test full app end-to-end.

## 2. Decisions that control architecture
Use **FDR-001 through FDR-023** from `06-FOUNDER-DECISION-REGISTER.md`. Especially:
- `FDR-006` always-on while Mac powered off **this build**; `FDR-007` authoritative cloud-hosted central memory;
- `FDR-008` local-first and single-user Mac performance; `FDR-009` authorized intelligent cloud escalation; `FDR-010` zero unapproved/new spend until revenue;
- `FDR-012` selective OpenClaw integration/extraction under WHINK; `FDR-013` hybrid HOLO; `FDR-015` unselected local model;
- `FDR-016` ChatGPT command-centre preference and `FDR-017` protected organizational learning.
A recommendation to 'defer off-device always-on' is **explicitly rejected/superseded** by the Founder's latest decision. White-label remains deferred.

## 3. Proposals pending design approval
| ADR placeholder | Proposed choice | Why not silently commit? |
|---|---|---|
| ADR-P01 | One canonical task/approval/execution contract and durable queue, preferably reusing existing Postgres workers. | Exact claim/lease interface needs code evidence. |
| ADR-P02 | Separate local Mac executor and off-device continuously available worker sharing a canonical cloud-accessible state store. | Vendor, data region, cost, secrets, failure/reconnect strategy unchosen. |
| ADR-P03 | Atomic universal paid-provider reservation/gate, independent of model/tool path. | Must enumerate and retrofit all bypass paths. |
| ADR-P04 | Selectively reuse upstream OpenClaw functions or safely license code; no upstream authority. | Benefit, sandbox, licensing and transport not proven. |
| ADR-P05 | HOLO subscribes to persisted status and founder dashboard context. | Existing fixture paths and SSE wiring need evidence. |
| ADR-P06 | Protect architecture and all FDR IDs via scoped reviews, test CI and release gates. | Needs Founder signoff and actual GitHub configuration. |

## 4. Unresolved technical choices / risks
`TECH-01` off-device hosting design, reliability, regional/privacy requirements, ongoing cost and existing entitlements; `TECH-02` central memory store selection, backup, encryption, sealed knowledge segregation, sync conflict resolution; `TECH-03` task queues and worker idempotency; `TECH-04` capability-by-capability OpenClaw integration/extraction and software-license obligations; `TECH-05` safe cloud inference provider/data route under zero-new-spend; `TECH-06` complete Qwen/Gemma paired benchmark and context tuning; `TECH-07` end-to-end ChatGPT↔Codex interaction feasibility/permissions; `TECH-08` HOLO live events and camera/gestures feasibility; `TECH-09` actual approvals, identity collisions, dormant/available agent operation semantics. These are **engineering discovery items**, not permission to reopen confirmed Founder's choices.

## 5. New ADR procedure
Every request to deviate from baseline must include:
`ADR-ID | affected FDR/REQ IDs | date | current baseline checksum | observed code/paths | problem | options incl. no change | security/privacy/cost | effect on 24/7 Mac-off, local-first and 326 roster | migration/rollback | objective test plan | independent review | explicit Founder APPROVE/REJECT/DEFER and reference`.
Unapproved ADRs are proposals. Accepted ADRs are immutable historical records; amendments create another ADR. No revision of FDR intent without a new explicit Founder decision. If two documents conflict, pause and surface it, with the authoritative Founder record.
## 6. Founder approval record (30 October 2026)
Explicitly approved the six corrections FDR-024..029 and instructed Codex to begin implementation. This supersedes the v0.2 generic wording that *no code changes at all* are authorized. M0/M1 non-destructive implementation in a feature branch is authorized. Founder's release approval, new cloud spend, provider selection, protected external activity, model changes and roster edits are **not** authorized. A GitHub PR/issue is not a Codex execution receipt.
