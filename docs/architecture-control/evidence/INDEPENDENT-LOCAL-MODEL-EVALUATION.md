# KAMSI-PRIME independent local model evaluation

Date: 2026-10-29 (America/Edmonton). **Status: blocked by disk exhaustion; comparative recommendation not established.**

## Founder decision

**Defer selection and implementation.** The evidence does not establish Qwen, Gemma, or a hybrid as the fastest reliable architecture for the 326-agent organization. Qwen completed four scored tasks before evidence writing failed; Gemma was installed but not inference-tested. Choosing Gemma by elimination or claiming a hybrid is superior would be unsupported.

Restore disk and memory headroom, then complete the identical paired tests before approving routing changes. Preserve all 326 agents and their governance. No production configuration, model installation, organizational record, or deployment was changed. Existing uncommitted routing changes were left intact. All inference requests used localhost; no paid APIs, cloud inference, downloads, or purchases were used.

## 1. Environment verification

- Repository origin: `https://github.com/whinkproducts-alt/KAMSI-PRIME.git`.
- Hardware: `Mac15,12`, 17,179,869,184 bytes RAM (16 GiB), consistent with the requested MacBook Air M3.
- Ollama 0.34.2 accessible at `127.0.0.1:11434` outside the execution sandbox. The initial sandbox connection failure was not an Ollama outage.
- Installed Qwen: `wink-qwen3.5-9b-8k:latest`, 9.0B, Q4_K_M, 6,550,825,565 bytes on disk. Inference operational in five recorded requests.
- Installed Gemma: `gemma4:12b-it-qat`, 11.9B, Q4_0 per local metadata, 7,151,003,754 bytes on disk. `/api/show` worked; inference operation remains unverified.
- Both advertise tools/thinking and architectural context 262,144. This is not evidence that this hardware can use that context. Qwen's saved `num_ctx` is 8,192; Gemma has no saved `num_ctx` override. Benchmark requests explicitly set 8,192; Qwen residency confirmed 8,192.
- Before inference: no resident models, 14,653.31 MiB swap used, approximately 70 MiB free physical pages, and approximately 6.96 GiB occupied by the memory compressor. Free pages are not the same as all reclaimable memory.
- After interruption: swap used 19,591.88 MiB, filesystem free approximately 140 MiB. `OSError: [Errno 28] No space left on device` interrupted evidence writing. The roughly 4.82 GiB increase in system swap is not attributable solely to Ollama because other applications were running.
- Qwen was explicitly unloaded after failure. No attempt was made to load Gemma into these conditions.
- Local file configuration: `DEFAULT_MODEL=gemma4:12b-it-qat`, `WHINK_LOCAL_MODEL=gemma4:12b-it-qat`, `WHINK_OLLAMA_NATIVE_TOOLS=true`. Running application environment and account-specific database model preferences were not independently read, so these are file settings, not proof of effective routing for every account.
- Canonical workforce registry contains **326** entries; manifest lists 163 teams. No workforce files changed.
- Advisory Markdown was not found in the repository filename search. Its claims were not treated as facts.

## 2. Benchmark comparison

These are current-workload observations, not clean-machine specifications. Cold means no Ollama model resident, not a cleared OS file cache. Warm measurements use the four completed scored requests, one trial each.

| Metric | Qwen 3.5 9B | Gemma 4 12B |
|---|---:|---:|
| Recorded inference requests | 5 | Not run |
| Cold time to first output | 74.35 s | Not measured |
| Cold request completion | 74.43 s | Not measured |
| Ollama-reported cold load | 53.71 s | Not measured |
| Warm median first-output latency | 2.42 s | Not measured |
| Warm median prompt throughput | 104.27 tokens/s | Not measured |
| Warm median output throughput | 12.77 tokens/s | Not measured |
| Warm median task completion | 7.37 s | Not measured |
| Peak sampled Ollama process RSS | 5.98 GiB | Not measured |
| Strict full-task success | 0/4 | Not measured |
| Syntactically valid JSON | 4/4 | Not measured |
| Full requested field/value compliance | 0/4 | Not measured |
| Native tool accuracy / failure recovery | Not reached | Not run |
| Repeated trials / long-context accuracy | Not reached | Not run |

No between-model speed or accuracy difference can be calculated. RSS sums processes whose command contains `ollama`, sampled once per second; it is not an exact peak physical footprint and must not be added to Metal/VRAM accounting. Ollama reported Qwen residency of 5,613,373,357 bytes (~5.23 GiB). Energy, power and thermal throttling were not measured.

## 3. Exact completed tests and outcomes

Full byte-for-byte requests, responses, timing metadata and samples are in `results.jsonl`. Prompts, expected values and grading logic are in `benchmark.py`.

