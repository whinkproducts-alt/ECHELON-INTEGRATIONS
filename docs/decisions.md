# Decisions log

Newest first. Each entry: date, decision, alternatives, reason.

## 2026-10-25  Phase 3d assurance — security and compliance fixes

### D1 Security findings applied (H1–H5, M5, M7)

**H1 — Cross-tenant document delete and missing Document model.**
Decision: add `Document` table (migration `20261025030000`) with one row per uploaded file.
`DELETE /api/documents/[id]` now: (a) awaits `params` (Next 16 Promise API), (b) looks up the `Document` row filtered by `{ id, userId }`, (c) returns 404 + security ledger event if the caller does not own it.
`POST /api/documents/upload` now writes a `Document` record after a successful upload.
Alternative considered: trust AnythingLLM's own ID space — rejected because WHINK must enforce tenant isolation independently.

**H2 — `isSensitive()` missed most categories.**
Decision: rewrote `SENSITIVE_PATTERNS` in `auto-memory.ts` with broader lexicons covering ADHD/autism, medications, family relations (named and unnamed via "my wife/daughter/etc."), legal/criminal terms, street address patterns, SIN, and income amounts.
Alternative: rely on the LLM to classify — rejected because the permission check must happen before the model sees the candidate.

**H3 — `isSecret()` bypassed by natural language and common key prefixes.**
Decision: rewrote `isSecret()` with NFKC normalisation (strips zero-width homoglyphs), vendor key prefixes (sk-ant-, ghp_, AKIA, xoxb-, AIza), JWT pattern, Luhn check for card numbers, and natural-language passphrase patterns.
Also: skip the entire turn for auto extraction if the raw user message itself contains a secret.

**H4 — Document chunks from AnythingLLM entered model context without injection scan.**
Decision: apply both `filterToolResult` and `scanForInjectionPatterns` to `documentName` and `text` before placing in context. If either fires, log `document_injection_blocked` and skip the chunk. `documentName` is now inside the `<untrusted>` envelope, not outside it. `document_recall_unavailable` is now only logged on a caught exception, not on an empty result set (which is a valid no-match). Added `externalContentThisTurn: boolean` to `RetrievedContext`.

**H5 — Paid cloud embedding fallback + no dimension validation + no error handling.**
Decision: removed branch 3 from `embed()` (the `OPENAI_API_KEY`-alone path to `text-embedding-3-small`). All three fetch branches are now wrapped in `try/catch` returning null. Added `validateEmbedding()` which checks `Array.isArray`, `length === EMBEDDING_DIM` (from `EMBEDDING_DIM` env, default 768), and `Number.isFinite` on every element.
`searchMemory()` vector queries are now wrapped in `try/catch`; a dimension mismatch falls through to full-text, then text-match, with `searchMode` in the return value.
Alternative: keep the fallback with a feature flag — rejected to eliminate silent cost and data breach risk.

**M5 — Upload and delete bypass permission engine.**
Decision: `POST /api/documents/upload` now calls `checkPermission(userId, 'document_upload', 'A')` before proceeding. Class A always passes, but the check is wired so a future policy change takes effect without touching the route.

**M7 — MAMBA persona check was case-sensitive.**
Decision: compare `persona.toUpperCase() === 'MAMBA'` throughout `auto-memory.ts`.

### D6 Compliance findings applied (PIPEDA / Alberta PIPA)

**PIPEDA Q2 (blocker) — No memory list API.**
Decision: added `GET /api/memory` with cursor pagination. Returns one memory type per call (semantic / episodic / hypothesis / procedural), scoped by `userId`. Combines with the existing `DELETE /api/memory/[id]` to satisfy the access-and-deletion right.

**PIPEDA Q3 (blocker) — No document inventory.**
Decision: `GET /api/documents` now reads from the new `Document` table as the primary inventory (not AnythingLLM). AnythingLLM's list is supplementary. Cursor-paginated, scoped by `userId`.

