# Capability Gateway (E1 / E4a / E4b)

Status: implemented and tested at **mock/simulation + real-database level**. The physical "Mac fully powered off" acceptance (E5, T8-T10) is **not** done and is blocked on D-1 (no remote host, no spend authorised). Nothing here is deployed.

This is the Integration Hub's backend and UI: Founder-registered MCP providers, hosts, per-tool grants, a single policy decision point, and receipts. It follows the master plan (Part III, D-9..D-14, SC-01..08) and the Founder decision register. Where the plan and an earlier code package disagreed, the plan won; see "What changed from the first E4 packages".

## Where things are

| Piece | File |
|---|---|
| Schema (additive) | `apps/web/prisma/schema.prisma`, migration `20261101120000_capability_gateway_e1` |
| Egress allow-list, pinned fetch, URL scan | `apps/web/lib/capability/egress.ts` |
| Host liveness | `apps/web/lib/capability/heartbeat.ts`, `hosts.ts` |
| Policy gates (pure, one decision point) | `apps/web/lib/capability/policy.ts` |
| Invocation, approval execution | `apps/web/lib/capability/invoke.ts` |
| Provider and grant lifecycle | `apps/web/lib/capability/providers.ts`, `roster.ts` |
| MCP transport (the only SDK file) | `apps/web/lib/openclaw-client.ts` (+ `lib/capability/mcp-http.ts`) |
| Event feed (ledger-backed SSE) | `apps/web/lib/capability/events.ts`, `app/api/integrations/events` |
| API | `apps/web/app/api/integrations/**` |
| UI | `apps/web/app/dashboard/integrations/` (nav: Operations > Integration Hub) |
| Host heartbeat sender | `scripts/host-heartbeat.mjs` |
| Tests | `apps/web/lib/__tests__/capability-*.test.ts` |

## Reconciliation with the existing schema (plan Part III s15, E1)

The plan says to reuse `Tool`, `ConnectorInstall`, `Permission`, `Delegation`, `ApprovalRequest`, `AgentJob`, `AgentExecution`, `AgentHeartbeat`, `UsageEvent` and `Action` before creating anything new.

| Need | Decision | Why |
|---|---|---|
| Provider definition | **Extend `ConnectorInstall`** (`kind`, transport, endpoint, host, encrypted credential, egress allow-list, status, review fingerprint). Existing rows keep `kind = CATALOG` and are never touched by the capability layer. | Already per-user, already unique per connector id. |
| Capability definition | **Extend `Tool`** (`connectorInstallId`, `originalName`, `costClass`, `timeoutMs`, `defHash`, `reviewedDefHash`). | `riskClass` and `inputSchema` already exist. |
| Invocation record / receipt | **Extend `Action`** (nullable `connectorInstallId`, `capabilityId`, `hostId`, `errorCode`, `approvalId`, `grantId`). Written only through `lib/ledger.ts`. | The ledger is already the single audit path (CLAUDE.md rule 5). |
| Approval of a risky call | **Reuse `ApprovalRequest`** (`kind = tool_call`, hash-locked, 30 s, exactly once) via `lib/approvals.ts`. | No second approval system. |
| Permission class | **Reuse `lib/permission-engine.ts`** (`checkPermission`, `checkApprovedAction`, protected actions). | One engine. |
| Spend | **Reuse the cost rule** (FDR-010): only `FREE` tools run; `BLOCKED_COST` otherwise. No `UsageEvent` row is needed because no paid call can run. | Paid routes are not authorised. |
| Per-agent/team/mission grant | **New `CapabilityGrant`**. | `Permission` and `Delegation` are per user and per capability *name*; they cannot say "this agent may call this tool on this provider for this mission". |
| Host (where an MCP server runs) | **New `Host`**. `AgentHeartbeat` (keyed by `workerId`, no host) is left alone. | Different concept; a host has its own token and liveness. |
| SSE ticket table | **Not created.** | EventSource sends the session cookie, so the existing NextAuth login authenticates the stream. The first package's `EventTicket` was tied to a DB `sessions` table that JWT sign-ins never populate. |
| Agent / Team tables | **Not created.** | The roster (326 agents, 163 teams, 15 directorates) stays in `packages/org-kit` and is read, never written (FDR-002/028). |

