# Token and spend reduction — first execution priority

Updated 2026-11-04. Main code baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`; PRs #23/#24 merged. [Current evidence/source map](ECHELON-AUDIT-HANDOFF-2026-11-04.md) · [Active backlog](pending-tasks.md). This document records implemented slices and incomplete controls; no measured total saving or universal spend limit is claimed.

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

Then continue R01–R10 from the architecture: real mission/GitHub acceptance, actual fallback, sealed-team enforcement/lockdown assurance, all channels and voice, briefing/avatars, service inventory/backups and approved Mac-off runtime. Historical R04/R06/R07/R08 notes overstated some acceptance; corrected in the current handoff and execution register: iMessage and two-way calls are unfinished; sealed team is still client-only; live fallback is not wired. Provider recipients, entitlements, iMessage bridge and remote host require concrete Founder choices. No live send, purchase or deployment is authorized by this document.

## Dispatch audit and accounting follow-up (2026-11-02)

| Path inspected | Actual behavior / remaining boundary |
| --- | --- |
| Chat and tool rounds | Profile selection is only a preview of eligibility. Explicit model, preference and default reach tool dispatch without that selection. Tool rejection before the first side effect can trigger another provider call through plain streaming. |
| Auto memory and agent learning | A clean reply longer than 100 characters can start two separate completions: 0–5 memory candidates with permission and sensitivity checks, plus an agent lesson with a different schema. A completed-turn record does not generate text, but episodic writes can request an embedding. Retain both learning outputs; do not count them as interchangeable. Prior conversation taint now suppresses debrief. |
| Worker and EAR | Generic worker calls chatOnce and records character-based token estimates after success. EAR has a separate local-model probe and strict usage write. These are not equivalent controls. |
| Swarm, skills, change requests, tool registry | Planner, agent, skill stages, spec refinement and one tool call chatOnce directly. Some callers do not propagate an authenticated account to the router. |
| Embeddings | Memory write/search and backfill use embed; explicit compatible URL, Ollama or OpenAI. Semantic writes already reuse one vector for dedup and storage. |
| Voice and evaluation | STT/TTS call their configured transports outside the text router. Deepgram, OpenAI and remote compatible endpoints need separate admission. NVIDIA trial is a separate opt-in evaluator; no live test performed. |

Merged changes remove key presence as spend eligibility in profile selection, and distinguish unknown cost from an estimated zero in usage, finance and briefing. Historical zeros cannot be distinguished and migrate to unknown. Priced subtotals are estimates; worker/swarm token estimates are not provider receipts. Still open: atomic reservations at all remaining dispatch boundaries, accounting on failure/cancellation, safe fallback and a representative before/after measurement. No universal spend limit is established by these changes.

Local EAR follow-up: a row lock on the authenticated user serializes admission among participating workers, including the first reservation. Reserve serialized input bytes plus the output allowance against the monthly token threshold; settle once using a character-based estimate. Failed/uncertain calls retain their hold. This bounds participating local attempts under that accounting rule; it is neither a provider-token guarantee nor a paid-route dollar cap. The usage budget separates outstanding holds from settled token estimates.

## Verified checkpoint and next slice (2026-11-04)

Main CI/security were independently fetched at `99f6d7e`: 158 files / 2345 tests passed, 39 skipped, 22 browser tests passed; default build and migrations passed. See the audit handoff for fixed run links and each skip. No local full-suite rerun or external inference occurred during this documentation pass.

**Next: E01 in pending-tasks.md.** Trace every actual router/voice call and carry authenticated account/correlation/scope to admission before transport. A paid profile refusal is not an explicit/default/background-call refusal. Budget unset/zero may mean unlimited; the local EAR hold is not an enforced dollar allowance. Preserve request-id approvals, fail closed on uncertain price/policy where required, and distinguish estimated usage, provider usage, holds and refunds. Test bypass, concurrency, cancellation, crash and UTC month rollover with fixtures/isolated data before any paid call.

Do not merge extraction and agent debrief merely because both can run after a clean long reply: they serve different memory/learning outputs. Measure representative equivalent tasks and quality before changing them. The new context bounds reduce allowable character input; they do not establish exact token reduction or measured financial savings. Actual model fallback remains unwired, and `chatOnce`/`streamChat` have different unset defaults. Embedding and voice admission need their own coverage, including remote configured endpoints and cloud selectors in the example environment.
