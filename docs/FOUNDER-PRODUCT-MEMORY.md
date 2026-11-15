# WHINK Group and ECHELON — Founder Product Memory

As of: 2026-11-14, America/Edmonton.

Purpose: preserve the Founder's accessible product vision, decisions, corrections, build history and remaining gaps so a future collaborator can continue accurately. This is a curated, secret-free knowledge handoff, not a raw memory-system dump, a complete transcript, an instruction to execute every idea, or proof that all described products work.

Coverage: current conversation; accessible historical project summaries from October–November 2026; ECHELON-INTEGRATIONS source and documentation inspected on November 14. Some earlier conversations, collapsed turns and attachments were unavailable. The prior detailed ECHELON handoff was reported created, but its historical local path was unavailable during this compilation. No claim of exhaustive recovery is made.

Repository snapshot: ECHELON-INTEGRATIONS `main` at `11b70896b2dedf72f55c751034dad770896dc61a`, checked immediately before this document was prepared. ECHELON-CORP was inspected earlier in this conversation at `bcdd0caa18201cf1c0e09adc71aef7855365f495`. Recheck live source before changes.

## 1. Evidence vocabulary and limits

- **Founder intent:** a desired outcome or explicit decision; not an implementation claim.
- **Source observed:** supported by code/documentation inspected at the stated snapshot; not a live acceptance result.
- **Historical result:** recorded in an earlier session; may have changed and has not necessarily been independently repeated.
- **Proposed:** a recommended design that still requires the applicable approval.
- **Unknown/pending:** evidence or implementation is incomplete.

An existing screen, roster entry, generated portrait, email-shaped identifier, green CI run, or working model endpoint does not prove an operational employee, mailbox, integration or autonomous workflow. Keep implementation, automated verification, real-provider acceptance and Founder acceptance separate.

## 2. The overarching vision

The Founder is building WHINK Group as an AI-assisted, progressively autonomous conglomerate operating across five subsidiaries. ECHELON is the governed operating environment, executive interface and coordination system for that organisation. WHINK Ultimate and KAMSI-PRIME appear in the product's development lineage; do not assume every repository with those names is the same current runtime.

The recurring subsidiary domains are consulting, real estate, trades/investment, apps, and Frontliners/Frontiers Nigeria. Historical website language and application configuration differ on some names. Use the current authoritative configuration and ask the Founder only when a naming decision is actually required; do not silently rename a company.

The desired organisation can research, identify opportunities, plan, build, monitor projects, learn from completed work, coordinate specialists, request exact approvals where required, and return evidence-backed outcomes. It should reduce the Founder's cognitive load and repeated prompting, while preserving meaningful control over consequential actions.

This is an intended operating model, not a claim that all registered agents are actively executing useful work.

## 3. Executive identities and responsibilities

### Founder

The Founder retains final authority over protected decisions and promotion of tested changes. Existing useful functionality should be preserved and improved iteratively. Do not replace the architecture merely because a new framework exists.

### WHINK and MAMBA

WHINK and MAMBA are peer executive personas, not a hierarchy in which one loses authority to the other. The current organisation data describes WHINK as CEO and MAMBA as Consigliere. WHINK is the primary interface; MAMBA brings strategic challenge and adversarial/Obsidian perspective.

Persona choice does not grant permissions. Speculation from MAMBA must not become an established fact or an external action. Existing hypothesis handling is a foundation to preserve.

### Marcus Vale

Marcus is intended to be the Founder's personal executive assistant, adviser and private confidant: someone the Founder can talk to naturally, who knows approved preferences, captures talking points, helps think through decisions, follows up, routes authorised work, tracks commitments and returns verified results or blockers.

The Founder wants authentic multi-turn text and voice conversations, not a decorative avatar, a single canned exchange or a room URL labelled as an AI assistant. Marcus should feel warm, candid and attentive without fabricated personal history or misleading claims of human identity.

Marcus-private conversation, objectives, memory, tasks and results must stay in an authorised Founder-private channel. Ordinary WHINK/MAMBA context must not gain access merely because it belongs to the same signed-in account. Sharing selected information requires an explicit, bounded handoff.

