# Security

Last updated 2026-10-25. This file separates what the code enforces from what Victor must switch on in GitHub. I cannot change GitHub settings from code or from this repo. Every item under "Victor must switch on" is open until he does it.

## Threat model

| Threat | Where it shows up | Main defence |
|---|---|---|
| One customer reading another's data | every query | Every query is scoped by `userId`. Another user's id returns 404. Tests cover contacts, board meetings, connectors and usage. |
| Prompt injection from email, web, files, tool results, board minutes, contact notes | model context | `wrapUntrustedContent`, fake-tag stripping, injection scans, caps. Injected user messages never reach the model. |
| The model or a plugin doing something the human did not approve | tool calls | `checkPermission` for every action. Class C waits for an approval tied to an id, 30 s expiry, hash lock, atomic decision. Contact messages and calls reuse that flow. |
| Hidden actions | ledger | `lib/ledger.ts` is the only ledger write path. |
| Stolen or leaked secrets | git, logs, API responses | `.env*` ignored, `pnpm security:scan` pre-commit scan, gitleaks in CI, tokens AES-256-GCM encrypted at rest, never in responses or ledger rows. |
| Malicious plugin or connector | `/api/connectors/manifest/validate` | Validation only, never executes code. Licence gate (MIT, Apache-2.0, BSD-*, ISC, 0BSD). Tool descriptions scanned and capped. Third-party tools are always Class C. |
| Cross-site request forgery | state-changing `/api` calls | Origin and Sec-Fetch-Site check in `proxy.ts`. |
| Script injection, clickjacking, MIME sniffing | browser | Nonce-based CSP (`lib/csp.ts`), `frame-ancestors 'none'`, nosniff, COOP, CORP, Permissions-Policy. |
| Password guessing and request floods | auth, approvals, comms, import | Sliding-window rate limits in `lib/rate-limit.ts`. |
| Vulnerable dependencies | supply chain | `pnpm audit --prod`, Dependabot, CodeQL, weekly. |
| Overspend or outage on a cloud model | usage | Per-user monthly token budget, local fallback when enabled. |

## Enforced in code

- Security headers on every response through `proxy.ts` (Next 16 name for middleware): CSP with a per-request nonce, HSTS when the public URL is https, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera and microphone only for our own origin), `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. `next.config.js` repeats the static ones for assets the proxy skips.
- Rate limits: approvals 30, comms 10, imports 5 per minute per user. Before sign-in there is no trustworthy client address (a Next proxy file cannot see the socket, and `X-Forwarded-For` is client-controlled), so `X-Forwarded-For` is ignored unless `TRUSTED_PROXY_HOPS` is set, and then the Nth address from the right is used. Without it, sign-in and sign-up share a looser per-route bucket (120 and 60 per minute) so one flood cannot lock the owner out quickly, and credentials sign-in also has a per-account (email) bucket of 8 per minute. The store is in memory, so it is per process. A Redis store can replace it behind the same interface.
- Request bodies are capped while streaming (running byte count, stream cancelled when exceeded), not after a full read.
- Operator-only facts: the board roster and which operator credentials (SMTP, Twilio, gateway, Ollama) are configured are shown only to accounts listed in `WHINK_OWNER_EMAILS` (exact, case-insensitive). If it is unset nobody is an owner (there is no first-user rule in this codebase, and `User.role` is not trusted for this). Other accounts get an empty roster and connector status `needs_config` or `available` with no environment signal.
- Budgets: the tenant cap (`WHINK_MONTHLY_TOKEN_BUDGET`) is a ceiling. A user may lower their own limit and thresholds, never raise or remove them past the cap.
- Local fallback: when `WHINK_OFFLINE_FALLBACK=true`, calls go explicitly to `OLLAMA_URL` (the host that was probed). A non-local `OLLAMA_URL` is refused, an OpenAI-style model on a remote `OPENAI_COMPATIBLE_BASE_URL` counts as cloud, and no env or per-user key is sent to the local endpoint.
- `GET /api/security/status` reports computed facts only: header and CSP configuration, pending Class C approvals, security events in the last 24 hours and 7 days, the last dependency audit and secrets scan if their report files exist.
- `pnpm security:scan` scans the staged blob (what will be committed, not the working file) for key formats and refuses `.env` files. The scanner's own fixtures and the paths in `apps/web/.secret-scan-ignore` are skipped. `-- --all` scans every tracked file. To run it before each commit: `echo 'cd apps/web && pnpm security:scan' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
- `.github/workflows/security.yml`, `.github/dependabot.yml` and `.github/CODEOWNERS` are in the repo. They do nothing until GitHub is set up as below.

