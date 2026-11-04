# Historical handoff — current status superseded 2026-11-04

The imported handoff below preserves its original dated claims; old repo names, branches, test results and "next action" are **not current instructions**. Current repo is `whinkproducts-alt/ECHELON-CORP`, main code baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. Read [docs/ECHELON-AUDIT-HANDOFF-2026-11-04.md](docs/ECHELON-AUDIT-HANDOFF-2026-11-04.md), [docs/pending-tasks.md](docs/pending-tasks.md) and the newest daily sync. For root handoffs, these documents are under `docs/`. Mandatory engineering/security rules remain binding. Do not execute old import/reset/merge instructions or claim historical failures as current.

---

# WHINK Ultimate — Local Ollama handoff

Date: 2026-10-27
Repository: `whinkproducts-alt/KAMSI-PRIME`

You are continuing work locally in the existing repository. Work only in the current checkout. Do not reset, discard, or overwrite existing user changes. Do not print, request, commit, or push secrets.

## Goal

Make WHINK Ultimate genuinely usable end to end, starting with the critical communication and connected-app paths. WHINK and MAMBA are the executive layer and must retain their full authority. They may cascade work to directors and specialists. Do not reduce their powers. Do not change HOLO UI. Do not lock the project into OpenClaw; keep approval policy configurable.

## Current repository state

The public landing page, first-run onboarding, and dashboard navigation have already been improved. Existing dashboard routes should be treated as real screens, not placeholders. The current branch may contain uncommitted work; inspect `git status` and `git diff` before editing.

## Work already started in this checkout

1. SMTP delivery was changed from an explicit stub to a Nodemailer SMTP implementation in `apps/web/lib/comms/delivery.ts`.
2. `nodemailer` was added to `apps/web/package.json` and the workspace lockfile.
3. `SMTP_SECURE` was added to `apps/web/.env.example`.
4. Connected Apps consent is being persisted:
   - `SocialConnection` has `consentGrantedAt` and `consentTextVersion` fields.
   - A Prisma migration exists at `apps/web/prisma/migrations/20261027013000_social_consent_audit/migration.sql`.
   - The social connect route passes consent version `v1` into the OAuth state.
   - The Connected Apps UI posts the consent acknowledgement.

Finish and verify these changes before starting unrelated work.

## Required implementation checks

### SMTP

- Confirm Nodemailer types and TypeScript compilation.
- Add a focused test for successful SMTP delivery using a mocked transporter.
- Add tests for missing host/from, invalid port, and delivery failure.
- Ensure password reset reports the difference between queued/sent and not configured.
- Never log SMTP passwords, reset tokens, message bodies, or full recipient data.
- Use these environment variables only; never hard-code credentials:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### Connected Apps

- Run `prisma generate` and apply the consent migration in a safe local database.
- Add or update tests proving consent is required, stored with version `v1`, and never returned with tokens.
- Confirm OAuth state remains single-use, PKCE-protected, user-scoped, encrypted, and redirect-allowlisted.
- Treat X as the implemented adapter only if its live API path passes tests.
- Keep Instagram and TikTok visibly marked as limited until their platform-specific identity and publishing paths are verified.
- Do not claim a platform is connected merely because the UI button exists.

## Critical feature-completion queue

1. Password recovery: SMTP delivery, reset-email integration test, honest UI status.
2. Connected Apps: durable consent, real provider health states, X end-to-end verification.
3. Durable Kill Team objectives: persist founder objective, director cascade, status, evidence, and completion.
4. Worker: enable and verify scheduled jobs, heartbeat, retries, and failure reporting.
5. OpenClaw: only after the founder chooses the approval model; keep it disabled when credentials are absent.
6. GitHub change requests: configure only with a fine-grained issues-write token and test approval-to-issue flow.
7. Meeting provider: configure only with a self-hosted provider and verify private room creation.
8. Local-first model routing: Ollama first; cloud only on explicit bounded escalation. Never auto-buy credits.
9. Integration health: show configured, reachable, authenticated, and action-tested as separate states.

## Rules

- Do not weaken WHINK or MAMBA authority.
- Do not remove founder approval for money, external communications, destructive actions, permission changes, or production changes.
- Do not silently add browser automation, password-manager access, or email-account access.
- Do not use screenshots or browser sessions as a substitute for provider APIs.
- Do not send real email, social posts, messages, or money during tests.
- Do not expose `.env`, `.env.local`, tokens, passwords, OAuth secrets, reset links, or database URLs.
- Do not commit or push. Return a concise report of files changed, tests run, blockers, and the exact user-owned values still needed.

## Validation

From `apps/web` run, as appropriate:

```sh
pnpm typecheck
pnpm lint
pnpm security:scan
pnpm exec vitest run lib/__tests__/password-reset.test.ts lib/__tests__/social-ui.test.ts lib/__tests__/social-hardening.test.ts
pnpm build
```

The repository has a known full-suite issue: an Ollama integration test can exceed its short timeout when Ollama is running, and the skills pipeline can report an asynchronous `ReadableStream is already closed` error. Report these honestly; do not weaken production security or hide the failures.

## Final report format

- Completed end to end
- Files changed
- Tests passed
- Tests blocked or flaky
- Provider credentials/configuration still needed from the founder
- Recommended next smallest step