The migration is additive only. `prisma migrate diff` also reports pre-existing drift unrelated to this work (memory_* indexes and `search_vec` columns created by raw SQL). Those statements are deliberately **not** in this migration.

## How a call is decided

1. Identity: the agent must be in the roster and not suspended or retired. Its team is derived from the roster, never from the caller.
2. Policy gates (`policy.ts`, pure, deny by default, first failure wins): tool belongs to a provider owned by this account; provider `ENABLED` and its reviewed fingerprint still matches (endpoint, allow-list, tool definitions); transport can run here; host `ONLINE` computed now; data class not above the provider's ceiling and never `founder_private`; no credential-looking content; every URL in the arguments is on the allow-list (too deep to inspect = deny); cost class is `FREE`; a grant exists for this subject + this tool + this mission, unexpired, unrevoked, under its cap.
3. Permission engine: protected money / proprietary actions and Class C always need the Founder; Class B needs a delegation or autonomy 2; Class A runs. Not allowed means an approval request is created and **nothing is sent**.
4. Atomic grant reservation (concurrent calls cannot exceed the cap), then a write-ahead ledger row (if it cannot be written, nothing runs).
5. One call over the egress-pinned MCP client. The ledger row is closed with the outcome. Arguments and results are **not stored in the ledger**: only key names (credential-like keys redacted), size and sha256. After an approved call, `approval_requests.result` keeps a truncated copy like any other approved tool.

An approved call re-runs steps 1-4 at approval time and also requires the hash-locked approval, so a grant revoked in the 30-second window, a changed tool definition, or a tampered payload all stop it.

## Guardrail mapping (your decisions)

| Decision | Where it is enforced | Test |
|---|---|---|
| FDR-010 zero new spend; paid defaults to blocked | `policy.ts` cost gate (UNKNOWN, METERED, CLOUD_BILLABLE all blocked) | policy + T11a |
| ECH-10 no card, no paid host | nothing paid exists; D-1 stays a research item | n/a |
| D-9 stdio on authorised hosts + Streamable HTTP | HTTP implemented; stdio stored for a host agent, never spawned by the web runtime | `stdio` tests |
| D-10 manifest-only first; containers off | no container or in-process executable plugin exists | n/a |
| D-11 Founder is the final gate, automated checks first | `automatedChecks` must pass, then the Founder's review sets class and cost per tool; a later change forces a re-review | review + drift tests |
| D-12 / D-14 OpenClaw subordinate | the gateway adds no authority; `services/openclaw` untouched; transport stays in `openclaw-client.ts` (boundary test C4 passes) | `openclaw-boundary` |
| FDR-002/028 326 agents / 163 teams, no invented roster | grants accept roster ids only; nothing writes the roster | roster test |
| FDR-017 / ECH sealed Founder data | `founder_private` never leaves; label + content checks | T11b |
| Truthful state (plan s12) | UI reads the database; Class B/C shows the approval id and "nothing was sent"; the page states that the physical Mac-off test has not been done | UI review |
| Approval is not dispatch; exactly once | `lib/approvals.ts` unchanged semantics; capability tools run only inside `decide()` after the atomic win | approval-flow tests |
| CLAUDE.md rule 5 ledger is the only writer | `lib/ledger.ts` only; the repo's grep guard test passes | existing test |

## Plan tests

| Plan test | Status |
|---|---|
| T1 authorised invoke with receipt | real Postgres + real MCP server |
| T2 unauthorised denied, no bytes | real |
| T3 disabled provider | real |
| T4 revoked credential | real (provider revoke destroys the credential and grants) |
| T5 egress rejected, target sees zero connections | real sockets |
| T6 receipt persisted | real |
| T7 factual states | feed + UI read the ledger; the UI itself has no browser test yet |
| T8 / T9 / T10 | **simulated** (heartbeat timestamps in the database). **Physical Mac power-off: not done (E5, blocked on D-1).** |
| T11a cloud spend blocked | real |
| T11b founder-private blocked | real |