| Test | Expected / observed | Time | First output | Output rate |
|---|---|---:|---:|---:|
| Cold probe | “Return only the word READY.” → `READY` | 74.43 s | 74.35 s | 22.52 tok/s* |
| A: probability and factual recall | 10,000 people, prevalence 1%, sensitivity 90%, false-positive rate 9%: expected TP 90, FP 891, PPV 10/109, capital Canberra. Returned TP “90/100”, FP “810/100”, PPV “9/99”, Canberra. Arithmetic failed; capital correct. | 7.04 s | 2.07 s | 12.72 |
| B: dependency planning and approval expiry | A=2h; B=3h and C=4h after A; D=1h after both; two workers. Expected 7h, A-C-D. Returned 6h, A-B-D. Correctly rejected approval used one second after expiry and requested renewal. | 7.33 s | 2.78 s | 13.00 |
| C: debugging | Move `return out` outside a Python loop, preserve deduplication order. Correct explanation, repaired code and `[2,1]`/`[]` outputs; returned `early_return` as a key instead of requested `bug: early_return`. Strict contract failed. | 12.24 s | 4.46 s | 12.82 |
| E: organizational delegation | Expected Ingrid Bergström implementation, Elias Haddad review, Victor Igboekwe approval, workforce 326. Returned Luke Mellors, Elias Haddad, Atika Emmanuel, workforce 3. Correctly kept activation blocked pending approval. | 7.40 s | 1.99 s | 10.89 |

*Two output tokens: cold output throughput is not a meaningful sustained generation benchmark.

The debugging response was separately parsed as valid Python and inspected; generated code was not executed. The strict 0/4 result does **not** mean no useful capabilities: coding repair was substantively correct, approval expiry was respected, and some factual/organizational fields were correct. The delegation prompt offers a small leadership excerpt; its result is a warning about this task, not proof of general inability to coordinate the entire organization.

The probability and dependency errors are observed reasoning failures. The approver/workforce answers contradict supplied governance context. Broader hallucination rate and adversarial security reliability remain unmeasured.

## 4. Method and unfinished coverage

The isolated Python standard-library harness sends streaming `/api/chat` requests to localhost only. Settings: `think:false`, `num_ctx:8192`, `num_predict:512`, temperature 0, seed 42, keep-alive 10 minutes. No forced JSON grammar was used, allowing natural schema compliance to be scored. TTFT measures first nonempty content/thinking/tool chunk; visible-output latency is also retained. Token rates use Ollama's reported counters and durations. No thinking text appeared in completed responses.

Planned: two rounds with reversed model order, explicit unloads between blocks, simulated read-tool failure/retry/completion, tenant-scoped memory fixtures, short and oversized context sentinels, initiative, injection resistance, commercialization arithmetic and mission continuity. Only cold probe and A/B/C/E completed and were saved. The next result could not be saved; no score is inferred for it. Tools are fixtures and never perform real external actions.

Native model defaults differ (Qwen top_k 20 and presence_penalty 1.5; Gemma top_k 64). These were not overridden beyond the shared options above. A resumed controlled study should neutralize penalty differences as a separate explicitly labeled configuration, while retaining an installed-default baseline. No claim about default-versus-tuned superiority is justified here.

The planned memory task is retrieval from supplied fixtures, not a real persistent database test. Leadership excerpts derive from the existing organization, but the representative worker-agent simulation was not reached. A complete evaluation must also use actual registry worker identities (for example Femi Balogun and independent evaluator Sabrina Fontaine), approved work queues and restart checkpoints. Commercialization inputs are explicitly hypothetical and do not establish actual WHINK Predict/Pro features, revenue or demand.

## 5. Architecture findings