## Victor must switch on in GitHub (not done, cannot be done from code)

1. Two-factor authentication on the GitHub account and on every collaborator. Use a hardware key or passkey if possible.
2. Branch protection on `main`: require a pull request, at least one approving review, require review from Code Owners (this makes `.github/CODEOWNERS` bite), require the `security` checks to pass, block force pushes, no bypass for admins.
3. Secret scanning and push protection: Settings, Code security, enable both. They stop a leaked key before it lands.
4. Dependabot alerts and security updates: enable both so `.github/dependabot.yml` is used.
5. Code scanning: the CodeQL job uploads results only when code scanning is enabled for the repository.
6. Signed commits: require signed commits in branch protection, and set up commit signing (SSH or GPG) on each machine.
7. If the repository is owned by a GitHub organisation, add a `GITLEAKS_LICENSE` secret (gitleaks-action needs one for organisations). Personal accounts do not.
8. CODEOWNERS names `@whinkproducts-alt`. Confirm that is the right account and that it has write access.

## Run the dev server on loopback only

`next dev` listens on all interfaces by default. The `dev` script now passes `-H 127.0.0.1` (apps/web and, through it, the root `pnpm dev`). If you start it by hand, use `npx next dev -H 127.0.0.1`. Never expose the dev server to a network.

## GitHub Actions pinning

All actions in `security.yml` are pinned to full commit SHAs, each checked against the upstream repository's tags with `git ls-remote` on 2026-10-25 (checkout v4.4.0, setup-node v4.4.0, pnpm/action-setup v4.4.0, gitleaks-action v2.3.9, codeql-action v3.39.1). Dependabot (github-actions ecosystem) will propose updates.

## Run before relying on it

- `pnpm audit --prod --json > apps/web/scripts/audit.json` so the status endpoint can show the last audit.
- `pnpm security:scan -- --all --report scripts/secrets-scan.json` from `apps/web` to give the status endpoint a secrets-scan result. Both report files are git-ignored.

## Protected actions

Owner rule: anything that moves, commits or authorises money, or that sends, shares, publishes, exports or otherwise discloses secrets or proprietary information outside the user's own account, needs the owner's approval. Sending chat context to the configured model providers is not covered; any other egress is.

- Always Class C, at every autonomy level, with or without a delegation row, for WHINK and MAMBA. A gateway, a plugin manifest or a WHINK-side allow-list cannot lower it.
- Single source of truth: `apps/web/lib/protected-actions.ts` (`classifyProtected`). An explicit registry of named tools and capabilities, an explicit list of local tools that stay in the account, then keyword rules on the name, description and parameter key names for anything unknown. It fails closed: an unknown tool that looks like money or egress is protected. A read-style name (read, list, get, search) is not protected unless it also contains a disclosure or money verb.
- Enforced in `lib/permission-engine.ts` (`checkPermission` consults it first and refuses a lower requested class, with a ledgered security event), `lib/tool-registry.ts` (execution, approved execution, gateway registration and the allow-list loader, which ignores and logs a protected entry), and `lib/connectors/manifest.ts` plus the catalog loader (a manifest declaring a protected capability below Class C is invalid).
- Approval: by the owning user only, by request id, within 30 seconds, hash-locked, exactly once. There is no approve-all form: the decision route accepts one id and `{decision}` only, wildcard ids are refused and ledgered, and chat phrases such as "approve all" approve nothing. Spoken approval still needs the on-screen confirmation code. An agent has no route to a decision: only the signed-in user's session reaches `decide`.
- Ledger rows for protected approvals (created, approved, denied, expired, executed, failed) carry `protected` and `category` in `validationResult`, written through `lib/ledger.ts`.
- Model-facing: item 5 of the security policy prompt (both personas) tells the model to require approval, never to claim an unapproved action was done, and never to help bypass it. This is guidance only; the enforcement is in code.