Historical directory code classifies Marcus as a human staff entry. That is a source inconsistency to resolve deliberately when implementing the AI assistant; the existing entry alone is not an AI runtime.

## 4. Latest interface decision: three screens

Founder intent, clarified in this conversation:

1. **Screen 1:** retain the existing application and its tabs.
2. **Screen 2:** a distinct full-page holographic/animated executive dashboard.
3. **Screen 3:** a distinct full-page clean corporate-panel executive dashboard.

Screens 2 and 3 are destinations, not additional tabs inside Screen 1. They should share real data, permissions and action services while presenting different visual experiences. Preserve clear navigation back to Screen 1 and between the executive destinations.

The existing main dashboard contains Monitor, Conversation and Board tabs within a sidebar/top-bar shell. HOLO currently has its own substantial interface nested under that shell. The proposed architecture separates shared authentication/providers from screen-specific chrome to avoid nested complete shells.

Proposed routes, not yet approved or implemented by this conversation:

| Destination | Proposed URL |
|---|---|
| Existing application | `/dashboard/**` |
| Holographic executive dashboard | `/executive/holo` |
| Corporate executive dashboard | `/executive/corporate` |
| Founder Office | `/executive/office` |
| Marcus entry/history | `/executive/office/marcus` |
| Private Marcus thread | `/executive/office/marcus/[conversationId]` |

Use URL state for destinations and durable resource IDs; server state for scope, recipient, messages, consent and execution; client state for drafts and transient voice/animation behavior. Bind Marcus identity and scope to the thread server-side rather than trusting account-global persona selection.

## 5. Founder Office and Boardroom

Founder Office should be the central place to direct the organisation and take supported actions. It needs lockdown, pending approvals, ideas, recommendations, active initiatives/results, and one-click access to Kill Team, Boardroom, WHINK, MAMBA and Marcus.

Ideas should be captured, edited, reviewed and archived durably. Promoting an idea into a task, initiative or product change is explicit. Founder-authored ideas and system-generated recommendations are different things and should remain distinguishable.

Historical experience intent includes a distinctive boardroom entrance/once-daily experience and a command center. Conversation should resemble a Teams-style meeting with the selected personality visibly present. Marcus should be selectable and able to take meeting notes. These are requirements/aspirations; automatic meeting attendance and realistic AI video were not established.

Existing Boardroom routes support members, scheduling, meetings and minutes. The main dashboard's lighter Board tab is not identical to the fuller `/dashboard/board` experience. Existing quick-meeting code creates a configured meeting-room URL; it does not make Marcus attend or converse.

## 6. Spoken instruction to durable execution

The repository's November 12 priority is: speak to WHINK, MAMBA or Marcus, give an initiative, see it accepted, observe authorised work and receive results without re-entering the instruction.

Required behavior:

- Select or say the recipient and capture speech with visible transcription.
- Preserve typed input and correction of uncertain transcription.
- Distinguish discussion from an explicit request to execute.
- Persist the objective, recipient, owner, scope, idempotency key, status, receipts and cancellation state.
- Return an initiative ID before long work begins.
- Dispatch through existing worker/gateway/admission/permission paths.
- Show queued, working, awaiting-approval, completed, failed and cancellation outcomes accurately.
- Recover the same initiative after refresh, interruption or restart without duplicate work.
- Fence new work on cancellation and report effects that already happened or remain uncertain.
- Pause protected actions for exact approvals. Speech alone is not a spending or protected-action approval.

This end-to-end workflow is not claimed complete merely because selectable speech and chat exist.

## 7. Specialists, Kill Team and hierarchy

Historical specialist intent:

- **Peter:** product forensics, evidence gathering and reverse engineering.
- **Paul:** independent clean-room reconstruction and implementation.
- **Micah:** product auditing, market opportunity and strategy.
- **Nandi:** global growth, marketing, conversion, monetisation and retention.
- **Scout / Michael Carrick:** research and opportunity scouting in the current UI.
- **Registration specialist:** bounded signup planning/status, not proof of browser/password-manager integration.
- **Tunde:** design/UX role in historical planning; do not invent a working runtime merely from the role name.