| Finding | Evidence and implication |
|---|---|
| Context mismatch confirmed for Qwen | `apps/web/lib/context-engine.ts:10` budgets 80,000 estimated tokens / 320,000 characters for retrieved context alone. Qwen's saved context and observed residency are 8,192. The 9.77× ratio excludes system instructions, conversation, tool schemas and output allowance. |
| Overflow risk, not a demonstrated truncation event | Neither inspected context assembly nor native request sets a model-aware total input budget. Over-limit requests can lose information through truncation or rejection depending on transport/runtime. Actual dropped fields, lost instructions and wasted prefill were not measured because the overflow test was not reached. |
| No explicit prompt-cache policy found in inspected paths | Ollama residency is reused during a block, but warm load does not prove prefix-cache reuse. No exact repeated-prompt cache experiment completed. |
| Tool schemas consume context each turn | `gateway-chat.ts` combines standard and accessible gateway tools; `tool-loop.ts` sends that list on each iteration, up to five iterations and eight calls per turn. Task-based schema pruning was not found in this path. Exact live schema token overhead remains unmeasured. |
| Native transport does not set context or residency | Existing modified `model-router-tools.ts` uses `/api/chat`, `think:false`, and up to 4,000 output tokens, without `num_ctx` or `keep_alive`. Gemma selects this transport automatically; the configured flag enables other local models. This is inspected working-tree behavior, not an independently verified deployed version. |
| Background work can contend with foreground generation | `auto-memory.ts` selects EXTRACTION_MODEL, then DEFAULT_MODEL, then Qwen, with 512 output tokens. The conversation route launches extraction and debrief asynchronously; detaching latency does not eliminate compute contention. No measured background load attribution was performed. |
| Persistent queue exists; local serialization is not established | Scheduler uses database jobs, 10-minute leases and `FOR UPDATE SKIP LOCKED`. Worker concurrency defaults to 3, timeout to 120 seconds. These preserve work across workers/restarts but can allow concurrent model demand. Runtime worker count was not inspected. |
| Embeddings not established operational | Local tags contain only the two generation models; no dedicated embedding model installed. Relevant local files did not configure embedding endpoints/models. `embed()` returns null when unconfigured, with no silent paid fallback; default dimension is 768. No live retrieval/embedding call was made. |
| Universal offline routing needs validation | File defaults are local, but `selectModel()` still maps complexity hints to Claude model IDs, ahead of DEFAULT_MODEL in some router paths. Offline fallback is separately gated. This is a path requiring audit, not evidence any cloud call occurred during this evaluation. |

Old known-issue prose in CLAUDE.md was not accepted as current fact: inspected extraction is detached, and embedding fallback is now explicitly null when unconfigured.

## 6. Verification and optimization priorities

Existing infrastructure has Vitest mocks, protected-action evaluation scenarios and a local Gemma harness; documented automatic coverage does not establish real-model behavior. Reused targeted command:

```sh
cd apps/web
pnpm exec vitest run lib/__tests__/context-engine.test.ts lib/__tests__/model-router-tools-ollama-native.test.ts lib/__tests__/worker-scheduler.test.ts lib/__tests__/phase3a-embedding.test.ts lib/__tests__/protected-permission.test.ts
```

**68 tests passed across five files.** These are mocked software checks, not 68 model passes. A Vite configuration warning was nonfatal. No dependencies were installed; no full suite/build was run because production code was not changed.

Proposed priorities, **not implemented**:

1. Restore several GiB of disk headroom and reduce competing memory load; record baseline swap and pressure. The harness now refuses inference below 5 GiB free disk, protects existing evidence, and unloads models on exit. This is a guard, not a guarantee that 5 GiB is sufficient.
2. Complete paired trials, including safety failures, actual registry workflows and real persistent-memory retrieval in an isolated test database. Separate cold load, warm uncached, exact prefix reuse, and model-switch costs.
3. Make the entire context budget model-aware: reserve output/tool overhead, keep governance instructions protected, rank retrieval, and test boundary behavior.
4. Propose one local inference queue with foreground priority and bounded background extraction. Keep 326 logical agents and persistent per-agent work; agent count does not require 326 simultaneous models.
5. Measure schema pruning and stable-prefix caching, then consider batching work by resident model. Verify offline routing cannot select a paid endpoint.
6. Validate a local embedding configuration and retrieval quality before claiming persistent-memory competence. Any changes require separate authorization.

## 7. Option assessment and limitations

- **A — Qwen primary:** operational, but observed reasoning and delegation failures prevent an accuracy-based endorsement. The small, memory-constrained sample does not establish its general ceiling.
- **B — Gemma primary:** current local file default; installed but no completed inference measurements. Cannot endorse or reject on comparative evidence.
- **C — Hybrid/dynamic routing:** plausible only if one model covers the other's measured weaknesses enough to offset load/switch overhead. No such evidence yet; do not assume hybrid improves reliability.

**Recommendation for Founder review: hold the current configuration unchanged and defer architecture approval until a paired evaluation is possible.** The requested success criterion is not yet demonstrated. The immediate blocker is storage/memory headroom, not unavailable Ollama or missing model downloads. No cleanup of user files or applications was performed.

Limitations: one Qwen trial, four scored tasks, no Gemma timings, no sustained or repeated trials, no tool/injection/recovery results, no real memory integration or commercialization plan evaluation, no clean thermal baseline, no power measurements, and no independent assurance-agent review of the new harness. No production implementation is authorized by this report.

Evidence: `environment.json`, `results.jsonl`, `summary.json`, `progress.log`, `unit-tests.log`, `benchmark.py`, and `organization-fingerprints.json` in this directory. Fingerprints record the inspected organization; Git status confirms no organizational files were modified. The harness guard/cleanup was added after the interrupted run; saved request payloads remain the authoritative executed settings.