- `web_fetch` and `web_search` can carry data out in the URL or query, so they are judged per call. `web_fetch` is protected when the turn is tainted (recalled document chunks count from the first tool call, via `initialTaint`), or the URL has a query string, fragment, user info or a non-default port. Hosts listed in `config/web-fetch-hosts.json` (empty by default) may carry a query on an untainted turn, never user info. `web_search` is protected when the query matches a secret pattern from `lib/secret-scan.ts` or is longer than 300 characters.
- Name rules: an action word anywhere in a name wins over a read word (`get_and_capture_payment` is protected). The only unprotected shape is a single action word followed only by read words ending in a read verb (`send_status_check`). Non-ASCII tool names are unclassifiable and therefore protected, and descriptions are NFKC-normalised before matching.
- Spoken approval: the server derives a 4-digit code from a secret (`APPROVAL_CODE_SECRET`, else `AUTH_SECRET`), the user id, the approval id and the content hash. A decision sent with `via: 'voice'` must carry that code or nothing is approved (HTTP 403, security event). A spoken deny needs no code, card clicks are unchanged, and with no secret configured voice approval is refused. The card must show `confirmationCode` from the approval view and send it with `postDecision(id, 'approve', { code })`.
- The SMS briefing is protected: automation cannot send it, a delegation cannot unlock it, and each blocked day writes a DENIED row and a `protected_action_blocked` security event. Whether sending the briefing to the owner's own number counts as inside the account is undecided.

Not covered:
- Path-encoded exfiltration: on an untainted turn a plain `web_fetch` URL with data encoded in its path (`https://evil.tld/<data>`) is not detected. The tainted-turn rule narrows this to turns where no external content was read, but it is not closed.
- A person with database or server access, or anyone who holds the owner's session.
- Model providers receiving chat context by design.
- Egress hidden in parameters of a tool that is classed as local (for example a URL passed to web_fetch).
- Names the keyword rules do not recognise. Gateway tools default to Class C regardless; local tools need an entry in the registry.
- Connector installation itself is Class B: it sends nothing, and every later send is protected.

## Not covered

- The CSP keeps `style-src 'unsafe-inline'` (React style props). Scripts are strict.
- The in-memory rate limiter does not share state between instances.
- Contact messaging and calls are stubs: nothing leaves the machine yet, and approval still works end to end.

## Staff mail routing (added 2026-10-26)
`config/mail-routing.json` and `lib/comms/mail-routing.ts` send every email addressed to a listed domain (`whinkgroup.com`, exact match) to one catch-all mailbox (`whinkproducts@gmail.com`), with an `X-Original-To` header. The match is on the parsed domain after the single `@`, ASCII only, so `evil.whinkgroup.com.attacker.io`, `whinkgroup.com@evil.com`, subdomains and unicode lookalikes are not routed, and malformed or multi-address strings are refused. The catch-all applies only when the sending account is an owner (`WHINK_OWNER_EMAILS`); mail from any other account goes to its real address, so no tenant's staff mail lands in the owner's inbox. Staff addresses shown in the UI are unchanged. Sending email stays Class C / protected; routing only chooses the delivery address.

Code cannot do DNS or mailbox setup. For real inbound mail to `*@whinkgroup.com` to reach the catch-all, the domain's mail provider must also be configured (MX records plus a catch-all or forwarding rule to `whinkproducts@gmail.com`). That is Victor's task at the provider. Until then, outbound routing only affects mail WHINK itself sends. The SMTP sender is still a stub (`smtp_not_implemented_yet`); when it is built it must use the `deliveredTo` and `headers` the delivery layer returns.