The Founder requested a Founder-controlled deployable Kill Team. Others may recommend engagement; recommendations do not equal Founder authorisation. WHINK/MAMBA retain executive coordination roles within approved boundaries.

Historical hierarchical memory/authority intent: agents and teams roll evidence up through team leads, department heads, directors and executives to the Founder. Useful internal work should be handled at the appropriate tier, while consequential risk reaches the Founder.

The repository contains an org-tier architectural plan and standalone browser integration modules. Their presence does not establish web-app activation or supersede exact protected-action controls. Older proposals for timed consensus, expiry-based delegation or automatic approval must not be revived as current authorisation.

The October architecture audit counted 326 dormant agent definitions, 163 teams and 570 skills. These are dated registry observations, not current counts, active processes or proven capabilities. Historical 15/16-directorate discrepancies require source reconciliation rather than invented roles.

## 8. Central brain, learning and memory

Founder intent is a per-user/company central brain with hierarchical learning and rollups, not a pool of private facts shared across customers.

Memory should preserve owner, scope, source, date, confidence and epistemic status. It should distinguish episodic completed work, semantic facts, procedural lessons, working context and speculative hypotheses. Completed work should improve later decisions, with useful cross-team synthesis inside authorised boundaries.

Existing foundations include bounded context assembly, conversation persistence, hybrid/vector memory retrieval, document recall, selective extraction/debriefing, correction/deletion and scheduled curation. Historical chat-memory work recorded completed exchanges with source IDs and sensitive/secret handling. It did not prove a retrospective for every tool, task or worker job.

Marcus requires additional end-to-end isolation. Saving transcripts, extracting memories, sharing information and selecting a processing provider are separate consent decisions. Temporary sessions must not silently become durable transcripts or derived memory. Forgetting needs to address embeddings, summaries and caches as well as primary records, with honest backup-retention limits.

Do not claim private data is encrypted solely from a schema comment. Verify actual storage behavior and preserve existing encryption keys needed for existing data.

## 9. Current repository boundaries and source observations

ECHELON-INTEGRATIONS is the private test/integration sandbox. Its own README requires separate review and promotion to ECHELON-CORP after acceptance. It has an isolated database/configuration, Docker project, cookies, local port and optional recovery. Do not connect it to the main app's private data or credentials.

At the November 14 inspected snapshot:

| Area | Source-backed state and limit |
|---|---|
| Main application | Existing Monitor/Conversation/Board tabs and governed route infrastructure. |
| HOLO | Reusable animation/avatar/orb components; agent activity and priorities still use fixtures. |
| HOLO approvals | Requests `status=AWAITING_APPROVAL`, but the endpoint accepts `pending`; demo fallback counts can misrepresent a real zero. |
| Founder Office | Dedicated unified destination not found in this inspection. |
| Ideas | Recommendations and change requests exist; a dedicated Founder idea lifecycle was not established. |
| Kill Team | Objective assignment updates local state; persistence/dispatch remains a gap. |
| Marcus | Not accepted by the inspected persona-switch allowlist. A staff profile/meeting link is not a private chat implementation. |
| Conversation | Persistent messages, recent-turn context and streaming exist; recipient selection relies on mutable persona state. |
| Private scope | Sealed helper/models exist, but complete conversation, recall and worker enforcement is not established. |
| Lockdown | Account-scoped safety infrastructure exists; full in-flight boundary assurance remains an acceptance task. It cannot undo already-sent external effects. |
| Speech | Selectable Whisper/Kokoro and VoiceStudio paths, signed speech turns, service checks and saved voices exist. Models/runtime and actual Mac audio still require acceptance. |
| Avatar | Audio-reactive Board/HOLO lips exist; actual Mac timing is not proven by CI. |
| Media | Governed hosted Higgsfield integration exists; disabled until configured, potentially credit-consuming, not a bundled free local video engine. |
| Browser modules | Retained standalone modules are not automatically activated by the Mac web bundle. |