**PIPEDA Q4 (pre-launch gap) — No privacy notice, no consent flow.**
Decision: deferred to Phase 6 (onboarding). The Connected Apps OAuth flow must present scope and purpose before the first token exchange. Recorded here so it is not forgotten.

**PIPEDA Q5 (pre-launch gap) — No retention or deletion schedule.**
Decision: deferred to Phase 6. A background job that respects a per-user retention policy must exist before public launch. Memory rows have `createdAt`; the job will filter by that.

**Licence notes (D6 compliance-checker).**
- AnythingLLM: MIT licence. Confirmed.
- `mapbox-gl`: BSL 1.1 in v2+; pin to v1.x (Apache 2.0) until a libre alternative (`maplibre-gl`, Apache 2.0) is evaluated. No current usage found in `apps/web` — note recorded to block any future addition of v2+.
- All new dependencies added in Phase 3a–3c are MIT, Apache 2.0 or BSD. Compliance-checker confirmed.

## 2026-10-25  Phase 3 learnings sync

Summary of what was built in Phase 3a and the early 3b/3c work, as observed in code on 2026-10-25.

### New schema tables and fields
- `DocumentWorkspace`: one row per user, holds their AnythingLLM workspace slug. The shared `ANYTHINGLLM_WORKSPACE_SLUG` env fallback is present in `.env.example` for migration but should not be used in new code. `document_workspaces` is the authoritative source. `@@unique([userId, workspaceSlug])` enforces one workspace per user.
- `embeddingModel String?` on both `MemoryEpisode` and `MemorySemantic`: records the model that produced the row's embedding. Vector search filters by this field so mixed-model comparisons never happen.
- `vector(768)` column on both tables (down from `vector(1536)`): matches `nomic-embed-text` output dimension. HNSW cosine index (`vector_cosine_ops`, `m=16`, `ef_construction=64`) added by migration `20261025000000_phase3a_embeddings`.

### Embedding model rationale
Default: `ollama/nomic-embed-text` (768-dim, Apache 2.0, runs locally via Ollama, nothing leaves the Mac). Configured via `EMBEDDING_MODEL=ollama/nomic-embed-text`. Changing to an OpenAI model (e.g. `openai/text-embedding-3-small`, 1536-dim) requires a new migration to resize the vector column and a `pnpm memory:reembed` run to backfill existing rows. Choosing a paid default needs Victor's approval first.

### AnythingLLM version — NOT yet bumped (status 2026-10-25)
The compose file is pinned to `1.7.4`. The earlier decision entry (2026-10-25, "AnythingLLM version bump: pinned to 1.18.0") recorded the intent; the 3c agent did not execute the bump because `1.7.4` lacks a pure retrieval endpoint. `lib/anythingllm-client.ts` uses `/api/v1/workspace/:slug/chat` with `mode: "query"` and discards the `textResponse` (LLM output), using only the `sources` array. This is a workaround. The TODO in the client reads: "upgrade to AnythingLLM 2.x for a pure retrieval endpoint". The version bump is an open task for devops-engineer.

### Auto memory permission split (lib/auto-memory.ts)
`lib/auto-memory.ts` is the single extraction path. It classifies each candidate:
- **Class A** (`memory_auto_write`): routine facts — preferences, work context, procedural notes.
- **Class B** (`memory_auto_write_sensitive`): health, money and account numbers, legal, family and relationships, home address, identity documents, third-party personal facts. Requires a delegation row or sufficient autonomy level. Ledger row records category but never the statement text on denial.
- **Dropped before any permission check**: credentials matching password/key/token/card-number patterns. Ledger row is `memory_secret_dropped` with no content.
Confidence capped at 0.8 for inferred memories. MAMBA turns produce `hypothesis` rows, confidence capped at 0.4. Daily cap: 200 writes per user per day (configurable via `MEMORY_DAILY_CAP`). At most 5 candidates per turn. Extraction starts as a detached promise — never awaited, failures never surface to the user.

