# W.H.I.N.K. Ultimate: Handoff (2026-10-28)

Read CLAUDE.md first, then docs/decisions.md, docs/pending-tasks.md, docs/learnings.md, docs/security.md. This file is the state of play at the end of this session. Owner and final approver: Victor Igboekwe.

## 1. State of main
- Everything from the work branch `claude/loving-archimedes-70hf66` was pushed to `main` at Victor's instruction ("push everything to main regardless, I will check the code elsewhere").
- Last independently verified state: main at f257b09 was green on ci, audit, CodeQL and gitleaks.
- The commits pushed after that (listed in section 3) were NOT re-run in CI or reviewed by a second agent before the push. Treat CI on main as the first check, then review them.
- The builder reported `pnpm test` green twice (139 files, 2018 passed, 38 skipped), and tsc and eslint clean on touched files. `pnpm security:scan -- --all` passed. I did not re-run the suite myself after the final edits.

## 2. What was built this session
- Public front page, onboarding, forgot/reset password, Terms and Privacy (internal drafts), conversation starters and slash menu, accessibility fixes.
- Security fixes from the external scan and own review (CSRF path handling, referrer policy, linear HTML-to-text, model policy, rate limits, API key ledgering).
- Local Gemma agent: native Ollama transport, read-only sandboxed workspace tools, Local-Only mode. Three security review rounds. Flags in `apps/web/.env.example`.
- Setup docs rewritten (SETUP.md, README.md); nodemailer and pnpm 12 age-rule fixes; CodeQL, audit, gitleaks fixes.

## 3. Commits that reached main without CI or second review
1. c20e3b4: removed the late-approval council (`lib/approval-council.ts` and its test); `lib/approvals.ts` sweep now only marks EXPIRED; `recordCompletedTurn` in `lib/auto-memory.ts` now follows the B-rules (skip tainted/injection turns, secret drop, daily cap, permission check, MAMBA to hypothesis at confidence 0.4 or less, dedup, ledger rows without content).
2. 7d2b39f: freeze fix. Statement length cap (`MAX_STATEMENT_CHARS` 4000), classifier scans in 4000-char windows, bounded regexes, named-person check made linear, cap lookup failure writes nothing and ledgers `cap_check_failed`, sweep ledger rows use initiator `system`.
Reason for 2: one very long message made a quadratic regex stall the server (about 12 s at 40 KB), blocking every tenant. Main had the same stall before this.

## 4. Decision needed, and a conflict to know about
- Victor said: "Keep the council on the branch, will run a fix on it with the other Chat agent", then later said to push everything. Pushing everything includes the council removal. If the other agent's fix expects the council code, restore it from commit 2f0d331 (original code). Confirm with Victor which he wants.
- Rule 10 (money and proprietary information need Victor's approval by request id) is unchanged and outranks everything.

## 5. Open items (from docs/pending-tasks.md, abbreviated)
- Run CI on main and review the two commits above.
- Victor to run the Mac steps for Gemma and report timings; confirm the Ollama model tag from `ollama list`.
- Verify real Ollama behaviour (400 for no-tool models, malformed tool-call responses).
- apply_patch and run_test tools not built (need approvals and a new review).
- Owner emails are unverified while signup is open: keep `SIGNUP_ENABLED` false.
- nodemailer is MIT-0: confirm the licence with Victor (rule 7).
- 11 dependabot branches unreviewed; merging blindly can re-break the pnpm 12 release-age rule.
- Branch protection on main is not set.
- Real SMTP values and password-reset email sending to be configured.
- Kill Team "founder control" text is display-only, not backed by code.
- Terms and Privacy are internal drafts; product-tour screenshots show sample-data tells.

## 6. Gotchas
- Secret scanner blocks commits containing key-like literals, including in tests. Build fake secrets at runtime; never loosen the scanner.
- gitleaks flags a key name next to a high-entropy value even across string joins.
- pnpm 12 enforces a 24 h release age; CI pins pnpm 10.28.0.
- Stale Prisma client causes type errors: run `prisma generate`.
- Zod 4 `.partial()` keeps `.default()`.
- A1 and A6 greps in CLAUDE.md must stay clean (ledger writes only in `lib/ledger.ts`, no provider SDK outside the router).