## What changed from the first E4 packages (and why)

Full audit: `ECHELON_CODE_AUDIT_REPORT.txt`. Summary of what was fixed rather than ported:

- Grant not bound to caller or tool, `findFirst` returning an expired grant: grants are matched on subject, tool, mission and expiry in one pure function with negative tests.
- Stdio command run inside the web request: removed. Stdio is recorded for a host agent only.
- Tool-name hijack on discovery: tools are namespaced per provider id and never move between providers.
- Hand-rolled MCP client, REST-vs-JSON-RPC mismatch, credentials never sent: one SDK client for discovery and invocation; the credential is decrypted per call and sent only to the provider's own endpoint.
- Egress holes: redirects, check-then-use DNS, metadata addresses, `/0` allow-lists, nested URLs, default ports, IPv6, case. All closed and tested with real sockets.
- `NOTIFY $1` (a Postgres syntax error) and a leaking listener pool: replaced by a ledger-backed feed; no LISTEN connection exists.
- Host recovery and flapping: liveness is computed from the last heartbeat at decision time; defaults 30/75/120 s; a Founder-disabled provider is never re-enabled by a reconnect.
- A parallel DB-session auth path, invented roster in the seed, autonomy raised by the seed: none of these exist here.

## Not done / known limits

- Physical Mac-off and remote-host acceptance (E5). Blocked on D-1.
- stdio execution on a host. The host agent that would spawn MCP servers is not built; the web process never will.
- Plugin formats beyond "MCP provider" (manifest-only plugin loader, isolated JS, containers) and the selective OpenClaw capability adapter (FDR-012 matrix first).
- A network-level egress boundary. The application allow-list is defence in depth. On macOS use `pf` or run MCP servers in a container; Linux `iptables` does not apply to the Mac. Not shipped.
- OAuth for providers (only a static bearer credential), key rotation, per-host keys. One server key (`ENCRYPTION_KEY`) encrypts credentials.
- Heartbeat rate limit counts failed attempts only, per client address (needs `TRUSTED_PROXY_HOPS` behind a proxy) or one shared bucket, so a flood cannot lock a real host out. A flood still costs one database read per well-formed request.
- The credential gate refuses any non-trivial string under a credential-named key (secret, password, api key, token, authorization, ...) and any value matching a secret rule. It errs towards refusing: a field called `password_hint` with a long value is refused.
- Concurrent discovery of the same provider can deactivate tools (rerun discovery); the Hub live feed shows a call's final status on its next refresh, not instantly.
- Provider output is flagged untrusted but is not yet wrapped or injection-scanned. Nothing sends it to a model today; that must be added before any agent or chat path uses it (review CG-12).
- A Founder test call already in flight finishes if the provider is revoked meanwhile (review CG-9). Agent calls are protected by the atomic grant reservation.
- A money tool with a bland name is not forced to Class C; your review is the only control there (review CG-14).
- Revoked credential ciphertext may remain in old Postgres row versions and backups under the same key (review CG-13).
- A browser (Playwright) test for the Integration Hub page.
- Host sweep runs when the Hosts list is loaded; there is no scheduled worker job for it. It only refreshes a display cache and writes ledger transitions; the invocation gate never depends on it.

## Running it

```bash
pnpm install
pnpm --filter app exec prisma migrate deploy
# real-database tests (isolated DB whose name contains "test")
M1_EXECUTION_DATABASE_URL="$DATABASE_URL" pnpm --filter app test
```

Register a host in the Integration Hub, copy the token (shown once), then on that machine:

```bash
ECHELON_URL=https://your-echelon ECHELON_HOST_ID=<id> ECHELON_HOST_TOKEN=<token> node scripts/host-heartbeat.mjs
```