## Signup control (added 2026-10-26)
`SIGNUP_ENABLED`: signup is open only when it is exactly `true`, or while the users table is empty (first-user bootstrap, decided inside the insert transaction under an advisory lock). Unset or empty is closed once a user exists; `false` closes it even when empty. Closed returns 403 and logs a security event. Emails are trimmed and lowercased at signup and sign-in; migration `20261027000800_email_lowercase` normalises old rows (rows whose lowercase form collides are left for a human to merge) and adds a unique index on `lower(email)` only if no duplicates remain. Register the owner first, then leave signup closed. The ledger needs a real user id and a blocked visitor has none, so it is a logger event, not a ledger row.

Why: `WHINK_OWNER_EMAILS` matches the owner by email string, and signup does not verify that the registrant owns that mailbox. Anyone who registers first with the owner's address would be treated as the owner. On a single-owner instance, the owner must register first, then set `SIGNUP_ENABLED=false`.

## Durable rate limiting (added 2026-10-26)
Counters live in Postgres (`rate_limit_buckets`, fixed window, one atomic upsert per hit) so they survive restarts and are shared across workers. `RATE_LIMIT_STORE=memory|postgres` (default postgres when `DATABASE_URL` is set). If the database is unreachable, the limiter falls back to the per-process in-memory store (still enforcing) and warns once a minute.


## Passkeys

Remember me, passkeys and Touch ID (a Mac platform authenticator used through WebAuthn). Added 2026-10-27. The password path is unchanged.

### Session lifetime
`lib/auth/session-lifetime.ts`. The jwt callback stamps `authAt` and `remember` at sign-in and checks them on every read. Not remembered: absolute 12 hours. Remembered: 30 days. The limit is absolute (a refresh does not extend it). An expired token returns null, which Auth.js treats as signed out. Legacy tokens without `authAt` fall back to `iat` and the 12 hour limit; a token with neither fails closed. The browser cookie itself still lasts up to 30 days; only the server check is short.

### Setup
Env: `WEBAUTHN_RP_ID` (bare domain) and `WEBAUTHN_ORIGIN` (exact origin, comma list allowed). Both empty means the routes return 503 "Passkeys are not available". Non-HTTPS origins are refused except localhost. Each origin host must equal the RP ID or be a subdomain of it.
- Localhost: `WEBAUTHN_RP_ID=localhost`, `WEBAUTHN_ORIGIN=http://localhost:3000`.
- Mac Mini: serve over HTTPS (a real hostname, not a bare IP), then `WEBAUTHN_RP_ID=host.example.com`, `WEBAUTHN_ORIGIN=https://host.example.com`. Passkeys are bound to the RP ID; changing it orphans existing passkeys. Keep `AUTH_URL` on the same origin.

### Client contract (all JSON, all POST/DELETE need a same-origin browser fetch with `content-type: application/json`; errors are `{ error }`)
Use `@simplewebauthn/browser` (`startRegistration({ optionsJSON })`, `startAuthentication({ optionsJSON })`).
- `POST /api/auth/passkey/register/options` (session required). Body `{}`. 200 `{ options, challengeId }`. 409 at 10 passkeys.
- `POST /api/auth/passkey/register/verify` (session). Body `{ challengeId, deviceName?, response }` where `response` is the `startRegistration` result. 201 `{ passkey: { id, deviceName, createdAt } }`. 400 on any failure.
- `POST /api/auth/passkey/login/options` (no session). Body `{ remember?: boolean }`. 200 `{ options, challengeId }`. No email needed (discoverable credentials).
- `POST /api/auth/passkey/login/verify` (no session). Body `{ challengeId, response }` (the `startAuthentication` result). 200 `{ ticket, expiresInSeconds: 60 }`. 401 `{ error }` for every failure (deliberately generic).
- Then sign in with the ticket within 60 seconds: `signIn('passkey', { ticket, redirect: false })` (next-auth/react), the same way the password form calls `signIn('credentials', { email, password, remember: String(remember), redirect: false })`. The ticket is single use.
- `GET /api/auth/passkey` (session). 200 `{ passkeys: [{ id, deviceName, createdAt, lastUsedAt }] }`. Never keys or credential ids.
- `DELETE /api/auth/passkey/[id]` (session). 200 `{ ok: true }`; 404 for an unknown id or another user's id.
Status codes common to all: 400 invalid body, 401, 403 cross-site, 413, 415, 429, 503 not configured.

