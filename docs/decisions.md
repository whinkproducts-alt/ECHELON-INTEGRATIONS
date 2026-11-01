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

## 2026-10-25  Human names for every role
Decision: the five Innovation & Opportunity seats now have invented human first and last names (Amara Okafor, Mateo Restrepo, Priya Raghunathan, Soren O'Connell, Mei-Ling Tan). `StaffMember.kind` is `'human'` for Victor and Marcus and `'agent'` for the five personas. Emails come from one function, `staffEmail()`: lowercase ascii, accents folded, apostrophes dropped, hyphens kept. Role and title stay as job description fields. Only the directorate table in CLAUDE.md changed.
Alternatives: keep role-based addresses such as innovation.lead@; leave names out of the table.
Reason: Victor wants every role to read as a person. Marking agents as `agent` keeps it honest that they are personas, not staff.

## 2026-10-25  Board data comes only from Victor
Decision: `apps/web/config/board.json` is the board roster. Only people Victor named are in it: Victor, Marcus, Anthony Igboekwe, Dr Tinaye, Barrister Genevieve, Juliet Igboekwe. Where he gave no surname, seat or email, those fields are null and `needsDetails` is true so the UI can show "details pending". The honorific is its own field. Nothing is guessed, including the emails of Anthony and Juliet (surnames known, seat and confirmation not). `scripts/import-board.ts` loads the rest from a folder on Victor's Mac: dry run by default, `--write` to apply, photos checked by magic bytes and capped at 5 MB, image URLs limited to same-origin `/board/*`. The roster is tenant-level config; board meetings are per user in `board_meetings`. Minutes are untrusted on read.
Alternatives: seed plausible directors; store the roster in the database.
Reason: inventing board members would put false people in a governance screen. A file is easy for Victor to review.

## 2026-10-25  Connector licence gate and honest status
Decision: plugin manifests are validated by a zod schema. Licence must be MIT, Apache-2.0, BSD-*, ISC or 0BSD (CLAUDE.md rule 7); anything else, including "MIT OR AGPL", is rejected. Manifest `permissionClass` is advisory: third-party connectors are always Class C. Endpoints must be https (or loopback http), with no credentials and no stdio commands. Tool descriptions are stripped, injection-scanned, rejected if suspicious, and capped at 300 characters. Validation never executes code or contacts an endpoint. Status (`available | connected | needs_config | unavailable`) is computed from evidence only (env vars, a database row, a service that answers), never from the catalog. Install and uninstall are the Class B capability `connector_manage`. `CAPABILITY_CLASSES` in the permission engine is the registry; an unregistered capability is Class C and a caller asking for a lower class than registered is refused.
Alternatives: trust the manifest class; mark catalog entries connected by default.
Reason: a plugin must not grant itself power, and the connectors screen must not claim a connection that does not exist.

## 2026-10-25  Offline fallback is off by default
Decision: `WHINK_OFFLINE_FALLBACK=true` turns on local-model routing in the tool loop. Default is off, so current behaviour is unchanged. When on, an unreachable cloud provider (probe of the host the router is configured for, cached 10 s) or a hit hard budget switches the call to `WHINK_LOCAL_MODEL` (default llama3.1:8b) if Ollama answers, writes a `model_fallback_local` ledger row with the reason, and drops any per-user cloud API key so it is never sent to the local endpoint. Usage is recorded fire-and-forget into `usage_events` from the tool loop. Monthly budget lives on `user_preferences`, with `WHINK_MONTHLY_TOKEN_BUDGET`, `WHINK_BUDGET_SOFT_PCT` and `WHINK_BUDGET_HARD_PCT` as tenant defaults. Cost is 0 unless `WHINK_MODEL_PRICES` is set; prices are not guessed.
Gap: plain `streamChat` and `chatOnce` calls are not yet usage-recorded (they do not carry a userId).
Alternatives: switch on by default; hardcode provider URLs for the probe.
Reason: silently changing which model answers is a behaviour change Victor should choose.

## 2026-10-25  Contact messages and calls reuse the Class C approval flow
Decision: `POST /api/contacts/[id]/message` and `/call` call `createApproval` (kind `tool_call`, tools `contact_message` and `contact_call`, Class C). They return the approval id. On approval, the existing `decide` and `executeApprovedTool` run the handler, which re-reads the contact (scoped by user), checks the destination still matches the approved one, then calls `lib/comms/delivery.ts`. `comms_requests` only links a contact to its approval. No parallel approval code exists. If WHINK has no earlier comms record for the contact, the approval payload carries `casl: 'review_consent'`. Telegram needs a chat id, kept as a contact tag `telegram:<id>`.
Alternatives: a separate comms approval table.
Reason: one approval path means one set of guarantees (30 s expiry, id-bound, hash lock, atomic, ledgered).

## 2026-10-25  What is stubbed
- Sending: `sendToContact` and `placeCall` return `{sent:false, reason:'not_configured'}` without provider env, and even with env the Twilio, SMTP and Telegram sends are not built. An approved send therefore ends FAILED with "not sent: ...", which is the truth.
- Connectors: Gmail, Google Calendar and Google Drive have no WHINK adapter and show `unavailable`. Slack, GitHub, Figma, Notion, Linear and Stripe appear only as gateway platforms and show `connected` only when the gateway exposes their tools.
- Rate limiter is in memory (per process); the store interface is ready for Redis.
- GitHub settings (branch protection, push protection, 2FA, signed commits) cannot be set from code. See docs/security.md.

## 2026-10-25  middleware.ts renamed to proxy.ts
Decision: Next 16 deprecates the `middleware` file name. The file is now `apps/web/proxy.ts` with the same default export. It adds the full security header set (HSTS only for https deployments, COOP/CORP same-origin, camera and microphone for self only) and rate-limits sign-in and sign-up by client address.
Alternatives: keep the deprecated name.
Reason: avoids a deprecation warning and a future break.

## 2026-10-25  Security review fixes (rate limits, owner-only facts, budget cap, local fallback)
Decision: `X-Forwarded-For` is trusted only when `TRUSTED_PROXY_HOPS` is set (Nth address from the right); otherwise sign-in and sign-up use a looser per-route bucket plus a per-account bucket. Body caps are enforced while streaming. The tenant token cap is a ceiling users cannot remove (`monthlyTokenBudget` is now BIGINT). The local fallback targets `OLLAMA_URL` explicitly, refuses a non-local URL, and never forwards a cloud key. The board roster and operator-credential status are visible only to `WHINK_OWNER_EMAILS` accounts; unset means nobody.
Alternatives: trust XFF always; one shared "unknown" bucket; first-user-is-owner.
Reason: client-controlled headers must not set a security key, one global bucket lets an attacker lock the owner out, and a new signup must not see operator data.

## 2026-10-26 Subsidiaries and project assignment

- The WHINK Group has five subsidiaries: consult, real-estate, trades, apps, frontliners. Their static facts (intro, about, services, directors) live in `apps/web/config/subsidiaries.json`, read through `lib/subsidiaries.ts` and validated by zod. Facts come from Victor's own Group website, read 2026-10-25. Nothing beyond those facts is added.
- `projects.subsidiary` is a nullable string with an index on (ownerId, subsidiary). Null means unassigned, which covers every legacy project. There is no database enum: the five ids are validated against the config in code, so adding a subsidiary is a config change, not a migration.
- Reassigning is its own action. A change through PATCH or PUT on a project is ledgered as `project_subsidiary_set` with the before and after ids, written through `lib/ledger.ts`.
- API: `GET /api/projects` is additively enriched to ProjectCard, `GET /api/subsidiaries`, `GET /api/subsidiaries/[id]/projects` (id `unassigned` allowed) and `GET /api/projects/[id]/report`. All are Class A reads, scoped to projects the user owns or is a member of, with aggregates done by groupBy so the query count does not grow with the number of projects.
- Contracts are not modelled. No Contract model exists in the schema, and Victor has not said what a contract is (its fields, its life cycle, how it relates to a project). Until he does, only projects carry a subsidiary. Nothing is invented.

## 2026-10-26 Strict rule: money and proprietary information always need Victor's approval
Decision: Victor set a strict rule. No money transfer and no sharing of proprietary secrets or information happens without an approval from him. It is non-negotiable 10 and the "Protected actions" section in `CLAUDE.md`. Protected actions are always Class C at every autonomy level, with or without a delegation, under every persona, and a gateway, plugin manifest or allow-list cannot lower them. Approval is by request id from the account owner, inside the 30 second window, hash-locked and exactly once. No standing approval, no approve-all, no agent approves for him. Unclear cases are treated as protected. Sending the user's data to the configured model providers in normal chat is not covered.
Alternatives: leave it to per-tool Class C choices; allow delegation for small amounts.
Reason: money and secrets cannot be recalled once they leave, and a rule that depends on each builder remembering it will eventually fail.

## 2026-10-26 Project memory lives in the repo
Decision: long-term project knowledge is written to `docs/learnings.md`, `docs/decisions.md` and `docs/daily-syncs/`. The account-level memory file named in `CLAUDE.md` cannot be reached from a cloud session, so the end-of-day sync should copy from these files.
Alternatives: keep knowledge only in chat history.
Reason: sessions end and containers are ephemeral; the repo is the only store every session reads.

## 2026-10-26 Type errors now fail the build
Decision: `npx tsc --noEmit` is clean and `typescript.ignoreBuildErrors` is removed from `next.config.js`; `pnpm typecheck` runs `tsc --noEmit`. Root causes were fixed with correct types: route `params` is a Promise in Next 16, the memory list now selects real columns (`sourceType`, `category`, `details`; the old `source` and `steps` selects would have thrown at runtime) and keeps the `source` response field, `initiator` is typed `'user' | 'system' | 'automation'`.
Alternatives: keep ignoring errors because the Prisma engine download was blocked in CI.
Reason: the ignore flag hid real runtime bugs. Next 16 has no eslint-in-build option, so lint is enforced by `pnpm lint` in CI only.

## 2026-10-26 Durable rate limiter in Postgres
Decision: `PostgresRateLimitStore` (`lib/rate-limit-postgres.ts`) behind the existing `RateLimitStore` interface; table `rate_limit_buckets (key, windowStart, count)`; fixed window via one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`. Proxy runs on the Node.js runtime in Next 16, so Prisma works there and the limit stays in `proxy.ts`. Rejected hits also count (harmless: the window is short). Cleanup is opportunistic, at most once a minute per process. Memory fallback only when the database errors, with one warning a minute. Loaded lazily so `lib/rate-limit.ts` has no Prisma import.
Alternatives: Redis store (another service to run); keep memory only.
Reason: memory counters reset on restart and are not shared across workers, which weakens login throttling.

## 2026-10-26 Staff mail routes to one mailbox
Decision: Victor's instruction, all `*@whinkgroup.com` email is delivered to `whinkproducts@gmail.com` (config in `config/mail-routing.json`, code in `lib/comms/mail-routing.ts`, used by the EMAIL channel). Exact domain match, ASCII validation, `X-Original-To` kept, UI addresses unchanged, sending stays Class C. Provider-side inbound routing is a manual step (docs/security.md).
Alternatives: per-person mailboxes.
Reason: one inbox for a one-person owner during build-out.

## 2026-10-26 SIGNUP_ENABLED switch
Decision: env `SIGNUP_ENABLED=false` makes `POST /api/signup` return 403; default stays open. Blocked attempts are security-logged, not ledgered (no user id exists).
Reason: owner matching trusts the email string and signup does not verify mailbox ownership; closing signup after the owner registers removes the takeover path.


## 2026-10-26 Browser end-to-end tests live in a separate `e2e/` package (needs Victor's OK)
Decision: Playwright Test (Apache-2.0) is installed only in `/e2e` (own `package.json` and `package-lock.json`, not in the pnpm workspace, not a dependency of `apps/web`). CI runs it against the built app (`pnpm --filter app start`) and a real `pgvector/pgvector:pg16` database, with two seeded test users (`apps/web/scripts/e2e-seed.ts`, test-only `@example.test` emails, refuses to run on a database whose name lacks test/e2e/ci/scratch).
Interpretation to confirm: Phase 2 acceptance item D9 says "gateway and app dependencies include no scraping or browser automation library (for example puppeteer, playwright or selenium)". We read D9 as being about what ships in the product (app and gateway dependency graphs and images). A test-only package that drives our own app in CI, is never imported by app code and is never in a production image, is outside that. If Victor disagrees, delete `/e2e` and `scripts/ci/e2e-local.sh`; nothing else depends on them.
Alternatives: no browser tests (what existed before); Cypress (MIT, but also browser automation and heavier); manual QA only.
Reason: the app had only mocked unit tests, so UI wiring, the auth proxy, CSP and real SQL were untested.

## 2026-10-27 Skill uploads (untrusted reference pipeline)
Uploaded skills are outsider-written data. Pipeline: deterministic scan, security agent (org-kit, Cybersecurity & Resilience), 3-director committee, then reference memory (`memory_semantic`, sourceType `skill_upload`, INFERRED, confidence at most 0.6). They never register tools, change permissions or autonomy, approve anything, or enter the org-kit executed skill registry. Capabilities `skill_memory_write` and `skill_intake` are Class A and not protected (data stays in the account). Raw content in `skill_submissions.content` is AES-256-GCM encrypted via `lib/key-encryption.ts` when the encryption key is configured (`enc:` prefix), otherwise stored as plain text (`raw:`). YAML is shape-checked (no tags, anchors, aliases) because no YAML parser dependency was approved.

## 2026-10-27 Change requests, contracts, finance, meetings
- Change requests: Victor's words are stored as untrusted data; refine goes through the model router into a strict zod spec. Submit sends the spec (source code and strategy) to GitHub, outside the account, so `change_request_submit` is a protected (proprietary) Class C tool: id-bound, 30 s, hash-locked, exactly once, showing the exact issue. The issue is built from the stored spec, never re-generated. With no GitHub env, no approval is created and the owner downloads the markdown instead. Status after SENT is set by hand through `POST /api/change-requests/[id]/status`; a GitHub webhook to automate IN_PROGRESS, PR_OPENED and MERGED is future work.
- Contracts are records only (Class A `contract_create`/`contract_update`/`contract_delete`); a contract value never moves money. Field set is an assumption pending Victor's definition.
- Finance is read-only (`GET /api/finance/summary`): sums come from the database per currency, combined in integer cents. Spend per subsidiary is omitted because usage events carry no project link.
- Meetings: `MEETING_PROVIDER_BASE_URL` (self-hosted, https or localhost). Unconfigured means no room and no outside call.

## 2026-10-26 Real SMS sending, approval-gated
- Victor asked for the ability to send SMS. `lib/comms/delivery.ts` now sends SMS for real through the Twilio REST API with plain `fetch` (no new dependency). It makes one attempt with a 10 s timeout and never retries, because a retry after a timeout could double-send. WhatsApp, Telegram, email and calls stay stubs.
- Sending stays protected (Class C, proprietary, approval by request id). The briefing is sent on demand: `POST /api/briefing/sms` builds a short text without financial figures or counterparty names, creates the approval for `sms_briefing_send`, and the Today card shows it. The old automated daily path (`lib/sms-briefing.ts`) no longer sends; it only surfaces a "briefing ready" reminder once a day. The ledger and approval summary carry a masked number only; the exact content lives in the approval row.
- Not decided: whether Victor wants a standing approval or an own-number exemption for his daily briefing. None was added. Victor will be asked separately.

## 2026-10-27 Password reset (forgot password)
- `POST /api/auth/password/forgot` always returns 200 `{ok:true}`; token creation and mail run after the response, so neither body nor timing reveals whether an account exists. `POST /api/auth/password/reset` returns 200, 400 `invalid_or_expired` (one generic error for bad, expired or used tokens), 400 `weak_password`, or 429.
- Token: 32 random bytes, only the SHA-256 is stored (`password_reset_tokens`), 30 minute life, single use by an atomic conditional update inside the same transaction that sets the password. A new token retires earlier unused ones. Success calls `bumpSessionVersion`, so every old session dies.
- Mail is the account's own security mail: capability `password_reset_email`, Class A, in LOCAL_SAFE_REGISTRY (not protected: recipient is the owner's own address, content is a one-time link, no account data). Link base is `AUTH_URL` (fallback `NEXTAUTH_URL`). `deliver()` email is still a stub in `lib/comms/delivery.ts`, so no mail leaves until SMTP sending is built; the route logs one line without address or link.
- Signup had no server password rule (form minLength 6). `lib/auth/password-policy.ts` (min 8, max 72 bytes for bcrypt) is the new server policy; signup is not yet wired to it.
- `proxy.ts` public exact paths added: `/`, `/terms`, `/privacy`, `/forgot-password`, `/reset-password`, and the two password API routes (already under the public `/api/auth` prefix).

## 2026-10-27: Dependency security upgrade before merging to main

The new `pnpm audit` job (security.yml) had never run: it failed at setup because pnpm had no pinned version. With the pin added, the audit found 31 known vulnerabilities in production dependencies, 4 critical and 9 high.

- Next.js 16.3.3 had three critical remote-code-execution advisories (image optimisation, `next/og`, `use cache`), fixed in 16.4.1. Upgraded `next` and `eslint-config-next` to 16.4.3 (same MIT licence). Build, type check and all tests pass on it.
- Removed unused dependencies `plotly.js`, `react-plotly.js`, their type packages, `lodash` and `react-use` (no imports anywhere in the repo). This also removed the critical `maplibre-gl` and the `js-cookie` findings.
- Upgraded `postcss` 8.5.32 and `autoprefixer` 10.6.1. Added pnpm overrides (pnpm-workspace.yaml) for transitive packages with patch-level fixes: body-parser, lodash (via formik), source-map-js, ip-address, fast-uri.
- Upgraded `zod` 3.25.76 to 4.6.7 (high: memory exhaustion on oversized collections). The upgrade changed one behaviour that matters: `.partial()` now keeps a field's `.default()`, which would have reset a contact's tags on every update that did not mention them. The contact schemas now keep the default on the create schema only, with a regression test. No other `.partial()` exists in the codebase.
- Result: audit exits clean at the high threshold; 3 low or moderate findings remain (csv-parse needs a major upgrade; tracked in pending tasks).

## 2026-10-27: External agent review, findings checked against the code

An outside agent scanned the branch and reported six findings. Each was checked in the code before any change.

- F1 (gateway cache misattributes audit log and gives the owner Class C tools): the class claim is wrong. A tool's class comes from the reviewed allow-list, the definition hash and the protected-action check, never from the calling user. One smaller real gap: a non-owner request that triggered registration first marked an owner-only definition-change event as reported, so the owner's ledger never got it. Fixed with a separate log-only marker, with a test.
- F2 (no rate limit on /api/tools/execute): real. Added a per-user bucket (60 per minute) and a 400 for non-JSON bodies. No in-app caller exists.
- F3 (any model name reaches the operator's provider key): real. New lib/model-policy.ts: a requested or saved model must be on the allow-list (WHINK_ALLOWED_MODELS, else the picker's list plus DEFAULT_MODEL) or the user must hold their own key for that provider; otherwise the default is used and model_not_allowed is ledgered. Tested against the real chat route.
- F4 (API key deletion unlogged, provider unvalidated): real, and storing a key was equally unlogged. Both now validate the provider and write a ledger row with the provider only, never key material.
- F5 (history query not user-scoped): defence in depth, not a live bug (ownership is checked earlier). Scoped anyway; tested.
- F6 (skill text stored in plaintext without ENCRYPTION_KEY): wrong. Storage throws unless the key is configured or SKILL_ALLOW_PLAINTEXT=true is set explicitly.

Also noted: the report listed COEP among the security headers; the app sets COOP and CORP but not COEP.

## 2026-10-27: Hold postcss at 8.5.31 so a fresh install passes pnpm 12's release-age rule

Victor's first install on his Mac (pnpm 12.5.1) failed with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION: pnpm 12 refuses any package published in the last 24 hours, and the lockfile held postcss@8.5.32, published about 20 hours before. The security upgrade that day took "latest" without checking its age; CI never caught it because CI pins pnpm 10.28.0, which has no such rule.

- Pinned postcss to 8.5.31 (published 2026-10-18, above the 8.5.18 security fix) and added an override so the Tailwind plugins that resolve postcss as a peer also stay at 8.5.31 (pnpm-workspace.yaml).
- Verified by running pnpm 12.5.1 install --frozen-lockfile against the new lockfile in a clean copy: "Lockfile passes supply-chain policies", exit 0.
- Lesson: when bumping dependencies, check the publish date of each new version against pnpm 12's 24 hour rule, and test with the pnpm version the owner actually uses (12.x), not only the one CI pins.
- The age rule is a supply-chain protection and stays on; it was not relaxed.


## 2026-10-28 Native Ollama transport for Gemma (model router)
- Decision: models whose name starts with a prefix in WHINK_OLLAMA_NATIVE_MODELS (default `gemma`, empty disables) are called through Ollama's native POST /api/chat with `think:false`, in chatWithTools and chatOnce. streamChat is unchanged and still uses /v1.
- Reason: Victor measured the native path as fast with genuine structured tool calls, while /v1/chat/completions ignores think:false and was slow.
- Guard: only when the model is not claude*/gemini* and OLLAMA_URL parses to hostname localhost, 127.0.0.1 or ::1 (exact match). No Authorization header and no cloud or per-user key is ever sent. Otherwise behaviour is unchanged. The code stays inside lib/model-router.ts and lib/model-router-tools.ts.

## 2026-10-28 Read-only workspace tools and Local-Only mode
- Decision: a small local model (Gemma via Ollama) can inspect a code workspace through seven read-only tools: get_cwd, read_file, list_files, search_files, git_status, git_diff, git_log. The model never executes anything. It names a tool with structured arguments, WHINK validates, runs a fixed implementation and returns the result as untrusted content. Code: lib/workspace-tools/.
- Registration: only when WHINK_LOCAL_AGENT_TOOLS is exactly "true" and WHINK_WORKSPACE_ROOT is an absolute path to an existing directory. Otherwise they are not offered and executeTool answers "not configured" and ledgers it.
- Permissions: capabilities workspace_* are Class A. The tool names are in the local-safe registry. "push" was added to the protected egress verbs so git_push style names are protected, not merely unknown. Dangerous names (apply_patch, run_test, git_commit, git_push, rm, network, messaging, money, production, permission change) are NOT registered and are denied and ledgered by the unknown-tool path (A7).
- Sandbox: realpath containment with a segment-safe comparison, deny list (env files, keys, credentials, .ssh, .aws, .git, node_modules, .next), caps on size, entries, matches and files scanned. Git runs with execFile, fixed arguments, a minimal environment and config-driven code execution switched off on the command line. Secret-shaped strings are redacted from output. The ledger records tool, relative path or pattern and sizes only.
- Local-Only mode (WHINK_LOCAL_ONLY="true"): resolveChatTools offers only the local allow-list and executeTool / executeApprovedTool deny everything else by name (DENIED, local_only_mode). A test requires every registered tool to be in exactly one of LOCAL_ONLY_ALLOWED or LOCAL_ONLY_DENIED.
- Not in this stage: patching, running tests, commits. A later stage adds them through approvals after an independent security review.

## 2026-10-28 Security review fixes for workspace tools and Local-Only (decision made for Victor, reversible)
- Owner only: workspace tools are for owner accounts (WHINK_OWNER_EMAILS) only, in the chat tool set and in executeTool. No new env var. Reason: the env flag alone let any signed-up account read the operator's checkout.
- No regex search. The conservative regex screen was bypassable (`a*a*...b` hung for 20 s+); literal substring search cannot backtrack.
- Deny list widened, and git-ignored files are invisible in a work tree. Git output is redacted. Repos with filter/include config or a non-empty .git/info/attributes are refused before any git command runs.
- Local-Only now also means local models only (reversible: remove the assertLocalOnly calls or unset WHINK_LOCAL_ONLY). The chat route falls back to WHINK_LOCAL_MODEL instead of failing the turn; background callers use the local model; embed returns null rather than throwing.
- Native Ollama transport is used only when the effective target is the loopback Ollama origin; its errors are labelled correctly and never echo the upstream body.

## 2026-10-28 Second review round (workspace tools, Local-Only, Ollama)
- Fail closed: a refused repository refuses the file tools as well. Local-Only now covers voice, news, social connect, document recall, outbound messages, GitHub, gateway and probes, not only models and chat tools (see docs/security.md for the audit).
- Ollama: num_ctx 8192 and keep_alive 30m are sent by default (matches apps/web/ollama/Modelfile); tool results are capped at 16000 characters. Reversible by env.
- Unconfirmed: the exact Ollama 400 text for a model without tool support ("... does not support tools") is recalled from Ollama's source, not verified here; detection matches any 400 that mentions tool or function.

## 2026-10-28 Late-approval council removed; completed-turn memory brought under the 3b rules
- Removed lib/approval-council.ts and the `council` option on `decide`. The council auto-approved EXPIRED Class C requests for five read-only tools with no human, which broke the 30 second window, the owner-only approval rule and ledger honesty (it wrote "Unanimous 5/5" rows for directors and MAMBA who never voted). A review proved it: a request the owner denied at 31 s still ran, and a pending-list call days later ran a 3-day-old request.
- Design alternative adopted: a late action is a NEW request that the owner must approve again. An expired request is never revived and never runs. The sweep only marks expired PENDING rows EXPIRED, one `approval_expired` ledger row each, using the server clock. Deny after expiry returns EXPIRED and runs nothing. Tests: lib/__tests__/approvals-no-late-approval.test.ts.
- `recordCompletedTurn` (turn summary memory) is no longer awaited in the chat route and no longer stores turns as fact. It now follows 3b: detached, skipped on tainted or external-content turns and injection blocks (memory_auto_skipped), secrets dropped, permission class A or B, daily cap, exact-text dedup, source `auto`, INFERRED, confidence at most 0.8, MAMBA to the hypothesis store at most 0.4. Episodic rows have no epistemicStatus column, so INFERRED is carried by source `auto` there; a column is a possible later migration.

## 2026-11-01 Capability Gateway (E1/E4a/E4b) on the existing stack (decision made for Victor, reversible)
- Built on what exists: ConnectorInstall, Tool and Action are extended (nullable columns, additive migration); approvals, permission engine, ledger, protected actions and the MCP SDK adapter are reused unchanged. New tables: `hosts` and `capability_grants` only (Permission and Delegation cannot express agent + tool + mission).
- The first E4 code packages were not imported. They duplicated the gateway, the auth path and the ledger and contained authorization and egress defects (see ECHELON_CODE_AUDIT_REPORT.txt); the useful parts were re-implemented with tests.
- Deny by default. A connected provider grants nothing; a grant names one canonical roster agent or team and one tool, expires within 30 days, and may be mission-scoped. Unreviewed tools are Class C; only tools the Founder marks FREE can run (no paid spend is authorised, FDR-010).
- Host liveness is computed from the last heartbeat at decision time, so a returning host needs no re-enable step and a Founder disable is never undone by a reconnect.
- The ledger is the event outbox (SSE reads it, cookie-authenticated), so no ticket table and no LISTEN connection exist.
- Not claimed: physical Mac-off operation (E5, blocked on D-1), stdio execution, plugin formats beyond MCP providers, a network-level egress boundary. See docs/CAPABILITY-GATEWAY.md.
- Reversible: drop the two new tables and the added columns (rollback is the inverse of the migration), remove lib/capability, app/api/integrations, app/dashboard/integrations and the 14-line branch in lib/approvals.ts.

## 2026-11-01 Capability Gateway: independent security review, fixes applied (decision made for Victor, reversible)
- The security-reviewer pass on PR #3 found no critical or high issues, 3 medium, 7 low, 4 info. Fixed here, each with a regression test (the egress tests were run against the old code and fail there): CG-1 provider ids cannot equal catalog ids, connector install/uninstall/list are limited to catalog rows, and the receipt foreign keys are NO ACTION so a receipt is never rewritten; CG-2 response bodies are counted on the wire (1 MiB per call, 256 KiB per tool list, content-length checked first); CG-3 the review must send back the fingerprint of the checks the Founder saw, and each tool is stamped only if its stored definition still matches; CG-4 IPv6 forms that embed an IPv4 address (mapped, compatible, NAT64, SIIT, 6to4) are checked, plus Alibaba and AWS IPv6 metadata; CG-5 a hostname entry cannot reach loopback or private ranges unless that IP or CIDR is listed ('localhost' may reach loopback only); CG-6 the URL scan also finds `https:host`, `http:\\host`, `//host.tld` and percent-encoded URLs (a bare host with no scheme is not found, documented); CG-7 credential-like argument keys are redacted in receipts; CG-8 deleting a mission deletes its grants instead of widening them; CG-10 the heartbeat endpoint is rate limited and answers unknown hosts with the same hashing work; CG-11 tool names with no usable characters are rejected at discovery.
- Migration 20261101120000_capability_gateway_e1 was edited in place for CG-1 and CG-8 (it is not merged and has been applied only to throwaway CI and local databases). Any dev database that applied the earlier version must be reset.
- Accepted or deferred, written in docs/CAPABILITY-GATEWAY.md: CG-9 (an in-flight Founder test call survives a revoke), CG-12 (provider output is not yet wrapped or injection-scanned; required before any agent path uses it), CG-13 (ciphertext remains in old row versions and backups), CG-14 (the review is the only control for a bland-named money tool).
- Not independently verified by the reviewer: the real-database concurrency tests (it had no Postgres); these run in CI and locally. A second reviewer pass on the egress and review-flow changes is still required before merge.

## 2026-11-01 Capability Gateway: Qodo code review of PR #3, triage (decision made for Victor, reversible)
- Qodo posted 14 findings. Each was checked against the code before acting. Fixed with regression tests: #12 unprefixed secrets in JSON arguments passed the credential gate (the `secret_assignment` rule cannot match JSON; arguments are now walked, each value scanned on its own, and a non-trivial string under a credential-named key is refused); #1 provider-controlled error text is no longer logged (size only); #5 a heartbeat without details no longer erases stored host details, and an unreadable body is an error; #11 the heartbeat limiter counts failures only, so nobody can starve a real host; #10 the default allow-list entry for an IPv6 endpoint is bracketed; #3 a failed write-ahead receipt gives the grant slot back; #4 a receipt close is retried once and a stuck SUBMITTED receipt is logged loudly.
- Deferred, with reasons: #9 concurrent discovery can deactivate tools (owner-only, rare, repaired by running discovery again; needs a per-provider lock); #13 the Hub live feed does not stream a receipt's final status because receipts are updated in place (the Hub refreshes on a 30 s poll; fix is an updatedAt cursor or a second event type); #14 the gitleaks tarball is verified against checksums from the same release (needs a hash pinned from a trusted source, which has to come from the owner).
- In the imported baseline, not in the gateway code, and NOT verified here: #2 the approvals sweep can mark a long-running EXECUTING approval FAILED (`lib/approvals.ts`), #6 and #7 in `services/openclaw` (DNS rebinding for single-label hostnames; stale tool routes after an upstream outage), #8 concurrent password-reset requests can invalidate each other's links (`lib/auth/password-reset.ts`). Listed in docs/pending-tasks.md section H for a separate pass.
- Second Qodo pass (same day) found two more real defects in the fixes above, both fixed with tests: the structural credential check lost a credential-named ancestor when it descended (`{"Authorization":{"value":"..."}}` passed), so the credential context now carries through objects and arrays at any depth; and unreadable heartbeat bodies were not counted as failures, so they are now counted like every other failure. The other seven open Qodo items are the deferred and imported-code ones listed above.

## 2026-11-01 CodeQL on the private repository, and merging PR #3 (decision made with Victor, reversible)
- CodeQL analyses every PR but cannot upload its results: code scanning is not offered for this private repository (the Advanced Security page has no Code scanning section). Victor chose option A: keep the analysis, stop uploading, keep the report as a downloadable file. Not implemented before the merge; CodeQL stays red on PRs until it is. Option B (buy GitHub Code Security) is spend and needs Victor's approval by request; option C (remove the job) was not chosen.
- PR #3 was merged to `main` as a MERGE COMMIT on Victor's instruction, with CodeQL red, no second independent security pass on the review fixes, and branch protection still off. The CI job, gitleaks and the dependency audit were green on the merged head. Reversible with a revert of the merge commit (`git revert -m 1`).

