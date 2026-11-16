# Lane C2 notes (2026-11-15)

- Direct external tools live in `lib/capability/providers-direct.ts` as a fixed table (host, method, cost, class), not as Founder-registered MCP providers: these are vendor REST APIs with a server-side key, so the MCP review flow does not fit. They still use the same gates: lockdown, Local-Only, permission engine (Class C unless the table says A), approval by request id, admission for paid calls, ledger, untrusted wrapping. Decision for `decisions.md`.
- `lib/approvals.ts` got one small branch routing approved `ext_*` calls to `executeApprovedDirectTool` (G1a owns that file; merge carefully).
- Hyperliquid: reads only. Any trading or transfer would be Class C money and needs a separate decision.
- Not wired (outside lane): speech-cloud into `app/api/voice/*`; the direct tools into the chat tool registry; `compressConversation` into the chat route.
- Env added: EXA_API_KEY, PARALLEL_API_KEY, FIRECRAWL_API_KEY, FAL_KEY, GROQ_API_KEY, ELEVENLABS_API_KEY, SPEECH_CLOUD_PROVIDERS, WHINK_*_MICROS_PER_CALL / WHINK_FAL_MICROS_PER_IMAGE, ECHELON_GITHUB_SKILLS_{OWNER,REPO,TOKEN}. `.env.example` not touched (not my path).