### Context engine blending strategy
`context-engine.ts` (or the context assembly path) returns memory and document recall results in one ranked list, each tagged `type: "memory" | "document"`. Both fit within the existing token budget. Document chunks carry citation fields: `title`, `chunkId`, `page`, `score`. All citation fields and chunk text are wrapped as untrusted before entering model context. A chunk whose text contains injection-pattern content is dropped and ledgered as `document_chunk_blocked`.

### New env vars added in Phase 3 (not previously in .env.example)
- `MEMORY_DAILY_CAP` (auto-memory.ts, B12): integer, default 200. Per-user daily write limit for auto extraction.
- `DOCUMENT_MAX_SIZE_MB` (upload route, C6): integer, default 25. Maximum document upload size in megabytes.

## 2026-10-25  AnythingLLM memory budget and external drive storage
Decision: AnythingLLM container is capped at 4 GB RAM in compose. Storage uses a named Docker volume for now. When Victor moves to the 2TB external drive, devops-engineer remaps the volume mount to `/Volumes/<drive>/whink-data/anythingllm` in `services/anythingllm/docker-compose.yml` — one-line change, no rebuild needed. Logged as a Phase 6 devops task.
Alternatives: set no memory cap (risk of Mac Mini OOM under heavy document load); use a bind mount path immediately (requires the drive to be present on every dev machine).
Reason: 4 GB is generous for a Node.js + SQLite AnythingLLM instance with no local LLM (WHINK uses it for retrieval only). The named-volume approach keeps the compose portable across machines until the drive is the permanent home.

## 2026-10-25  AnythingLLM version bump: pinned to 1.18.0, use /query endpoint
Decision: bump the AnythingLLM pinned image from 1.7.4 to 1.18.0 (latest stable semver tag as of 2026-10-25, verified on hub.docker.com/r/mintplexlabs/anythingllm/tags). Switch the adapter from `/api/v1/workspace/:slug/chat` to `/api/v1/workspace/:slug/query` (retrieval-only, no model call). The adapter is updated in `lib/anythingllm-client.ts`; the compose is updated in `services/anythingllm/docker-compose.yml`.
Alternatives: keep 1.7.4 and work around the missing endpoint; switch to a different retrieval service.
Reason: the `/chat` endpoint runs AnythingLLM's own embedded model outside the WHINK model router (violates non-negotiable 8). The `/query` endpoint returns ranked chunks with source metadata and makes no model call. Version 1.18.0 is a stable 1.x release; the interface is compatible with the existing workspace API.

<!-- Phase 3 entries below: lead-architect plan, 2026-10-25. Proposed, not yet confirmed by Victor. Phase 3 starts after Victor passes the Phase 2 checklist. -->

## 2026-10-25  Phase 3: AnythingLLM in its own hardened compose, retrieval only
Decision: AnythingLLM stays in `services/anythingllm/docker-compose.yml`, separate from the gateway's compose. It gets the same hardening as `services/openclaw`: pinned image, 127.0.0.1 only, memory limit, token required. WHINK uses it for retrieval only. It never runs AnythingLLM's own LLM on the recall path, and its embedder is local. `lib/anythingllm-client.ts` is the only code that knows the transport. `document_workspaces` is the only source of a user's workspace. The shared env slug fallback is removed.
Alternatives: add AnythingLLM as a second service in the OpenClaw compose file; add it to the root compose with Postgres; keep the `/chat` query-mode endpoint and discard its text.
Reason: one compose per swappable service means a recall swap does not touch the gateway, which matches the 2026-10-03 gateway decision. The `/chat` endpoint runs a model outside the model router (non-negotiable 8) and may call a paid provider configured inside AnythingLLM without WHINK knowing. A shared env workspace lets two tenants read one document store (non-negotiable 2).
Open for Victor: if the pinned 1.7.4 image has no retrieval-only endpoint, the builder bumps the pinned version. That is a version change, not a vendor change, but it will be logged.

