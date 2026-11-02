# Pending tasks (updated 2026-11-01)

2026-11-01 continuation: this historical list contains stale implementation claims.
Use `product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md` and
`ECHELON-READINESS-EXECUTION.md` for the current Founder-requested build sequence.
Inspect owning code before acting on any older item below.

Source of truth for what is open. Update it when something is done or decided. Read it at the start of every session.

## A. Waiting on Victor (decisions and actions only he can take)
1. Buy `whinkgroup.com` (his own purchase); say which registrar so exact email-forwarding steps can be given. Skip the paid email and web hosting add-ons.
2. Hosting go-ahead (see docs/learnings.md section 13): create Cloudflare and Hetzner accounts with 2FA, scoped API tokens in the environment settings (never in chat), allow those hosts under Allowed domains, attach the repos Wpma, whinkpredict, whink-group and the WhinkOS repo, approve each spend, start a new session.
3. Tell us what WhinkOS is and where its code lives; which Render services are live (wpma vs Wpma, whinkpredict vs whink-bet); names of each app's settings.
4. Settings in `apps/web/.env`: WHINK_OWNER_EMAILS, WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN, SIGNUP_BOOTSTRAP_TOKEN, DEFAULT_MODEL plus a provider key (or local Ollama), ENCRYPTION_KEY (needed to store uploaded skills), TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER (SMS), SKILL_PIPELINE_MODEL (optional), WORKER_ENABLED=true and `pnpm worker` running, MEETING_PROVIDER_BASE_URL (optional), CHANGE_REQUEST_GITHUB_REPO and CHANGE_REQUEST_GITHUB_TOKEN (optional), SMTP_* (email). Never commit values.
5. Run `npx prisma migrate dev`. Migrations are hand-written and never applied to real Postgres. Reset any dev database that applied an earlier commit of this branch.
6. Decisions: (a) may the daily SMS briefing go to his own verified number without a tap (an exception to rule 10; not granted); (b) is the Playwright browser-test package outside the app acceptable under CLAUDE.md D9; (c) review the assumed Contract fields and the recall taint trusted-source list (user, manual, correction, auto, conversation, mamba); (d) YAML skills get a shape check only: add a YAML parser dependency or not; (e) approve or reject the proposals below in section B.
7. GitHub settings only he can set: branch protection with required reviews, secret-scanning push protection, 2FA, signed commits; install the Claude GitHub App if he wants change requests picked up automatically.
8. Confirm the board: bios, committees, and that the generated board emails exist; WHINK Ultimate and WhinkOS logos; Whink Predict logo.
9. Run Victor's Phase 2 checklist (9 items in CLAUDE.md) on his Mac. A phase is not done until it passes for him.
10. Merge `claude/loving-archimedes-70hf66` to `main` (Victor asked for this on 2026-10-27; waits on green CI).
11. Set mail forwarding for whinkgroup.com at the mail provider once the domain exists.

## B. Proposed, not built (Victor said do not build until approved)
- Change password screen and a Sign out everywhere action (forgot password is built: see docs/decisions.md 2026-10-27). The first password-change route must call `bumpSessionVersion()`; the reset flow already does, inside its transaction.
- Installer for Windows or Mac (stage 1: start script plus browser install; stage 2: signed installer).
- Agents drafting Change Requests for approval.
- Hosting migration kit (Docker, Caddy, GitHub Actions deploy, backups, runbook) after A2.

## C. Requested earlier, not built
- Edit the product websites from the app; update the company website from news and initiatives.
- Real sending for email: `lib/comms/delivery.ts` is still a stub, so password-reset mail does not leave the server. Needs `nodemailer` (MIT; Victor to approve) and SMTP_* values. Also WhatsApp, Telegram and phone calls (stubs today); Gmail, Google Calendar and Drive adapters; Google Contacts sync.
- Video room (needs MEETING_PROVIDER_BASE_URL and a server).
- Phase 3 Recall hardening (embedding dimensions, HNSW index, auto-memory path, AnythingLLM citations): planned, untouched.

## D. Built but unproven or unverified
- Real-Postgres CI runs on every push. As of 2026-10-27 typecheck, lint, `prisma migrate deploy` on Postgres 16 + pgvector, seed, unit tests and build pass in CI. The Playwright e2e step failed because the login helper clashed with the passkey button and the new login labels; the helper is fixed and public-page specs added (e2e/tests/public.spec.ts), result pending on the next run.
- Migrations are proven on a throwaway CI database, but the app has not been used signed in by Victor; passkey, SMS and the new screens are untested in a real browser; phone width (390 px) checked only for the landing and auth pages (conversation and onboarding not rendered).
- Twilio SMS never called against the real API.
- The last round of fixes (taint allow-list, bootstrap token, migration changes, passkey ordering) had no third independent security review.
- Not yet run: brand-guardian review of the new screens, compliance review (CASL, PIPEDA) of social, SMS and email, qa-engineer, ai-evaluator, performance benchmarks (Phase 2e E3 to E7).