The requested historical branch `claude/wonderful-carson-ci81s4` in ECHELON-CORP returned 404 and was absent from its current branch list during this conversation. Do not assume its content was inspected or recovered.

## 10. Local-first models, providers and cost

Local-first and explicit Local-Only are distinct requirements. In Local-Only mode, cloud calls and cloud speech fallbacks must be blocked rather than silently used. A functioning Ollama endpoint does not prove harness tool execution, model quality or autonomous coding reliability.

Historical local-agent experiments found some harness/model combinations unreliable, including fabricated command output. Direct native Ollama Gemma tests demonstrated actual structured tool calls in one session, but a later Qwen-versus-Gemma comparison stopped before Gemma inference because of resource exhaustion. No comparative winner was established. Recheck models, available memory, disk space and effective context before selecting a runtime.

The intended architecture reuses local reasoning/embeddings where suitable and admits external providers through bounded budgets, model policy and verified capability. A custom OpenClaw MCP adapter and an independently installed upstream OpenClaw are different systems; neither should be assumed connected just because both exist.

Historical execution was fragmented among chat tool loops, organisation execution requests, swarm analysis, workers and optional runners. The preferred direction was selective integration and shared execution/status/budget contracts, preserving useful modules rather than wholesale replacement. Some older swarm agents were tool-less and some UI dispatch acknowledgments did not prove execution; verify the actual path.

The Founder prioritises correctness, speed and low total token spend. Historical soft-budget exhaustion caused skipped background work; this is a dated diagnosis, not a claim about current usage. Never promise unlimited credits, automatic top-ups or free cloud entitlement. Distinguish product subscription, API billing, provider quota and local inference.

## 11. Communications, continuity and runtime

Desired continuity includes laptop, phone and Apple CarPlay. The Founder previously wanted only Marcus, WHINK and MAMBA to initiate calls/texts. This is a desired communication policy, not evidence of implemented channels or granted authorisation to send now.

Scripted telephone calls, SMTP/Twilio/Telegram adapters, a meeting-room URL and full two-way conversational voice are distinct capabilities. Gmail/Calendar/Drive/Contacts, iMessage, live mailboxes and cross-device continuity require their own source and runtime verification.

A personal ECHELON Mac installation historically launched the web app and worker and demonstrated some restart/recovery behavior. Broad authenticated workflow acceptance, clean-Mac installation and named-origin certificate repair were not all proven. Source download alone does not include private data, credentials, local models or configured providers. Passkeys are origin-bound.

The integration sandbox later added separate packaging and optional local recovery. A Mac-off, sleeping or disconnected machine cannot serve local workloads. Reliable Mac-independent operation requires separately approved hosting of required services and model compute, not just hosting the frontend.

## 12. Related WHINK products — separate scope

These projects explain the broader build history. Their inclusion is context, not a request to merge them into ECHELON or change their repositories.

### Marcosville

A separately requested standalone Marcus Vale executive-assistant mobile product and repository. It must own its backend, identity, memory, workers and deployment. ECHELON is read-only study material for that project; do not share its runtime, database, accounts or secrets. A plan and execution prompt were historically produced; no repository/app creation was established. This remains distinct from implementing Marcus inside ECHELON.

### WHINK Pro Assist / WPMA

Repository historically identified as `whinkproducts-alt/Wpma`. The user pursued distinct Interview and Marketing experiences, responsive usability, truthful product messaging, privacy/device-data controls, readiness/preflight, account recovery, entitlement stability, session coaching and realtime resilience.

Historical work reported mode-specific UI/context fixes and verification/password-recovery additions. Session refresh/persistence defects, SMTP delivery, provider funding/configuration and intermittent hosting availability remained unresolved or unverified. The latest broader ten-item improvement request was not evidenced complete. Preserve original knowledge-base encryption material; do not replace keys as a convenience fix. Current deployment health must be checked afresh.

### WHINK Predict

