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

## 2026-10-15  Daily SMS briefing via Twilio
Added lib/twilio-adapter.ts (plain fetch, no SDK, no new dependency) and lib/sms-briefing.ts, started from instrumentation.ts next to the scheduled post worker. Outbound only, off by default, recipient from env only. It is not a model tool, so injected text cannot trigger it. Capability sms_briefing_send is Class B: it needs a delegation row or autonomy 2 or higher, otherwise it is DENIED and ledgered once per day. Once per day is enforced from the ledger (correlation id sms-briefing:YYYY-MM-DD), so no new table.
Reason: the directive asked for an org-kit scheduler job. org-kit has no scheduler, so the job lives where WHINK's existing worker runs. Replace the adapter file to change SMS provider.
Open: send time zone is ambiguous in the request (4:15pm CST and 14:15 CST disagree). Defaults to 16:15 America/Edmonton, configurable. Report source is a folder of JSON files because no directorate report store exists yet.

## 2026-10-23  Gesture pipeline (Stream 3)
Added lib/gesture/* and /api/gesture (POST), /api/gesture/key (GET), /api/gesture/stream (SSE). The server classifies 10 gestures from raw MediaPipe landmarks and never reads a gesture name from the client. Confidence is scored on the server on a 300 point scale (base 100, stability 60, geometry 80, temporal 60, encoder 50). The encoder slot is pluggable and scores 0 until a learned encoder is registered, so the reachable maximum is 250 and thresholds are set against 250 (200 for gestures that create work, 170 for UI state).
Signing: HMAC-SHA256 over the raw body. Keys are derived per user and session from GESTURE_HMAC_SECRET (no stored keys, one hour life, expiry bound into the derivation). Replay protection by single use nonce and a 2 second clock window. Rate limit 100 per minute per user, sliding window, counted before signature check.
Permissions: no gesture is Class C and no gesture can decide an approval, because approvals must name a request id. Point only proposes: it creates an EAR (approval card) with the pointed agent as lead. Crush is Class B (speaks aloud). The rest are Class A UI state. Every dispatch goes through checkPermission and lands in the ledger. Ledger rows hold gesture name and confidence only, no coordinates.
Not decided here: the intent table is a proposal. The file gesture-mediapipe-spec.md named in the task does not exist in the repo, so the gesture to intent mapping needs Victor's confirmation.
Limits: nonce cache, rate limiter and HOLO bridge are in memory, correct for one server process. A multi instance deployment needs a shared store behind the same interfaces. Classifier thresholds are tuned on synthetic hands only.

## 2026-10-23  Neon database prepared, not connected
Added directUrl = env("DIRECT_URL") to the Prisma datasource. App traffic uses DATABASE_URL (Neon pooled host). Migrations use DIRECT_URL (non-pooled host), because PgBouncer transaction mode breaks Prisma migrate advisory locks. Locally both point at the same Docker Postgres.
Steps for Neon: create the project with Postgres 16, run CREATE EXTENSION vector (migration 20261002083522 already does this), copy both connection strings into the untracked .env, then run npx prisma migrate deploy. If connections fail, remove channel_binding=require from the URL. Do not use the current password: it is being rotated, and it must never enter git.
No init_schema migration was created. The repo already has 20 migrations including 20261002045845_init, and a second baseline would conflict with them. Fresh Neon databases get the full history from migrate deploy.