## 2026-10-25  Phase 3: document citations are untrusted, every field
Decision: every recall result from AnythingLLM carries a citation (document name, chunk id or index, page when available, score). The chunk text and every citation field are stripped of fake envelope tags, injection-scanned, capped and wrapped as untrusted before model context. A flagged chunk is dropped and ledgered. Reading documents marks the turn as having external content, so auto memory skips that turn.
Alternatives: wrap only the chunk text and trust the metadata; treat user-uploaded documents as trusted because the user chose them.
Reason: a document the user uploads can still be written by someone else (a contract from the other side, a forwarded PDF). File names and page labels are attacker-controllable too. Non-negotiable 6 makes no exception for content the user carried in. Skipping auto memory on those turns stops a planted document from becoming a "fact" WHINK repeats later.

## 2026-10-25  Phase 3: auto memory is Class A routine, Class B sensitive, secrets never
Decision: every auto-extracted memory goes through `checkPermission` before it is written. Routine facts use capability `memory_auto_write` (Class A). Sensitive facts use `memory_auto_write_sensitive` (Class B), which needs a delegation or the autonomy level. Sensitive covers health, money and account numbers, legal, family and relationships, location, identity documents and third-party personal facts. WHINK classifies them, not the extractor's own label alone. Credentials and secrets are dropped before the permission check at any class. Every candidate, written or not, is one ledger row, and denied rows hold the category only, never the text. MAMBA turns produce hypotheses only (confidence at most 0.4). Auto memories are INFERRED with confidence capped at 0.8 until the user confirms them.
Alternatives: write everything as Class A (the inherited behaviour, with no permission check at all); make all auto memory Class C; queue sensitive facts for review instead of dropping them.
Reason: remembering is an action, so it goes through the engine and the ledger like any other (non-negotiables 4 and 5). Class C on every turn would bury Victor in approval cards and kill the feature. Class B lets Victor grant sensitive memory once, by delegation. Secrets have no safe class. A review queue is more scope than Phase 3 needs, so it is left for later if Victor asks.

## 2026-10-25  Phase 3: embeddings go through the model router, model stamped per row
Decision: the model router gets an `embed()` function, and it is the only code that calls an embeddings endpoint. The embedding model is config. There is no hardcoded fallback to a paid provider. Each row records the model that embedded it. Search only compares rows from the current model, and a resumable, per-user backfill re-embeds the rest. The vector column size matches the configured model, and vectors of the wrong size are rejected, not written. HNSW cosine indexes replace sequential scans. Semantic dedup on write uses cosine similarity (default threshold 0.92) and updates the existing row instead of inserting a duplicate.
Alternatives: keep `lib/embedding-service.ts` calling providers directly (the inherited behaviour); pad or truncate vectors to one fixed size; store one column per model.
Reason: non-negotiable 8 covers every model call, embeddings included. The inherited silent OpenAI fallback sends memory text to a paid vendor because a key happens to be set. Padding vectors gives wrong similarity scores. One column per model adds schema churn every time a model changes. Stamping the model on each row plus a backfill keeps the swap a config change.
Open for Victor: which embedding model is the default, which sets the column size. The plan recommends local Ollama `nomic-embed-text` (768, Apache 2.0, free, nothing leaves the Mac). The alternative is OpenAI `text-embedding-3-small` (1536, paid service). Choosing a paid default needs his approval.

## 2026-10-25  --destructive is a separate token from --denial
Decision: `--destructive` (`0 72% 51%`) remains a distinct CSS token for generic UI errors (form validation, destructive button variants). It is not aliased to `--denial` (`356 77% 59%`).
Alternatives: alias `--destructive` to `--denial` so one colour covers all error states.
Reason: the two tokens carry different semantic weight. `--denial` signals a security or permission event (access denied, security block) and appears in the ledger, Neural Link, and approval UI. `--destructive` is a neutral UI affordance for irreversible actions and form errors — using the denial colour there would train the eye to ignore it in actual denial contexts.

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

