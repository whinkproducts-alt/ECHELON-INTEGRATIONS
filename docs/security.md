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
