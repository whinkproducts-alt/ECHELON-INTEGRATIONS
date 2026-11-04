# ECHELON service and inference inventory

Updated **2026-11-04**, source baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. This inventories code/configuration choices, not active subscriptions, live credentials, vendor entitlements or current prices. No billing dashboards, secret files or provider accounts were inspected. **Services actually being paid for: not established by this repository inspection.** Importing an SDK or configuring a key does not prove payment or free access.

Prefer existing viable local/free services. A hosted trial is not automatically free production capacity. Verify pricing/quota/privacy/terms from the provider when admitting it; do not infer them from old comments. No provider lookup or new entitlement verification was performed for this documentation-only inventory.

## Core paths and options

| Function / source | Local/free option to assess first | Remote or potentially billable option in source | Current limit / acceptance gap |
|---|---|---|---|
| App, DB, worker: root compose, `apps/web`, `lib/worker` | Existing Mac, Node/pnpm, Postgres + pgvector, worker; costs include hardware/energy | Remote host/database chosen separately | No remote host/paid subscription verified. Worker is a separate process; web launch does not start it. Personal DB and restart acceptance open. |
| Text inference: `lib/model-router.ts`, `model-router-tools.ts` | Existing Ollama with a verified installed model | Anthropic, Gemini and OpenAI-compatible endpoints/BYOK | Actual runtime choice unknown. Explicit/default/background calls lack one universal spend boundary. Keep paid disabled until admission finished/approved. |
| Registry: `lib/model-router/registry.ts` | `local-default` | NVIDIA Nemotron / NVIDIA-hosted DeepSeek trials, Anthropic entries, optional Gemini | NVIDIA entries `admitted:false`, synthetic-only evaluator. Recorded narrow trial is not current quota/production entitlement. |
| Browser model handoff: same registry | Manual founder-reviewed interaction | `https://chat.deepseek.com/` | No automatic API integration, login automation or upload. Import reply as untrusted. No assumed unlimited usage. |
| Embeddings: `model-router.ts::embed`, `embedding-service.ts` | Ollama `nomic-embed-text`, explicit verified loopback endpoint | Explicit remote compatible embeddings / OpenAI path | `EMBEDDINGS_URL` takes precedence; `EMBEDDING_MODEL` selects provider otherwise. Verify dimension/provenance and no undesired cloud fallback; no universal reservation. |
| Memory/document retrieval: `context-engine.ts`, `anythingllm-client.ts`, `services/anythingllm/docker-compose.yml` | Local retrieval and local embedder | Configurable AnythingLLM endpoint / its external configuration | Retrieval/citations/taint need actual service acceptance. Do not assume external service cannot invoke a model just from app design; inspect its running configuration. |
| STT: `/api/voice/stt` | Local faster-whisper via loopback `STT_URL` | Deepgram or configured remote endpoint | Example selects `STT_PROVIDER=deepgram`; key missing is not local-mode proof. Actual mic and privacy acceptance open; own admission/accounting needed. |
| TTS: `/api/voice/tts` | Local Kokoro via `TTS_URL` and matching provider/voice | OpenAI TTS, Deepgram / generic remote endpoint | Example selects `TTS_PROVIDER=openai`; local URL alone does not override it. Browser synthesis is a separate fallback; no blanket offline guarantee for browser speech. |
| Voice wrappers: `services/voice`, `services/whink-voice` | Loopback process can be local | ADA wrapper uses Deepgram; older whink-voice has Bland configuration | Local process does not mean local inference or no cost. These are separate code paths, not evidence of deployed active services; review before enabling. |
| Email: `lib/comms/delivery.ts` | Existing approved SMTP account/server | SMTP/mail-hosting provider | Adapter implemented; provider bill/recipient/live send unknown. Nodemailer package availability is not mailbox provisioning. |
| SMS, WhatsApp, calls: same delivery module | Reuse existing eligible account if verified | Twilio messaging/WhatsApp/Voice | No zero-cost production assumption; recipients/entitlements/cost approval required. Calls currently scripted, not two-way AI conversation. |
| Telegram: same delivery module | Bot API integration with approved bot/chat | External Telegram service/network | Real adapter exists; send/receive, account limits/privacy and token not verified. No need to treat it as a purchased plan from code alone. |
| iMessage: same delivery module | Mac bridge feasibility, owner account and privacy review | No selected integration | Explicit `imessage_bridge_unavailable`; not implemented. Do not claim an official general iMessage API or silently replace it with SMS. |
| Restricted GitHub report: `github-readonly/report.ts`, `scripts/github-readonly-mcp.ts` | Existing private App; local MCP facade | GitHub API / Actions under actual account plan | Read-only data operations; token mint authentication POST. No live installation/worker receipt proved. GitHub plan/quota charges unknown. |
| Capability providers / OpenClaw: `lib/capability`, `services/openclaw` | Existing permitted MCP tools on approved hosts | External providers per manifest/review | Capability policy admits FREE tools only, not a universal free-model guarantee. Free classification requires review; stdio remote execution/network isolation gaps remain. |
| Search/news: web/search tooling and `.env.example` | Existing default public search path | Optional Brave key / configured providers | Historical free-tier comments are not verified current limits. Review request data, retention and spend before enabling. |
| Meetings: `MEETING_PROVIDER_BASE_URL` configuration | Existing approved self-hosted service if compatible | External meeting provider | No provider configured/proven by this inventory. Room creation and failure UX require acceptance. |
| Storage/hosting/monitoring/backups | Existing Mac disk, tested local backup and restore | Optional S3/Azure/storage SDKs and remote deployment proposals | Package presence is not deployed usage. Full optional-provider/active infrastructure billing inventory requires runtime/admin evidence. |
| Repository assurance: `.github/workflows` | Existing CI/security setup | Actions allowance, optional paid GitHub security | CodeQL analysis with SARIF artifact, not uploaded code-scanning results. No paid security entitlement required/established by current workflow. |