Repository historically identified as `whinkproducts-alt/whinkpredict`. The user wanted comprehensive audits and a unified design/animation prompt with premium storytelling, clear information, WHINK branding, accessibility, responsive public/dashboard experiences and restrained motion. It must avoid copied assets, false affiliation and deceptive product claims.

Historical audit context described a partially integrated SaaS prototype with auth/configuration, billing/entitlement, consent, demo/release-check issues. These are historical findings, not a current audit. The user corrected accidental execution when only a prompt was requested; generated audit outputs were reported reverted.

### WHINK Group website

Historical work built subsidiary pages, company/about content, product listings, brand treatment, image sections and a notice that the trades business was no longer accepting investors. GitHub/Render publication was reported at that time. Current availability and content have not been reverified for this document. Generated/persona portraits and titles do not establish real employees or qualifications.

### WHINK Ultimate UI prototype

An earlier Floot interface and private GitHub snapshot explored agent-network visuals, learning ripples, intelligence intake, Today/approvals, communication handoffs, command navigation and mobile behavior. It remained a high-fidelity mock-data prototype with local-state actions and incomplete backend workflows. The Founder retained its rollback checkpoint. Reuse ideas only after checking ownership, assets and actual integration; do not present the prototype as the backend.

### Allonzyyy

A WHINK coordination skill/plugin concept spanning GitHub, design, Figma, research, database, app-building, analytics, market research, media and canvas tools. Existing agents/capabilities first; actual connected tools determine what works. Web/Work/local Codex availability was historically checked; mobile and universal portability were not established. A Hermes installation instruction file was created, but actual Hermes installation was not proven. A later supplied WHINK plugin folder lacked payload; `/whink` was not established.

### NVIDIA router and DeepSeek Harness

A separate local OpenAI-compatible router was built to adapt NVIDIA-backed streaming and tool-call requests for a harness. Historical streaming/tool round trips and compatibility tests succeeded. End-to-end arbitrary MCP/plugin/agent execution was not established. The host executes tools; the router is not a universal agent runtime, and its name is not evidence of permanent free quota.

### Paper-trading research bot

A separate local Python, paper-only AAPL moving-average baseline was implemented and tested offline. The user expanded the goal toward honest backtesting, costs/slippage, walk-forward evaluation, untouched holdout, baseline comparison and research/news inputs. Live broker/data integrations, research completeness and profitable performance were not established. Dry-run/paper boundaries, duplicate/uncertain-order protection and no real-money execution remain essential; no trading authorisation follows from this document.

### Higgsfield creative work

Historical interest included website/product URL ingestion and UGC video creation. A URL intake workflow is not uploading/hosting an entire website. Historical intake did not prove a generated video. The newer integration-repository connector is a separate, governed provider capability requiring configuration and appropriate approval.

## 13. Latest proposed implementation sequence

The previous turn delivered an execution-plan prompt only. It did not implement or approve the design. The earlier restriction against code changes before design approval remains applicable to that feature work. The current upload request authorises this documentation upload, not the feature build.

Recommended feature sequence, pending applicable approval:

1. Preserve Screen 1 and separate authenticated shared providers from dashboard/executive shells.
2. Establish conversation-bound Marcus identity, Founder-private scope, consent and negative access tests before enabling private data capture.
3. Build shared Founder Office services, persistent ideas, truthful approvals/recommendations and destination links.
4. Replace operational HOLO fixtures and correct the approvals contract.
5. Connect Marcus multi-turn text and current speech services; add interruption/recovery and consented memory.
6. Connect explicit durable initiatives, worker receipts, idempotency and cancellation; persist Kill Team objectives through the authorised path.
7. Verify navigation, scope isolation, real database behavior, approvals, lockdown, local-only behavior, responsive/reduced-motion use and actual Mac speech.

Key acceptance: Marcus recalls a Founder-approved preference later, while ordinary WHINK/MAMBA and other accounts cannot retrieve it. A safe authorised initiative survives refresh and produces exactly one execution and observable result.