### Guarantees
Challenges are single use with a 5 minute life, consumed by one conditional update. Registration challenges are bound to the user. Verification enforces origin, RP ID, challenge, user verification, and a signature counter that must advance (unless both stored and reported are 0); the counter update is conditional so a concurrent replay loses. The user handle must match the credential owner. The ticket is `<rowId>.<HMAC-SHA256 with AUTH_SECRET>`, 60 seconds, consumed atomically in the passkey provider's `authorize`. Ledger: `passkey_registered`, `passkey_login`, `passkey_deleted`; failures write `SECURITY_EVENT:passkey_replay | passkey_origin_mismatch | passkey_user_mismatch | passkey_assertion_invalid | passkey_register_failed`. An unknown credential is logged only (no user to ledger against). Challenges, keys and signatures are never logged or ledgered. `lib/csrf.ts` exempts `/api/auth/**`, so these routes call the same check themselves (`lib/passkeys/guard.ts`).

## Standing roster and worker

Victor's requirement: the organisation works 24 hours a day. The org-kit holds 326 dormant agents; they are LLM personas, not processes, so "active" means woken on a schedule, which costs model tokens. `apps/web/config/standing-roster.json` recommends 28 always-on entries chosen from real org-kit agents by department and skill (five committee personas are kept as `kind: persona`, because no org-kit agent carries those names). 21 entries have a job and are enabled; 7 (executive office 3, operations 2, finance watch 1, legal and compliance watch 1) are standby entries with `job: null` and `enabled: false` until a job exists for them. A test validates every id against the org-kit and the staff directory.