## What is the default model?

The checked-in example sets `DEFAULT_MODEL`, `SWARM_MODEL` and `WHINK_LOCAL_MODEL` to **`wink-qwen3.5-9b-8k`**. This is a profile name, not proof that weights are installed or that it beats Gemma. No local benchmark winner is established by this pass.

Precedence is fragmented: explicit caller model wins; hints can select hardcoded Claude tiers; then `DEFAULT_MODEL`; then `streamChat` defaults to Qwen while `chatOnce` defaults to `llama3.1:8b`. The saved profile in the conversation route selects the first eligible model but does not execute `runWithFallback`. Background callers may choose their own model env. Reconcile and test these paths before claiming a single free-cloud → local → paid-cloud ladder.

Server `WHINK_LOCAL_ONLY=true` and browser `NEXT_PUBLIC_WHINK_LOCAL_ONLY=true` are opt-in and must match the intended build/runtime. Neither is forced on by the example. A non-loopback compatible endpoint can be remote regardless of a local-looking model name. A Local-Only claim requires observing network behavior for chat, sidecars, embeddings and voice.

## Cost and accounting coverage

- **Implemented:** nullable unknown price display, known-price estimated subtotals, token budget calculation with outstanding holds, account-locked reservations and single settlement for the participating local EAR analysis path.
- **Not established:** universal dollar limit or provider-token accuracy; all paid/default/explicit/background dispatch covered; durable settlement on failed/cancelled/uncertain external calls; current billed cost; genuine free-cloud production entitlement; measured before/after savings.
- The monthly token budget uses UTC months and can be unlimited when effective cap is unset/zero. Local EAR byte reservations and character settlement are accounting rules, not provider receipts.
- A failed request may still cost money. A queued/unknown send may already have taken effect. Never refund a hold or replay an action solely because the response was lost.

## Required inventory completion before full personal acceptance (R10)

For each enabled service, record: owner/account reference without secrets, local/remote URL category, purpose/callers, active model/version, data ceiling and retention, entitlement/expiry, verified quota, price/currency or unknown, cap/admission path, timeout/retry policy, credential storage, health/receipt evidence, fallback and kill switch. Keep invoices, tokens, recipient data and private keys out of the repo. Ask the Founder to verify actual paid subscriptions; do not invent them from packages or past proposals.