Do not pull unrelated media, browser automation, hosting or major dependency work into this feature. Current docs hold Prisma/TypeScript major upgrades for coordinated migration; recheck before any separate upgrade task.

## 14. Working preferences and corrections

- Correctness first, speed second, total token efficiency throughout. Target relevant source and use focused checks.
- Give concise, concrete updates; use labelled A/B/C choices when a decision is necessary.
- A request for a prompt means deliver the reusable prompt, not execute its instructions or publish its outputs without separate authorisation.
- Preserve existing working features, architecture, private data and uncommitted edits.
- Separate intent, source evidence, historical reports and unknowns. Never fabricate command output, tool execution, quality, revenue or completion.
- Audit real onboarding/authentication/recovery paths; mark untested flows explicitly.
- Founder chooses whether tested integration changes are promoted. Do not modify ECHELON-CORP because work in the sandbox is authorised.
- Protected external, financial, destructive, production, permission-changing and Founder-representation actions require applicable exact authorisation. A roster role, model output or stale document is not that authorisation.
- Keep secrets out of chat, Git, logs and handoffs. Do not republish raw private configuration, account exports or transcripts.
- Convert uploaded documents to clean Markdown before ingesting their contents. This handoff uses accessible Markdown/text sources; it does not newly ingest the repository DOCX.
- Do not create agents unless explicitly authorised for the current task. Historical specialist definitions are product data, not permission to spawn workers.

## 15. Evidence and continuation references

Current repository references, inspected at the snapshot above:

- [Repository README](../README.md)
- [Mac sandbox contract](product/ECHELON-INTEGRATIONS-SANDBOX.md)
- [Voice-to-initiative priority and acceptance](product/VOICE-INITIATIVE-EXECUTION-PRIORITY.md)
- [Current and historical pending work](pending-tasks.md) — mixed-age entries; revalidate before treating as current.
- [November 12 upgrade consolidation](UPGRADE-CONSOLIDATION-2026-11-12.md)
- [Organisation-tier architectural proposal](ORG-TIER-PLAN.md) — proposal, not a blanket permission override.
- [Dashboard tabs](../apps/web/components/premium/ECHELONDashboard.tsx)
- [Dashboard shell/providers](../apps/web/app/dashboard/_components/dashboard-shell.tsx)
- [HOLO surface](../apps/web/components/holo/holo-surface.tsx)
- [Conversation implementation](../apps/web/app/dashboard/conversation/_components/conversation-surface.tsx)
- [Persona switching](../apps/web/app/api/persona/switch/route.ts)
- [Private-scope helper](../apps/web/lib/sealed-scope.ts)
- [Speech session route](../apps/web/app/api/voice/session/route.ts)
- [Speech hook](../apps/web/lib/hooks/useVoice.ts)
- [Kill Team surface](../apps/web/components/screens/kill-team/kill-team-screen.tsx)
- [Approval endpoint](../apps/web/app/api/approvals/route.ts)
- [Leadership configuration](../packages/org-kit/organization/whink_group_leadership.json) — registry data, not proof of real people or active agents.

Historical evidence consulted: October 4 paper-bot baseline; October 6 group-site work; October 13 UI prototype; October 27 specialist/memory and local-agent work; October 29 WPMA/Predict/Higgsfield records; October 30 architecture/model audits; November 3 Allonzyyy and spend-control work; November 6 NVIDIA router; November 7 Mac installation and Marcosville planning; November 10 ECHELON vision/handoff. These are dated session summaries, not freshly audited implementations of every related product.

## 16. Sanitisation record

This document intentionally excludes API/access tokens, passwords, private keys, connection strings, cookies, raw environment files, private database exports, personal contact addresses, absolute user-machine paths, and raw conversation archives. Only product context, repository references and non-secret code identifiers are retained. Historical credentials or security findings are described categorically without reproducing values.

Before relying on any capability or readiness statement, inspect its current owning source and, where consequential, run the appropriate authorised acceptance test. This document preserves knowledge; it grants no standing authority to spend, send, deploy or disclose private information.
