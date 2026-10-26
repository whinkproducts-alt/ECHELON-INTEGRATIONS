# Pending tasks (2026-10-26)

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
10. Decide whether to open a pull request for branch `claude/loving-archimedes-70hf66` (none is open).
11. Set mail forwarding for whinkgroup.com at the mail provider once the domain exists.

## B. Proposed, not built (Victor said do not build until approved)
- Forgot password (emailed one-time link and a local recovery command), change password screen, labelled Sign out, and a Sign out everywhere action. The first password-change route must call `bumpSessionVersion()`.
- Installer for Windows or Mac (stage 1: start script plus browser install; stage 2: signed installer).
- Agents drafting Change Requests for approval.
- Hosting migration kit (Docker, Caddy, GitHub Actions deploy, backups, runbook) after A2.

## C. Requested earlier, not built
- Edit the product websites from the app; update the company website from news and initiatives.
- Real sending for email (SMTP), WhatsApp, Telegram and phone calls (stubs today); Gmail, Google Calendar and Drive adapters; Google Contacts sync.
- Video room (needs MEETING_PROVIDER_BASE_URL and a server).
- Phase 3 Recall hardening (embedding dimensions, HNSW index, auto-memory path, AnythingLLM citations): planned, untouched.

## D. Built but unproven or unverified
- Real-Postgres CI and Playwright e2e suite exist (.github/workflows/ci.yml, e2e/) but have never run. The builder hit the weekly account limit, which resets Oct 28 09:00 UTC; resume it then.
- Nothing has run against a real database or a signed-in session; passkey, SMS and the new screens are untested in a real browser; phone width (390 px) not checked on every screen.
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
