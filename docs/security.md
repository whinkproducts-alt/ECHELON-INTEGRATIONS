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
- Rate limits (per user, or per client address before sign-in): sign-in 10 per minute, sign-up 5, approvals 30, comms 10, imports 5. The store is in memory, so it is per process. A Redis store can replace it behind the same interface.
- `GET /api/security/status` reports computed facts only: header and CSP configuration, pending Class C approvals, security events in the last 24 hours and 7 days, the last dependency audit and secrets scan if their report files exist.
- `pnpm security:scan` scans staged files for key formats and refuses `.env` files. `-- --all` scans every tracked file. To run it before each commit: `echo 'cd apps/web && pnpm security:scan' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
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

## Run before relying on it

- `pnpm audit --prod --json > apps/web/scripts/audit.json` so the status endpoint can show the last audit.
- `pnpm security:scan -- --all --report scripts/secrets-scan.json` from `apps/web` to give the status endpoint a secrets-scan result. Both report files are git-ignored.

## Not covered

- The CSP keeps `style-src 'unsafe-inline'` (React style props). Scripts are strict.
- The in-memory rate limiter does not share state between instances.
- Contact messaging and calls are stubs: nothing leaves the machine yet, and approval still works end to end.
