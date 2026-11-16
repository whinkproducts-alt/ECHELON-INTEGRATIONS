# Pre-release review pack (item 47), 2026-11-15

Scope: the checks to finish before anyone but Victor uses the product. Sections 1 and 5 need Victor. Everything marked **measured** was run on this machine on this date; everything marked **not checked** was not.

## 1. Privacy and legal checklist (Needs Victor: legal sign-off)
Counsel, not code, signs this. Items an engineer can prepare are ticked "prepared".

| Area | Item | State |
|---|---|---|
| PIPEDA | Document what personal data is collected (memory, documents, contacts, voice, ledger) and why | not written for customers; internal inventory in `docs/SERVICE-INVENTORY.md` only |
| PIPEDA | Access and deletion: user can see and delete memories, documents, contacts | in-app screens exist (memory, documents, contacts); end-to-end deletion proof not re-run here |
| PIPEDA | Retention periods for ledger, memory, voice, backups | **not defined**: Victor decision. Backups (`docs/ops/BACKUP-RESTORE.md`) hold everything until deleted |
| PIPEDA | Breach response and 72 h style notice plan | not written: Needs Victor |
| PIPEDA | Third-party personal information in contacts and documents | policy text not written |
| CASL | Consent records for any outbound email/SMS sent for a customer; unsubscribe | transports exist (`lib/comms/delivery.ts`); protected sends need owner approval. Consent store and unsubscribe not audited here |
| Terms | Terms of service, privacy policy, DPA for white-label customers | not written: Needs Victor and counsel |
| Providers | Each model/voice provider's terms and data-processing for customer data; training-use settings | not reviewed here; keys not present |
| Licences | Only MIT/Apache/BSD/ISC (rule 7) | `docs/THIRD_PARTY_NOTICES.md` exists; `pnpm audit --prod`: no known vulnerabilities (2026-11-15 per backlog). Full licence re-scan **not run** here |
| Hosting | Where customer data lives (country), sub-processors | undecided until item 38 is chosen |
| Secrets | gitleaks and CodeQL green in CI on PR #14/#15; secret scan script `pnpm security:scan` exists | prepared |
| Transport/headers | Measured on `/login` (production build): CSP with nonce + strict-dynamic, X-Frame-Options DENY, nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy limits camera/mic to self. **No HSTS header seen** (expected from the TLS proxy; the Caddy overlay in `packaging/hosting` adds TLS but does not set HSTS yet) | HSTS to add at hosting time |

## 2. Performance budget (measured, M3 / 16 GB / macOS 26.3 / Node 22.23)
Caveat: ten parallel build sessions were running (load average 80 to 226 during the build and test timings, about 11 for the latency run). Build and test times are upper bounds.

| Measure | Result | Budget (proposed, Victor to confirm) | Verdict |
|---|---|---|---|
| Production build (`next build --webpack`) | 130 s loaded; 31 s with warm cache | under 5 min | within |
| `tsc --noEmit` | 35 s loaded | under 2 min | within |
| Unit suite (vitest, 189 files, 2508 tests) | 19 s quiet, 33 s loaded | under 2 min | within (one timing test, `gesture-latency`, flaked under load) |
| Web cold start to first `/login` | 841 ms (empty database) | under 3 s | within |
| `/login` latency, 60 requests, localhost | p50 4 ms, p95 9 ms | p95 under 200 ms | within |
| `/api/signup/status` | p50 6 ms, p95 7 ms | p95 under 200 ms | within |
| Web process memory after the above | 189 MB RSS | under 512 MB idle | within |
| Backup/restore | 81-table schema, 25 rows: instant, 192 KB dump | n/a | **not measured with realistic data** |
| Chat first-token, recall at 10,000 memories, voice latency, worker under load | **not measured here**: need models and data (Phase 3 D5 budget of 150 ms p95 recall is still open) | | open |

Reproduce: `scripts/ops/test-restore.sh`; build and tests as in `docs/lanes/g2-notes.md`.

## 3. Accessibility audit of main screens (code-level; not a screen-reader or contrast-tool run)
Method: static search of `app/` and `components/` (271 TSX files) plus the served `/login` HTML. Counts are heuristics; multi-line JSX makes some false positives (images flagged for missing `alt` all had it).
Findings:
- **A1 (real)** `components/ui/task-card.tsx:49,52` icon-only edit and delete buttons have no accessible name. Fix: `aria-label`.
- **A2 (check)** `outline-none` without a visible focus replacement on `components/shell/command-palette.tsx:73` and `components/ui/command.tsx:50,121` (cmdk input and items; confirm a focus style exists). The two `<main tabIndex={-1} outline-none>` elements are fine (skip-link target).
- **A3 (check)** 64 form controls with neither `aria-label` nor `id` on the same line, concentrated in `settings-surface.tsx` (9), `integration-hub.tsx` (9), `onboarding-step.tsx`, `spend-envelope-panel.tsx`, `projects-surface.tsx`. Many are probably wrapped in `<label>`; verify with a browser audit.
- **Good:** `<html lang="en">`, viewport meta, `id="main-content"` skip target in both shells, 173 `aria-live`/`role=status|alert` uses, 22 files honouring reduced motion, avatar and brand images carry `alt`.
- **Not done:** colour-contrast measurement (dark theme tokens; amber `#F5A623` and denial `#E5484D` on `#0E1520` need a contrast run), keyboard-only walk-through of approvals and Board Room, VoiceOver pass, 200% zoom. Recommend axe-core against the running app as a follow-up (it is MPL-2.0, so dev tool only, ask Victor first).

## 4. Brand and white-label check (code-level)
- Hex literals in TSX: 11, in 3 files: `components/ui/persona-avatar.tsx` (8, the deterministic avatar palette), `components/ui/agent-card.tsx` (2), `components/holo/news-surface.tsx` (1). Rule 3 says colours come from tokens; the avatar palette is the documented exception in CLAUDE.md ("WHINK palette"), the other 3 should be moved to tokens.
- Product name in JSX text: 8 literal "WHINK" strings (conversation persona option, kill-team screen, change-request screens). The persona name WHINK is a mind name rather than the product name, but customer-facing strings should come from tenant config before white-label sale (rule 3). Page `<title>` is "Whink Ultimate", hardcoded; should be tenant-driven.
- Not done: font loading check (Jost, IBM Plex), logo usage, design-token drift beyond the above.

## 5. Hosting
See `docs/ops/MAC-OFF-HOSTING.md`. Nothing provisioned. Needs Victor: host, domain, spend, off-site backup location.

## Recommended order before wider release
1. Victor: retention and breach plan, terms/privacy text, counsel sign-off.
2. Engineering: A1, move 3 hex literals, tenant-driven title and strings, HSTS at the proxy.
3. Run axe-core and contrast tooling, record results here.
4. Measure recall and first-token budgets with real models.