## 2026-10-25  Dynamic model routing in model-router.ts
Decision: `selectModel()` added to `lib/model-router.ts`. It scores messages using keyword patterns and selects Haiku 5.5 (score 3 or less), Sonnet 5.5 (4 to 6) or Opus 5.5 (7 or more). MAMBA always routes to Opus. Large output (over 2000 tokens) bumps the tier. Callers pass `ModelSelectionHints`; `forceTier` overrides scoring. Routing stays inside the model router, so no route picks a provider or model directly.
Alternatives: one fixed model per persona; let each route choose its own model.
Reason: cost efficiency without sacrificing quality for complex tasks.

## 2026-10-25  Persona switch route now ledgers every switch (A2, L-1)
Decision: `POST /api/persona/switch` and the orchestrator persona-switch path both call `recordActionSafe` after a successful upsert.
Alternatives: ledger only the route path and leave the orchestrator path silent (the previous behaviour).
Reason: non-negotiable 5. Every action lands in the ledger.

## 2026-10-25  Cross-turn taint propagation (M-1)
Decision: when `externalContentThisTurn` is true after a tool loop run, the taint flag `__taint__:<conversationId>` is written and awaited. Previously it was set only on injection-blocked user messages. Turn 2 reads this flag and sets `conversationTainted: true`.
Alternatives: taint only on blocked user messages (the previous behaviour); fire-and-forget the flag write.
Reason: external content injected in turn 1 could survive in assistant text and replay as trusted context in turn 2. The write is awaited so turn 2 cannot race ahead of it.

## 2026-10-25  memory_read and calendar_list added to EXTERNAL_TOOLS (M-2)
Decision: `memory_read` and `calendar_list` now go through the full sanitise, NFKC, injection-scan, wrapAsUntrusted pipeline and set `externalContentThisTurn = true`.
Alternatives: treat stored memory and calendar data as trusted internal content (the previous behaviour).
Reason: stored memory can contain content that originated outside WHINK (pasted emails, auto-extracted facts). Treating it as trusted violated non-negotiable 6.

## 2026-10-25  correlationId, persona, initiator required on OAuth and autonomy ledger rows (M-3)
Decision: `social_connect_failed`, `social_connected`, `social_connection_expired`, `social_disconnected` and `autonomy_level_change` ledger rows now carry `correlationId` (randomUUID per request), `persona` and `initiator`.
Alternatives: leave these fields optional for non-tool events.
Reason: A2 requires all seven fields on every ledger write. Missing fields made incident tracing impossible.

## 2026-10-25  Tool limit clamped to 1 to 20 (L-4)
Decision: `memory_read` and `document_search` clamp `params.limit` to `Math.min(Math.max(1, floor(limit)), 20)`.
Alternatives: trust the model-supplied limit (the previous behaviour); reject out-of-range values with an error.
Reason: unbounded model-supplied limits could pull excessive data into context and strain the database. Clamping keeps the tool usable when the model asks for too much.

## 2026-10-25  --primary and --ring remapped to WHINK accent (E7)
Decision: `--primary: 204 100% 61%` (WHINK accent #38B6FF) in `:root` and `.dark`. `--ring` follows.
Alternatives: keep the previous green value (`160 84% 39%`).
Reason: the green had no basis in the WHINK design token palette and conflicted with the product identity. Follows the 2026-09-23 decision that the accent is azure #38B6FF.

## 2026-10-25  CASL deferred to Phase 6
Decision: social write tools (post, reply, DM, schedule, delete, follow, unfollow) stay Class C at all autonomy levels. CASL compliance (consent and unsubscribe for commercial messages) is required before white-labelling. Victor's personal use proceeds now. Canadian counsel to be engaged before Phase 6 (billing).
Alternatives: build consent and unsubscribe handling now, before any personal use.
Reason: with one user approving every send by hand, nothing goes out as unsolicited commercial messaging on WHINK's initiative. Paying customers change that, so the work is tied to the product shell phase.