## E. Known small gaps
- No password-change route or sign-out-everywhere; session version cache lags up to 15 seconds across processes.
- Change Request after reload cannot show its approval card (offers submit again); contracts list has no totals; meeting room cannot say why no room was created.
- Abandoned PLANNED swarm runs count against the budget until cancelled.
- Approved contact messages by non-SMS channels are stubs; old lib/twilio-adapter.ts remains; the automated briefing reminder still needs BRIEFING_SMS_TO and BRIEFING_REPORTS_DIR.
- Animated avatars keep the approved portraits; the white-background WHINK and MAMBA images are for the Board Room only.
- Render has duplicate services (wpma and Wpma, whinkpredict and whink-bet): tidy after the hosting move.

## F. Added 2026-10-27
- Product-tour screenshots on the landing page show sample-data tells ("Dev", a fake phone number, "Fixture"); recapture with curated demo data before any public release.
- Terms and Privacy are internal drafts; legal review before external release. Contact address comes from tenant config (`legalContactEmail`).
- Per-email reset throttle can be used to annoy a victim (3 per 15 min); add a "check again in 5 minutes" hint and an owner alert when SMTP exists.
- The standalone `openclaw-jarvis` repo (a copy of the open-source OpenClaw) has no approval step for posting; it defaults to exec security `full`, ask `off`. Keep social logins and credentials away from it, or route posting through WHINK's gateway.
- Remaining dependency audit findings (below the high gate): csv-parse (moderate, needs a major version bump of the `csv` package) and two low. Revisit with the next dependency pass. Keep `pnpm audit --prod --audit-level=high` green.

## G. Local Gemma agent (added 2026-10-28)
Built and independently reviewed, never run against a real Ollama or on the owner's Mac. All behind flags; nothing runs unless WHINK_LOCAL_AGENT_TOOLS=true and WHINK_WORKSPACE_ROOT is set, and only for owner accounts.
- Try it on the Mac: ollama pull the Gemma model, set DEFAULT_MODEL to it (or WHINK_LOCAL_MODEL with WHINK_LOCAL_ONLY=true), confirm the 3 to 4 second tool round trip Victor measured. Report timings and any Ollama error text (the 'does not support tools' wording and the malformed-tool-call response are unverified).
- Not built yet, by design: apply_patch and run_test (need approvals plus another independent security review). git_commit, git_push, rm, network, messaging, money and production tools stay unavailable.
- streamChat (plain streamed replies without tools) still uses the OpenAI-compatible /v1 path for Gemma; only the tool loop and one-shot chat use native /api/chat.
- Local-Only mode: spoken approvals in approval-card.tsx still use browser speech (set NEXT_PUBLIC_WHINK_LOCAL_ONLY=true for the voice hook); owner emails are not verified (open signup lets a stranger register a listed owner email that has no account yet; keep SIGNUP_ENABLED false); a hardlink to a secret file is refused only when its link count is above 1; the 50 ms settle in project-access.test.ts works around an in-flight import race in that test file.
- Apple git 2.39 (Xcode tools) lacks GIT_ATTR_SOURCE; the hostile-config refusal still applies and a warning is logged.

## H. Capability Gateway / Integration Hub (added 2026-11-01)
MERGED to `main` on 2026-11-01 from `integration/echelon-capability-gateway` (PR #3, merge commit). Design and limits: docs/CAPABILITY-GATEWAY.md. Review fixes: docs/decisions.md, entry "independent security review".
Waiting on Victor:
- CodeQL: GitHub offers no code scanning switch for this private repository (checked 2026-11-01). Victor chose option A (analyse, do not upload); NOT yet implemented, so CodeQL is red on every PR until it is. Buying GitHub Code Security is spend: needs Victor's approval.
- Turn on branch protection with required reviews on `main` (item A7).
- D-1 (hosting for the remote worker) before the physical Mac-off acceptance test E5.
- Confirm the 12 gitleaks findings allow-listed in `.gitleaksignore` (11 test fixtures, 1 base64 false positive in the master plan). Reviewed from the redacted CI log and file context only.
- Confirm defaults: heartbeat 30/75/120 s, grants capped at 30 days, one `ENCRYPTION_KEY` for all provider credentials.
- Reset any dev database that applied an earlier version of migration 20261101120000_capability_gateway_e1 (edited in place before merge).
Open engineering items:
- A second independent security-reviewer pass on the review-fix changes (egress, review flow, registry scoping). Not yet done.
- Before any agent or chat path calls a provider tool: wrap and injection-scan provider output and descriptions (review CG-12).
- Accepted for now: CG-9 in-flight owner test call survives a revoke; CG-13 ciphertext in old row versions and backups; CG-14 a bland-named money tool relies on the review.
- Not built: stdio host agent, plugin formats beyond MCP, OpenClaw capability adapter, network-level egress (pf or container on the Mac), OAuth for providers, key rotation and per-host keys, a scheduled worker job for the host sweep.
- Phase 3 Recall hardening (section C) is still untouched.
Qodo review of PR #3, not fixed (details in docs/decisions.md, "Qodo code review"): #9 concurrent discovery race; #13 Hub live feed misses final receipt status; #14 pin the gitleaks tarball hash from a trusted source. Imported-baseline findings to verify and fix separately: approvals sweep vs long-running EXECUTING (#2), services/openclaw DNS rebinding and stale routes after outage (#6, #7), concurrent password-reset links (#8).

