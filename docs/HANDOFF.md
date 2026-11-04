# Historical handoff — current status superseded 2026-11-04

The imported handoff below preserves its original dated claims; old repo names, branches, test results and "next action" are **not current instructions**. Current repo is `whinkproducts-alt/ECHELON-CORP`, main code baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c`. Read [ECHELON-AUDIT-HANDOFF-2026-11-04.md](ECHELON-AUDIT-HANDOFF-2026-11-04.md), [pending-tasks.md](pending-tasks.md) and the newest daily sync. For root handoffs, these documents are under `docs/`. Mandatory engineering/security rules remain binding. Do not execute old import/reset/merge instructions or claim historical failures as current.

---

# W.H.I.N.K. Ultimate: Full Handoff

Date: 2026-10-28
Repo: whinkproducts-alt/KAMSI-PRIME (Next.js 16 app in `apps/web`)
Owner and final approver: Victor Igboekwe
Branch state: `main` and `claude/loving-archimedes-70hf66` both at 9245102.

Read in this order: CLAUDE.md, this file, docs/decisions.md, docs/pending-tasks.md, docs/learnings.md, docs/security.md, the latest file in docs/daily-syncs/.

Standing preferences from Victor: never hallucinate, maximum accuracy; top-tier (Apple/Tesla/X level) design; builders never grade their own work; tokens and keys go in environment settings, never pasted into chat.

---

## 1. Verification status (read this first)

| Item | Status |
|---|---|
| main at f257b09 | Verified green: ci, audit, CodeQL, gitleaks |
| Commits c20e3b4, 7d2b39f, 9245102 | Pushed to main at Victor's instruction ("push everything to main regardless, I will check the code elsewhere"). NOT run through CI and NOT reviewed by a second agent before the push |
| Builder report on those changes | `pnpm test` green twice (139 files, 2018 passed, 38 skipped); tsc and eslint clean on touched files; A1 and A6 greps clean |
| My own checks on those changes | `pnpm security:scan -- --all` passed (1069 files). I did not re-run the full test suite, tsc or eslint myself after the final edits |
| Test-fails-on-old-code proof for the new classifier timing tests | Not done (I was interrupted). The builder reported 4 of 12 timing tests failed on old code in a scratch copy |

First action for the next session: check the CI run on main, then have a separate reviewer go over the three commits.

---

## 2. What the product is

W.H.I.N.K. (World-Aware Human-Integrated Neural Kernel) Ultimate is an AI personal CEO built by WHINK Apps (The WHINK Group, Calgary). It runs Victor's own work first and is later sold white-labelled. Two minds share one memory and permission system: WHINK (chief-of-staff voice) and MAMBA (adversarial strategist, Obsidian mode only). A persona is never a permission.

Non-negotiables (full text in CLAUDE.md): no secrets in git; tenant isolation on every query; white label (no hardcoded name/logo/colour); every action through `lib/permission-engine.ts`; every action ledgered through `lib/ledger.ts`; external content is untrusted data; only MIT/Apache/BSD/ISC licences; no vendor lock (models via the router); builders never grade their own work; money and proprietary information always need Victor's approval by request id (outranks every other rule).

---

## 3. Work done this session, in order

1. **Standalone openclaw-jarvis check.** Victor asked whether the standalone repo (whinkproducts-alt/openclaw-Jarvis) can post to Instagram without approval. Finding: it is a stock OpenClaw copy with no approval gate; exec defaults are `full` with ask `off`.
2. **UX expert review implemented.** Public landing page for signed-out visitors (signed-in users redirect to /dashboard), demo console, product tour images, onboarding with a first request, forgot/reset password flow, Terms and Privacy pages (internal drafts, editable later), conversation starters and slash menu, accessibility fixes. Key files: `app/page.tsx`, `components/screens/landing/*`, `app/terms`, `app/privacy`, `app/forgot-password`, `app/reset-password`, `lib/auth/password-reset.ts`, `lib/auth/password-policy.ts`, `app/api/auth/password/{forgot,reset}`, migration `20261027001000_password_reset_tokens`, `components/brand/brand-mark.tsx` (`interactive` prop), `components/screens/conversation-helpers/slash-commands.ts`.
3. **PR #1 merged to main (bf54a3f)** after CI and security fixes.
4. **External agent scan findings (F1 to F6)** verified one by one; real ones fixed. Fixes include: `lib/csrf.ts` (decode and normalise path; only the NextAuth catch-all is exempt), `lib/security-headers.ts` (per-path Referrer-Policy via `wantsNoReferrer`), `lib/html-text.ts` (linear HTML-to-text scanner), `lib/model-policy.ts`, `lib/rate-limit.ts` (`tools_execute`), API key routes now ledgered.
5. **Mac setup walkthrough** (Docker, `.env`, database, pasted-error troubleshooting). SETUP.md and README.md rewritten: Node 22+, pnpm 10+, copy-paste `.env` block, `docker compose up -d postgres`, `prisma migrate deploy`, troubleshooting for port 5432, Docker credential helper, pnpm 12.
6. **Repo-readiness check** found a nodemailer audit failure, doc gaps and unreviewed commits; all fixed (see section 5).
7. **Local Gemma agent** (built after Victor chose "Continue the build from where the last agent stopped"): native Ollama transport, read-only sandboxed workspace tools, Local-Only mode. Three security review rounds. Pushed to main (b782496) on request. Details in section 4.
8. **Senior-engineer sub-agent** correctness review fed the consolidated fixes.
9. **Dependency and scanner fixes:** nodemailer, pnpm 12 release-age (postcss pinned to 8.5.31 with override), CodeQL, audit (31 findings down to 3), gitleaks (fake secret literals in tests assembled at runtime, final fix f257b09).
10. **Council removal, memory change and freeze fix** (section 6), pushed to main last.

---

## 4. Local Gemma agent: design

- **Transport:** Ollama native `/api/chat` (think:false, stream:false, options.num_predict and num_ctx, keep_alive; tool results as role `tool` with `tool_name`; tool_calls arguments as objects; usage from prompt_eval_count and eval_count). Selected by `WHINK_OLLAMA_NATIVE_MODELS` (default `gemma`). Code: `lib/model-router.ts` (`isNativeOllamaModel`, `isLoopbackHost`, `nativeOllamaUrl`), `lib/model-router-tools.ts` (native chatWithTools, `ProviderUserError`).
- **Workspace tools** (read-only, Class A): `lib/workspace-tools/{sandbox,fs-tools,git,index,local-only,access,repo-view,redact}.ts`. Gated by `WHINK_LOCAL_AGENT_TOOLS` and `WHINK_WORKSPACE_ROOT`.
- **Sandbox rules:** realpath containment; deny list (NFC/NFD/NFKC, case-insensitive); git-ignored files hidden via git; hardened git (`execFile`, fixed args, minimal env, refuses hostile repo config); literal-only search; secret redaction before truncation; PEM private-key files refused; hardlink (nlink>1) refusal; O_NOFOLLOW with dev/ino re-check; owner-only via `WHINK_OWNER_EMAILS`.
- **Local-Only mode:** `WHINK_LOCAL_ONLY` and `NEXT_PUBLIC_WHINK_LOCAL_ONLY`. Guards in `lib/local-only.ts`, `lib/local-only-guard.ts`, applied to voice routes, news, social OAuth/connect, comms delivery, anythingllm-client, openclaw-client, offline, orchestrator, auto-memory, swarm planner, worker context, skills model, change-request github/refine. `redirectOpt()` sets `redirect:'error'` only for Local-Only or loopback.
- **Other edits:** `tool-registry.ts`, `gateway-chat.ts`, `tool-loop.ts` (`isExternalTool`), `permission-engine.ts` (workspace_* Class A), `protected-actions.ts` (added 'push' verb).
- **Env variables** (see `apps/web/.env.example`): WHINK_OLLAMA_NATIVE_MODELS, WHINK_LOCAL_AGENT_TOOLS, WHINK_WORKSPACE_ROOT, WHINK_LOCAL_ONLY, NEXT_PUBLIC_WHINK_LOCAL_ONLY, WHINK_OLLAMA_NUM_CTX (8192), WHINK_OLLAMA_KEEP_ALIVE (30m), WHINK_OLLAMA_TIMEOUT_MS, WHINK_TOOL_RESULT_MAX_CHARS (16000), WHINK_ALLOWED_MODELS.
- **Tests:** `workspace-{sandbox,git,registry,review2,redact}.test.ts`, `local-only-{router,surfaces}.test.ts`, `model-router-ollama-native.test.ts`, `model-policy.test.ts`, `messages-route-model-policy.test.ts`, `review-fixes-routes.test.ts`, `html-text.test.ts`.
- **Not built:** apply_patch and run_test (they need approvals and a fresh security review). `streamChat` for Gemma still uses `/v1`.

---

## 5. Setup, CI and supply chain facts

- **CI:** `ci.yml` (typecheck, lint, `prisma migrate deploy` on Postgres 16 + pgvector, seed, tests, build, Playwright e2e) runs on push to `claude/**` and main. `security.yml` (audit, gitleaks, CodeQL) runs only on PRs and main pushes. CI pins pnpm 10.28.0. Audit gate: `pnpm audit --prod --audit-level=high`.
- **pnpm 12** enforces `minimumReleaseAge` 24 h. postcss pinned to 8.5.31 with a lockfile override in `pnpm-workspace.yaml`; verified with pnpm 12.5.1 on a clean copy.
- **Secret scanner:** `pnpm security:scan` scans staged files; add `-- --all` for the whole tree. It blocked commits several times on fake key literals in tests. Fix is always to assemble the literal at runtime (example: `lib/__tests__/workspace-redact.test.ts`), never loosen the scanner.
- **gitleaks** `generic-api-key` matches a key name plus a nearby high-entropy value even across `' + '` joins, so keep the value away from the key name.
- **Local setup traps:** Postgres port override `POSTGRES_PORT`; Docker Desktop credential helper needs the right PATH; stale Prisma client gives type errors (run `prisma generate`).
- **Dependabot:** 11 branches unreviewed. Merging blindly can re-break the pnpm 12 age rule.

---

## 6. The three commits pushed without CI or second review

**c20e3b4: remove the late-approval council, record turns under memory rules**
- Deleted `lib/approval-council.ts` and `lib/__tests__/approval-council.test.ts`.
- `lib/approvals.ts`: the sweep now only marks requests EXPIRED (no `council` option).
- `lib/auto-memory.ts` `recordCompletedTurn` now follows the B-rules: skipped (ledger `memory_auto_skipped`, reason only) for injection-blocked, tainted or external-content turns; secrets dropped before permission check (`memory_secret_dropped`, no content); daily cap `MEMORY_DAILY_CAP`; permission check (`memory_auto_write` Class A, sensitive text Class B); MAMBA turns stored only as a hypothesis with confidence 0.4 or less; source `auto`, INFERRED, confidence 0.8 or less; identical text deduplicated per user; ledger rows carry ids and counts, never text; never throws.
- `app/api/conversations/[id]/messages/route.ts`: `recordCompletedTurn` started detached (`void ... .catch()`).
- Tests: `auto-memory.test.ts`, `approvals-no-late-approval.test.ts` (17 tests plus 40 KB and 200 KB timing tests).

**7d2b39f: bound the memory classifier**
- Cause: a third-party-name regex in `isSensitive` was quadratic; one 40 KB message took about 12 s and blocked every tenant. Main had the same stall (whole awaited turn, no cap).
- Fix: `MAX_STATEMENT_CHARS` = 4000 applied before any pattern; `isSecret` and `isSensitive` scan in 4000-char overlapping windows (at most 64, and `isSecret` fails closed beyond that); key/token, JWT, 24-char token, `\d{5,}` money and street-address patterns bounded; the named-person check replaced by a bounded scanner (`NAMED_PERSON` plus `THIRD_PARTY_FACT`).
- Daily-cap lookup failure now writes nothing and ledgers `memory_auto_skipped` with reason `cap_check_failed` (fail closed).
- Sweep, expiry and stuck-failed ledger rows use initiator `system`.
- Timing tests (40 KB and 200 KB of repeated words, "Alice Smith ", digits, punctuation, spaces after key, eyJ repeats) with a 1000 ms bound.

**9245102: this handoff document.**

---

## 7. Decision outstanding: the late-approval council

- Victor's messages, in order: first, he had not decided; then "Keep the council on the branch, will run a fix on it with the other Chat agent"; then "just push everything to main regardless".
- Result: the council removal is now on main. If the other agent's fix expects the council code, restore it from commit 2f0d331 (original code). Confirm with Victor which outcome he wants.
- Rule 10 (money and proprietary information need Victor's approval by request id, 30 s window, hash-locked, exactly once) is unchanged.

---

## 8. Open items

Waiting on Victor:
- Run the Mac Gemma steps and report timings; confirm the Gemma model tag from `ollama list`.
- Confirm he completed migrate and dev start on his Mac (not yet confirmed).
- Confirm the nodemailer MIT-0 licence (rule 7 requires asking before non-listed licences).
- Decide the council question (section 7).
- Provide real SMTP values; set up password-reset email sending.
- Set branch protection on main (not set).
- Terms and Privacy are internal drafts; legal text to be revised.

Engineering:
- CI run and independent review of c20e3b4 and 7d2b39f.
- Verify real Ollama behaviour: 400 text for models without tool support, malformed tool-call response.
- apply_patch and run_test tools (need approvals and review).
- `streamChat` for Gemma still on `/v1`.
- Spoken approvals in Local-Only use browser speech.
- Owner emails are unverified while signup is open: keep `SIGNUP_ENABLED` false.
- Apple git 2.39 lacks GIT_ATTR_SOURCE (affects the ignored-file hiding on that git version).
- Product-tour screenshots show sample-data tells.
- Kill Team "founder control" is display-only: the UI text "Allowed without another approval" is not backed by code.
- Review the 11 dependabot branches carefully (pnpm 12 age rule).
- Playwright D9 interpretation (no browser-automation dependency rule) to be settled.
- `project-access.test.ts` was flaky once (mock-ordering race); fixed with extra mock tables and a 50 ms settle; root cause not fully explained. Watch for repeats.

Roadmap per CLAUDE.md: Phase 1 complete; Phase 2 (Hands) current; Phase 3 (Recall) planned; later Voice, Face, Product. Victor's checklists for Phases 2 and 3 are in CLAUDE.md and are his to tick.

---

## 9. Gotchas

- Zod 4 `.partial()` keeps `.default()` values (caused a contact tags bug).
- A1 grep (ledger writes only in `lib/ledger.ts` and tests) and A6 grep (no provider SDK outside the model router) must stay clean.
- Nested links: BrandMark inside a Link caused a hydration error; use `interactive={false}`.
- Proxy overwrote Referrer-Policy; the rule now lives in `securityHeaders({pathname})`.
- CodeQL and gitleaks need `pull-requests: read` and `actions: read` permissions in the workflow.
- e2e: strict-mode clash with the passkey button; use labels and exact button names.
- Do not use `pkill -f` in the shell; it once killed the session shell.

---

## 10. Where things are

- Decisions: docs/decisions.md. Security notes: docs/security.md. Open tasks: docs/pending-tasks.md (section G covers the Gemma agent). Learnings: docs/learnings.md.
- Full session transcript: /root/.claude/projects/-home-user-KAMSI-PRIME/13509289-d387-531a-b37e-14d5d6421467.jsonl (cloud container; may not persist).
- Cowork project on claude.ai: "W.H.I.N.K ULTIMATE".