Optional thresholds (seconds; the loader forces degraded >= 2x interval and offline >= 1.5x degraded): `HEARTBEAT_INTERVAL_SEC=30`, `HEARTBEAT_DEGRADED_AFTER_SEC=75`, `HEARTBEAT_OFFLINE_AFTER_SEC=120`. `ENCRYPTION_KEY` must be set to register a provider with a credential.

## One-shot worker connection (local implementation)

Owner-only `POST /api/integrations/jobs` accepts `requestId`, canonical `agentId`,
`toolName`, JSON `args`, `dataClass` and optional `missionId`. Admission creates an
`AgentJob`; it grants no permission and does not approve or execute a tool.
Repeated identical request ids return the same job; different content is rejected.
`GET /api/integrations/jobs?id=...` returns account-scoped metadata and receipt /
approval ids, never pending arguments. The approval disposition is a separate field.

The existing runner dispatches `capability:` jobs to
`lib/worker/capability-execution.ts`. Every call goes through `invokeCapability`
as the specified AGENT, never OWNER. Current grants, provider state, host,
cost, data and permissions are checked by the gateway at execution time.
Class C waits for the existing approval path. The internal-analysis EAR path is unchanged.

Pending inputs are encrypted using the existing server key and hash-bound to the
account and request. They are erased on dispatch completion, including when an
approval is created. Existing approval-record storage semantics are unchanged.
Requests are limited to 64 KiB and refused after 15 minutes in the queue.

Dispatch is at most once, not a guarantee of exactly-once external effects.
An atomic QUEUED-to-DISPATCHING transition prevents duplicate dispatch. Terminal
jobs are never reclaimed. An expired DISPATCHING lease is reported as UNKNOWN,
and is never automatically replayed. Transport errors/timeouts also produce
UNKNOWN because the remote effect may already have happened. Crash reconciliation
and cleanup of encrypted inputs retained by interrupted jobs are not implemented.

The worker is an owner-directed queued tool call, not autonomous planning. The
fixed-repository report provider is described below; live GitHub acceptance is
still pending. The web server does not start the worker automatically.

Tests: `lib/__tests__/capability-worker.integration.test.ts` uses real PostgreSQL,
MCP sockets, the scheduler and runner. `e2e/tests/integrations.spec.ts` tests
owner-only queue admission, idempotency, rejected extra fields and metadata-only
status in a browser. The earlier claim in this document that Integration Hub
browser tests do not exist is superseded by those existing and extended tests.

## Fixed-repository GitHub report provider (local code, not authorized live)

`scripts/github-readonly-mcp.ts` exposes one tool, `repo_build_health`, on a
loopback-only MCP endpoint behind a separate bearer. It rejects caller-supplied
repository, URL, method, headers or other arguments. `lib/github-readonly/report.ts`
constructs only fixed GitHub REST reads under the configured owner/repository,
resolves the configured branch once and pins checks, statuses and Actions to its
commit. It does not follow redirects or ingest raw job logs. Missing or pending
checks and incomplete pagination yield UNVERIFIED. PRs are excluded from the
Issues list. Output above the size cap fails visibly instead of being cut into
an invalid partial report.

The provider is designed for a private GitHub App installed on ECHELON-CORP with
read access to Contents, Checks, Commit statuses, Actions, Issues and Pull
requests. Its App id, installation id, key path, fixed owner/repo/branch and
local bearer are required environment configuration. No App, key or live token
has been configured by this change. The provider verifies that the installation
token names exactly the configured repository and the required read permissions.
A static bearer sent from the Integration Hub authenticates only to this local
provider. The provider mints and caches its short-lived GitHub App token; that
token is never a gateway tool argument or result.

The worker now stores a successful result encrypted and bounded to 16 KiB.
The owner-only job status endpoint decrypts and marks it as untrusted provider
content. Gateway receipts still contain summaries/hashes, not raw output.
Queued input and result retention for interrupted jobs needs a separate policy.
Local fixture and MCP smoke tests cover the repository boundary and reporting;
live GitHub App and end-to-end report acceptance remain pending.