### What runs
`pnpm worker` (apps/web/scripts/worker.ts, only when `WORKER_ENABLED=true`) loops every 15 s, writes a heartbeat, creates job rows for each user with a conversation or a named profile, claims due jobs with one atomic `UPDATE ... FOR UPDATE SKIP LOCKED` (10 minute lease, safe with several workers, a crashed worker's lease expires), and runs them under `WORKER_CONCURRENCY` (default 3), a per-job timeout (default 120 s), and exponential backoff (cap 6 h). SIGTERM stops claiming and waits up to 30 s for running jobs.

| Job | Default schedule | Model call | Writes |
|---|---|---|---|
| news_digest (6 desks) | every 30 min each | at most one per 10 new items | memory (semantic, source `news`, INFERRED, confidence at most 0.5), `news_seen` |
| opportunity_scan (4 committee members) | 1 h, 6 h, 6 h, 12 h | one, only when fresh news memories exist | hypotheses (confidence at most 0.4), recommendations |
| weekly_brief (Amara Okafor) | 7 d | one, once per ISO week | one brief memory (confidence at most 0.4), one recommendation |
| project_monitor (5 subsidiaries) | every 2 h each | none | recommendations with deep links |
| memory_curation (2) | every 24 h | none | supersedes near-duplicates, decays stale low-confidence items; never touches KNOWN, never deletes |
| security_watch (3) | 15 min, 30 min, 1 h | none | recommendations from ledger counts only |
| skills_sweeper (system) | every 5 min | none | calls `resumeStalled()` from lib/skills if it exists, else no-op |

### What it can never do
- No outbound action. Jobs get no tool executor (`ctx.tools` is always empty and asserted), call the router with no tools, and can exercise only two capabilities, `worker_memory_write` and `recommendation_write` (Class A, in `CAPABILITY_CLASSES` and `LOCAL_SAFE_REGISTRY`). `assertWorkerCapability` rejects any other name and any capability the protected-action classifier flags. No sends, posts, payments or sharing, so nothing protected can happen here.
- Every write goes through `checkPermission` first and the run is ledgered through `lib/ledger.ts` (initiator `system`, persona WHINK, per-run correlation id). Ledger rows carry counts, never news text, memory text or recommendation bodies.
- News, memory text and project text are untrusted: envelope tags stripped, injection-scanned (a flagged news item is dropped, remembered as seen, and one `SECURITY_EVENT: news_item_flagged` row with a count is written), wrapped with `wrapUntrustedContent` before the model sees them. Model output is scanned again before it is stored. Hypotheses are capped at 0.4 and news memories at 0.5, so worker output is never presented as fact.
- Recommendation links must be internal paths (`/...`).
- Account scope: the job queue is the one deliberately global table (the worker serves every account). Each row carries its `userId` and every query a job runs is scoped to it. Recommendation and status routes are scoped to the session user; another user's id is a 404.

### Cost model and budget guard
Cost per user per day is (model runs per day) x (tokens per run). Defaults, from the config: news desks 6 x 48 = 288 runs, committee 24 + 4 + 4 + 2 = 34 runs, weekly brief 1/7 run: at most 322 model calls per user per day. A news run with nothing new makes no call, and an opportunity run with no fresh news makes none, so real use is a fraction of that. `maxTokensPerRun` caps each call (input is trimmed to 60% of it, output limited to 40%): 2,500 for news, 3,000 for opportunity, 4,000 for the brief, so the hard ceiling is about 0.82 million tokens per user per day. Models come from `WORKER_MODEL_FAST|STANDARD|DEEP` (unset means the router default; set them to a local model to make it free). Each run records usage, so the monthly budget in `lib/budget.ts` sees it. At the soft limit non-critical loops are skipped (only security_watch and skills_sweeper continue); at the hard limit every loop is skipped. Offline with no local fallback, model jobs are skipped. Each skip is ledgered once per user, job and reason per day (`worker_job_skipped`).

### Mac Mini deployment
Run one worker process under launchd; see `docs/whink-worker.plist.example` (an example only, not installed or executed by anything here). Set `WORKER_ENABLED=true` in the environment file the plist loads, run `npx prisma migrate deploy` first, and check `GET /api/worker/status` (heartbeat age should stay under about 30 s). More than one worker is safe; the lease prevents double runs.

## Skill uploads (added 2026-10-27)
An uploaded skill is untrusted outsider text. It passes a deterministic scan, a security agent and a three director committee, and may then become reference memory (`skill_upload`, INFERRED, confidence at most 0.6). It never registers tools, changes permissions or autonomy, approves anything, or enters the org-kit skill registry.
- Only text a model reviewed is stored: files over `maxModelChars` (config/skill-pipeline.json) are rejected at upload, and the memory writer slices to the same window.
- Runners hold a lease (`leaseOwner`, `leaseUntil`). Every transition and memory write requires the lease, and the sweeper only re-queues expired leases, so a slow runner cannot advance after another takes over.
- Raw content is encrypted at rest with `ENCRYPTION_KEY`. Without it, uploads are refused with 503 "encryption key not configured" unless `SKILL_ALLOW_PLAINTEXT=true`.
- Recalling a `skill_upload`, `news` or `swarm` memory sets `externalContentThisTurn`, so the turn is not auto-extracted.

### Passkeys: re-authentication and session version (update 2026-10-27)
Adding or removing a passkey needs a fresh credential, and changes sign out every other session.
Request body changes:
- `POST /api/auth/passkey/register/options`: body was `{}`, now exactly one of `{ "password": "<account password>" }` or `{ "ticket": "<re-auth ticket>" }`. Neither or both: 400. Wrong: 403. More than 5 tries a minute: 429.
- `DELETE /api/auth/passkey/[id]`: previously no body, now the same `{ password }` or `{ ticket }` body (`content-type: application/json`).
- `POST /api/auth/passkey/login/options`: new optional `reauth: true` (session required). Then `login/verify` with the assertion returns `{ ticket, expiresInSeconds: 300 }`, a single-use re-auth ticket for the session user, usable only for add or remove. It is not a login ticket and writes no `passkey_login` row.
- `register/verify` (201) and DELETE (200) now also return `{ ticket, expiresInSeconds: 60 }` because the change bumps `User.sessionVersion`, which signs out every session including the current one. The client must immediately call `signIn('passkey', { ticket, redirect: false })` to stay signed in.
Ledger: `passkey_registered` / `passkey_removed`, plus owner-visible `SECURITY_EVENT:credential_added` / `credential_removed` (shown in Neural Link), `SECURITY_EVENT:passkey_reauth_failed`.
Session version: copied into the JWT at sign-in and compared on every read (cached 15 s per process); a mismatch or a deleted user means signed out; DB errors fail closed. `lib/auth/session-version.ts` `bumpSessionVersion(userId)` must be called by anything that changes the password. There is no password-change route today.
Housekeeping: expired and used `passkey_challenges` rows are deleted opportunistically (at most once a minute per process); `cleanupPasskeyChallenges()` in `lib/passkeys/challenges.ts` is exported for the worker. At most 30 open challenges per client key (per user for register and re-auth).

### Signup bootstrap token and review follow-ups (2026-10-27)
- Fresh-install risk: while the users table is empty and `SIGNUP_ENABLED` is not `false`, anyone who can reach the instance can register first, including with the owner's email, and become the owner. Set `SIGNUP_BOOTSTRAP_TOKEN` before exposing a new instance: the first account must then send `bootstrapToken` in the `POST /api/signup` body (constant-time compare, 5 tries a minute, a generic 403 and a security log event on mismatch). With it unset the first account is still allowed and a warning is logged once per process. `GET /api/signup/status` returns only `{ open, needsBootstrapToken }` so the form shows the token field only when needed.
- Migration `20261027000800_email_lowercase` now fails with a count (never emails) when case-variant duplicate accounts exist; merge or delete them and re-run. Otherwise it lowercases all emails and creates the unique `lower(email)` index.
- The passkey open-challenge cap applies only with a real client key (`TRUSTED_PROXY_HOPS` set); otherwise the per-route rate limit and cleanup bound the table, so one attacker cannot block everyone.
- Adding or removing a passkey bumps the session version before the change, so a failed bump never leaves a new credential with other sessions alive. The local process cache is cleared on bump; other processes can keep honouring an old session for up to 15 seconds.

## SMS (added 2026-10-26)
- What is real: `lib/comms/delivery.ts` sends SMS through the Twilio REST API with the global `fetch` (no SDK). Fixed host, Basic auth from env, To must be E.164 (`^\+[1-9]\d{6,14}$`), body 1 to 1600 characters with control characters stripped, 10 s timeout, one attempt and never a retry (a retry after a timeout could send twice; a timeout is reported as "unknown outcome"). Twilio errors become short reasons (invalid number, unverified number on a trial account, auth failed, rate limited, other); the response body is never echoed. The auth token, message body and full phone number are never logged or ledgered (numbers are masked to the last 2 digits). WhatsApp, Telegram, email and phone calls are still stubs.
- What needs approval: every SMS send is a protected action (Class C). An approved `contact_message` by SMS really sends. The on-demand briefing (`POST /api/briefing/sms`, Today screen) creates an approval for `sms_briefing_send` showing the exact text and destination (the user's own number); only the approved, hash-matching request sends, exactly once, within 30 s. The stored text and the user's current number are re-checked at send time. The automated daily worker never sends: it writes one ledger row and one Recommendation per day ("briefing is ready"). There is no standing approval, delegation or own-number exemption.
- Trial accounts: Twilio trial accounts can only text verified numbers and prefix messages. Expect `unverified_number_trial` until the number is verified or the account is upgraded.
- Cost: each SMS segment is billed by Twilio (about 160 GSM characters per segment, 153 when concatenated). The briefing is capped at 600 characters.
