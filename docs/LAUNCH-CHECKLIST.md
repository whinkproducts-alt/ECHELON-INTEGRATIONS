# Launch checklist (written 2026-11-01)

Honest status: **not ready to launch.** The code on `main` is merged and CI is green (typecheck, lint, migrations on Postgres 16 with pgvector, unit tests, build, browser e2e, secret scan, dependency audit, CodeQL analysis). CI is not you using the app. Per `CLAUDE.md`, a phase is not done until it passes for Victor on his own Mac.

Sources: `CLAUDE.md` (Phase 2 checklist), `docs/pending-tasks.md` (sections A, D, F, G, H, I), `apps/web/.env.example`, `docs/CAPABILITY-GATEWAY.md`. Status words: **Done** (verified), **Open** (nobody has done it), **Blocked** (waits on something named).

---

## 1. Ready for Victor's own use on his Mac (do these first, in order)

| # | Step | Who | Status |
|---|---|---|---|
| 1.1 | Pull `main`, `pnpm install` at the repo root. | Victor | Open |
| 1.2 | Create `apps/web/.env` from `apps/web/.env.example`. Never commit it. | Victor | Open |
| 1.3 | Set the required values: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` (needed to store provider credentials and uploaded skills), `WHINK_OWNER_EMAILS`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `SIGNUP_BOOTSTRAP_TOKEN`, `DEFAULT_MODEL` plus a provider key (for example `ANTHROPIC_API_KEY`) or `OLLAMA_URL` for local Ollama. Keep `SIGNUP_ENABLED` off unless you want open signup (an owner email with no account yet could be registered by a stranger). | Victor | Open |
| 1.4 | Optional values: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (SMS), `SMTP_*` (email), `WORKER_ENABLED=true` (the 24/7 worker), `OPENCLAW_*` (the gateway), `HEARTBEAT_*` (host liveness; defaults are fine). | Victor | Open |
| 1.5 | From `apps/web`: `npx prisma migrate dev`. Migrations are hand-written and have only ever been applied to throwaway CI databases, never to your real Postgres. Reset any dev database that applied an earlier version of migration `20261101120000_capability_gateway_e1` (it was edited before merge). | Victor | Open |
| 1.6 | `pnpm dev` (root), open the app, sign in. Try a passkey and Touch ID. These have never been used by a person in a real browser. | Victor | Open |
| 1.7 | If you want the worker: `pnpm worker` from `apps/web`. | Victor | Open |
| 1.8 | Run `pnpm security:scan` once (the repo's pre-commit secret scanner). | Victor | Open |

## 2. Phase 2 checklist (verbatim from `CLAUDE.md`; every box is still empty)

- [ ] I had WHINK call a tool on Claude, then on Ollama, by changing config only.
- [ ] I approved a Class C action by its id within 30 s and it ran once.
- [ ] An approval I gave after 30 s did not run.
- [ ] Saying just "approved" with no request picked did not run anything.
- [ ] I swapped the gateway's MCP server in compose and its tools still appeared in WHINK.
- [ ] An injection attempt I typed was blocked and showed in Neural Link.
- [ ] MAMBA offered no White or Grey mode anywhere.
- [ ] The Connected Apps screen showed X, Instagram and TikTok as not connected, and a post attempt asked for my approval.
- [ ] Every action above appears in the ledger.

Write down anything that fails, with what you saw. A failure here is more valuable than a green CI run.

## 3. Integration Hub (Capability Gateway) on the Mac

| # | Step | Status |
|---|---|---|
| 3.1 | Open `/dashboard/integrations` (owner-only). Create a host; the token is shown once. | Open |
| 3.2 | Run `scripts/host-heartbeat.mjs` on that host and watch it go ONLINE, then stop it and watch it go DEGRADED then OFFLINE (30, 75, 120 seconds by default). | Open |
| 3.3 | Register a test MCP provider, discover, review exactly what the page shows, enable, grant one tool to one agent, call it, and read the receipt. | Open |
| 3.4 | Physical Mac-off acceptance (E5): power off the host and confirm calls are refused, then power on and confirm they recover. | **Blocked** on D-1 (hosting for the remote worker) |
| 3.5 | Confirm the defaults: heartbeat 30/75/120 s, grants capped at 30 days, one `ENCRYPTION_KEY` for all provider credentials. | Open (Victor did not object) |

Not built, so do not expect it: stdio execution on a host, plugin formats beyond MCP providers, a network-level egress boundary (`pf` or a container on the Mac), OAuth for providers, key rotation and per-host keys, a scheduled worker job for the host sweep.

## 4. Security and repository gates (before anyone else uses it)

| # | Gate | Status |
|---|---|---|
| 4.1 | A second independent security-reviewer pass on the review fixes (egress, review flow, credential gate, heartbeat). | **Done** (2026-11-01): one high fixed; CG2-2 to CG2-7 deferred, see `docs/decisions.md` |
| 4.2 | Branch protection with required reviews on `main`, secret-scanning push protection, 2FA, signed commits. Only the owner can set these. | Open |
| 4.3 | Confirm the 12 allow-listed gitleaks findings in `.gitleaksignore` (11 test fixtures, 1 base64 false positive). They were reviewed from the redacted CI log only. | Open |
| 4.4 | Delete the three merged branches (the cloud session got HTTP 403). Tip SHAs and the recreate command are in `docs/daily-syncs/2026-11-01.md`. | Open |
| 4.5 | Dependabot: decide to keep, tune or turn off; review its open PRs one at a time (Actions bumps first; majors last with a licence check). Close the mapbox-gl 1 to 3 PR after verifying the licence (rule 7). | Open |
| 4.6 | Imported-code findings from Qodo to verify and fix: approvals sweep vs long-running executions, `services/openclaw` DNS rebinding and stale routes, concurrent password-reset links; the 4-line `finish()` check from Qodo's remediation branch. | Open |
| 4.7 | Before any agent or chat path can call a provider tool: wrap and injection-scan provider output and descriptions (review finding CG-12). Nothing calls provider tools from chat today. | Open |

## 5. Only for a public or sold launch

| # | Gate | Status |
|---|---|---|
| 5.1 | Terms and Privacy are internal drafts: legal review; contact address from tenant config (`legalContactEmail`). | Open |
| 5.2 | Compliance review (CASL, PIPEDA, each platform's developer terms) of social, SMS and email; licence review of every dependency. | Open |
| 5.3 | QA run against acceptance criteria, the AI behaviour suite on Claude and Ollama, performance budgets (latency and memory on the 16 GB Mac Mini). | Open |
| 5.4 | Recapture landing-page product screenshots with curated demo data (current ones show sample-data tells). | Open |
| 5.5 | Real email sending (`lib/comms/delivery.ts` is a stub; needs `nodemailer` approved by Victor and `SMTP_*`); WhatsApp, Telegram and phone calls are stubs. | Open |
| 5.6 | Hosting go-ahead: Cloudflare and Hetzner accounts with 2FA and scoped tokens, then the migration kit (Docker, Caddy, GitHub Actions deploy, backups, runbook). | **Blocked** on Victor |
| 5.7 | Phase 6 product work: onboarding, billing, white label. Phase 3 recall hardening is also untouched. | Open |

## 6. What is already done (so nobody repeats it)

- Capability Gateway built on the existing stack, merged to `main` (PR #3), with an independent security review and two Qodo rounds fixed with regression tests.
- CI runs the whole pipeline on every push and pull request; CodeQL analyses on every PR and keeps its report as the `codeql-sarif` artifact (this repository is private, so GitHub offers no code scanning upload).
- Full-history secret scan with the gitleaks CLI; `pnpm audit` for production dependencies.
- Decisions and lessons are recorded in `docs/decisions.md`, `docs/learnings.md` and `docs/daily-syncs/2026-11-01.md`.

## 7. Money and proprietary information

Nothing in this checklist authorises spending. Buying GitHub Code Security, a registrar or hosting, or any paid provider needs Victor's approval by request (`CLAUDE.md` rule 10).
