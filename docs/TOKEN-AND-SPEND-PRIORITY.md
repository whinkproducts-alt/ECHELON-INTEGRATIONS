# Token and spend reduction — first execution priority

Founder instruction, 2026-11-02: prioritize token and usage-spend reduction before remaining end-to-end readiness. Preserve correctness, required capabilities, permissions and private data. Optimize total cost to a verified result. No calendar estimates, automatic credit top-ups or claims of unlimited credits.

## First implemented slice

- Optional recall target: 8,000 characters instead of the former 320,000-character allowance; configurable with WHINK_RECALL_MAX_CHARS. This is a smaller input ceiling, not measured token/billing savings.
- Chat target: 24,000 characters, configurable with WHINK_CHAT_MAX_CHARS. Remove oldest whole exchanges; preserve every system instruction and complete current request. Required content may exceed the target and is reported as such.
- Current request is explicitly appended after a history snapshot bounded before its persisted timestamp. Concurrent later requests cannot displace it; equal-timestamp siblings may be omitted by the strict snapshot.
- Unemitted working-memory control metadata has a separate bound and cannot starve emitted project/recall content. Untrusted envelopes and taint gates are preserved.
- Ledger stores counts only. No summarizer inference, shared response cache, model downgrade, output truncation or new dependency added.
- Fixed the missing workingMemory mock in project-ownership tests without changing ownership assertions. Route fixtures now model the saved-message timestamp contract.

## Remaining efficiency gates

1. Inventory actual inference across chat/tools, memory/debrief, worker, skills, swarm, refinement, embeddings and voice. Verify paid admission in every path, including explicit-model and background routes; a configured key does not prove free usage or an approved spend cap.
2. Add atomic scoped budget admission/reservation/settlement where missing. Keep unknown cost visibly unknown. Unauthorized paid calls block; never enable paid access merely to test it.
3. Measure optional extraction/debrief duplication; consolidate only where equivalent and preserve required memory/learning. Do not silently remove functionality to report fewer calls.
4. Bound retries, tool iterations/results, total input/output and deadline per task. Never replay side effects after a model failure. Account for failed/cancelled calls.
5. Connect priority fallback to actual inference before claiming first/second/third failover. Use the lowest model only where measured quality is adequate. NVIDIA trial and manual browser restrictions remain.
6. Show actual calls, provider tokens, known/unknown costs, skips and refusals. Compare identical representative tasks before/after with correctness and completion results. Character estimates are not exact tokenizer measurements.
7. Keep coding work economical: targeted searches, concise updates, focused validation, durable notes and minimal history reprocessing.

Then continue R01–R10 from the architecture: real mission/GitHub acceptance, actual fallback, sealed-team enforcement/lockdown assurance, all channels and voice, briefing/avatars, service inventory/backups and approved Mac-off runtime. Current R04/R06/R07/R08 notes overstate some acceptance: iMessage and two-way calls are unfinished; sealed team is still client-only; live fallback is not wired. Provider recipients, entitlements, iMessage bridge and remote host require concrete Founder choices. No live send, purchase or deployment is authorized by this document.

## Dispatch audit and accounting follow-up (2026-11-02)

| Path inspected | Actual behavior / remaining boundary |
| --- | --- |
| Chat and tool rounds | Profile selection is only a preview of eligibility. Explicit model, preference and default reach tool dispatch without that selection. Tool rejection before the first side effect can trigger another provider call through plain streaming. |
| Auto memory and agent learning | A clean reply longer than 100 characters can start two separate completions: 0–5 memory candidates with permission and sensitivity checks, plus an agent lesson with a different schema. A completed-turn record does not generate text, but episodic writes can request an embedding. Retain both learning outputs; do not count them as interchangeable. Prior conversation taint now suppresses debrief. |
| Worker and EAR | Generic worker calls chatOnce and records character-based token estimates after success. EAR has a separate local-model probe and strict usage write. These are not equivalent controls. |
| Swarm, skills, change requests, tool registry | Planner, agent, skill stages, spec refinement and one tool call chatOnce directly. Some callers do not propagate an authenticated account to the router. |
| Embeddings | Memory write/search and backfill use embed; explicit compatible URL, Ollama or OpenAI. Semantic writes already reuse one vector for dedup and storage. |
| Voice and evaluation | STT/TTS call their configured transports outside the text router. Deepgram, OpenAI and remote compatible endpoints need separate admission. NVIDIA trial is a separate opt-in evaluator; no live test performed. |

Current changes remove key presence as spend eligibility in profile selection, and distinguish unknown cost from an estimated zero in usage, finance and briefing. Historical zeros cannot be distinguished and migrate to unknown. Priced subtotals are estimates; worker/swarm token estimates are not provider receipts. Still open: atomic reservations at dispatch, accounting on failure/cancellation, safe fallback and a representative before/after measurement. No universal spend limit is established by these changes.

Local EAR follow-up: a row lock on the authenticated user serializes admission among participating workers, including the first reservation. Reserve serialized input bytes plus the output allowance against the monthly token threshold; settle once using a character-based estimate. Failed/uncertain calls retain their hold. This bounds participating local attempts under that accounting rule; it is neither a provider-token guarantee nor a paid-route dollar cap. The usage budget separates outstanding holds from settled token estimates.
