# Decisions log

Newest first. Each entry: date, decision, alternatives, reason.

<!-- Entries 2026-10-03 below: approved by Victor, relayed to lead-architect by the WHINK orchestrator on 2026-10-03. Victor confirms them by running the Phase 2 checklist. -->

## 2026-10-03  Suspicious user input is blocked, ledgered and surfaced
Decision: when the injection scan flags a user message, the message is not sent to the model. The block is written to the ledger and pushed to Neural Link as an SSE `security` event. The user sees a plain refusal.
Alternatives: scan and ignore the result (the inherited behaviour); warn the model in the prompt but still send the text.
Reason: a scan whose result is ignored is not a control. Blocking before the model is the only point where the text cannot influence a tool call.

## 2026-10-03  MAMBA Obsidian only, enforced in schema and data
Decision: follow through on 2026-09-23. `mambaMode` accepts only Obsidian (or null for WHINK) at the schema and validation layer. Existing WHITE and GREY rows are migrated to Obsidian. Code paths that default to WHITE are removed.
Alternatives: leave the column free text and only change the interface.
Reason: if the database still accepts WHITE and GREY, a stale client or a crafted request can bring them back.

## 2026-10-03  Social OAuth tokens in a `social_connections` table, encrypted
Decision: new `social_connections` table scoped by userId. Access and refresh tokens are encrypted with AES-256-GCM through `lib/key-encryption.ts` and never returned to the client. OAuth 2.0 with PKCE and a single-use `state` bound to the user session. Redirect URIs must match a server-side allow-list exactly.
Alternatives: store tokens in the gateway container; store them in env vars; reuse the BYOK key table.
Reason: tokens are per tenant, so they belong in the tenant-scoped database, not in a shared container or env. A separate table keeps social scopes and refresh metadata apart from model API keys.

## 2026-10-03  Social permission classes
Decision: reads (own feed, mentions, DMs) are Class A and their results are always wrapped as untrusted. Post, reply, DM, schedule, delete, follow and unfollow are Class C, never delegable and never automatic at any autonomy level. A scheduled action creates its approval request at schedule time. The approved content is hash-locked: what executes must hash to exactly what was approved, or it does not run.
Alternatives: Class B for replies and DMs with delegation; approve scheduled posts at send time.
Reason: anything public or sent to another person speaks for Victor and cannot be taken back. Approving at schedule time with a hash lock means nothing can change between the approval and the send.

## 2026-10-03  Social connector framework, official APIs only
Decision: each social platform is a tool set exposed by the gateway. X (Twitter) is the first platform. X, Instagram and TikTok ship as skeleton connectors this phase; Victor adds credentials later. Meta app review is to be decided. TikTok is post only (it has no DM API). Official APIs only. No scraping, no browser automation.
Alternatives: scraping or headless browser automation; a third-party social aggregator service.
Reason: scraping breaks platform terms and gets accounts banned, and nobody can sell that to a customer. An aggregator would be a paid vendor lock. Open item for Victor: X API read and DM access needs a paid X tier, and Meta needs app review. Both are paid-service or vendor decisions that need his approval before credentials go in.

## 2026-10-03  WHINK builds its own MCP gateway behind the existing adapter
Decision: WHINK builds its own MCP gateway in `services/openclaw`, behind the existing adapter `lib/openclaw-client.ts`. The adapter is the only code that knows the transport. Any MCP server published on GitHub must plug in by changing docker compose only (image plus mounted config), with no WHINK code change. Tool names stay `openclaw__<platform>__<action>`. The rest of WHINK does not know the transport exists.
Alternatives: the upstream OpenClaw image (not published at the referenced path, so the compose file builds a stub); direct per-platform SDKs inside WHINK (rejected as vendor lock).
Reason: owning a thin gateway keeps WHINK swappable and sellable. Putting every transport detail in one adapter means a gateway swap costs one file, not a refactor.

## 2026-10-03  Approvals by id, 30-second expiry, executed exactly once
Decision: every approval request (EAR or pending tool call) has an id. An approval must reference that id. A request expires 30 seconds after it is issued. The approval decision is evaluated through `permission-engine.ts`. An approved queued tool call runs exactly once, enforced by an atomic state change, not by application checks.
Alternatives: approve "the most recent pending request" on a bare "approved" reply (the inherited behaviour); no expiry; approvals handled outside the permission engine.
Reason: approving "the latest" can approve the wrong action if two are pending. Expiry stops a stale approval being used later. Exactly-once stops a retry or double click from posting twice.

## 2026-10-03  Tool use on every provider through the model router
Decision: tool calling works on Anthropic, OpenAI-compatible endpoints (including Ollama) and Gemini, all through the model router. Every tool call goes through `executeTool` and then `checkPermission`. No provider SDK is imported outside the router.
Alternatives: tools on Anthropic only, other providers chat-only (the inherited behaviour).
Reason: the Phase 1 promise was that changing config changes the model, not the product. Tools that only work on one provider break that promise and lock WHINK to that vendor.

## 2026-10-03  `lib/ledger.ts` is the only write path to the action ledger
Decision: a new `lib/ledger.ts` is the only code that writes to the action ledger. The Prisma `action` table stays the store. No other file calls `prisma.action.create` or `prisma.action.update`.
Alternatives: keep direct Prisma writes spread across files (the inherited behaviour); move the ledger to a separate store.
Reason: one write path gives one place to enforce required fields, tenant scope and redaction, and makes "nothing runs silently" something a test can check by grepping.

## 2026-10-02  Phase 4 Voice architecture
Browser Web Speech API as primary STT/TTS in development (zero dependencies).
Server routes /api/voice/stt and /api/voice/tts bridge to Whisper + Kokoro for production/offline.
ADA V2 maps to the TTS_URL/STT_URL env vars — swap the URL to point at ADA when it is running.
Spoken approvals: client-side EAR reading + speech recognition for "approved"/"denied".

## 2026-09-27  No blinking
The avatars do not blink. Animation is limited to audio driven mouth shapes, a subtle breathing motion, and state changes in the interface.
Reason: a convincing blink needs a hand drawn eyes closed frame per character; not worth the cost.

## 2026-09-27  Build team as Claude Code subagents
Twelve project level agents in .claude/agents: five builders, five assurance agents, two guardians. Assurance agents never write the code they check.
Alternatives: installing all 37 contains-studio agents globally.
Reason: that collection targets fast consumer app studios (TikTok, Instagram, whimsy) and has no security reviewer or AI evaluator. It also has no licence file, so it is used as a structural reference only, not copied into this product.

## 2026-09-27  Monorepo layout
apps/web holds the Next.js core. services/ will hold voice, gateway and recall services.
Reason: keeps WHINK's owned code separate from swappable open source services.

## 2026-09-23  Super Jarvis stack
WHINK core plus ADA V2 (voice and vision), OpenClaw (actions), AnythingLLM (documents), model router. LibreChat dropped. Open Voice OS optional.
Reason: all MIT or Apache, so the product can be sold; WHINK already covers LibreChat's role.

## 2026-09-23  MAMBA is Obsidian only
Lawful hardest adversary. White and Grey modes to be removed.

## 2026-09-23  WHINK accent is brand azure #38B6FF
Chosen over emerald to match The WHINK Group. Avatar HUD currently cyan #4FF3EE; decision pending.
