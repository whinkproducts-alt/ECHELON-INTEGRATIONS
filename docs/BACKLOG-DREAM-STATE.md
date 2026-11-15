# ECHELON-INTEGRATIONS: dream-state backlog (2026-11-15)

Built from `docs/pending-tasks.md`, `docs/handoffs/*` and this session's verified runs. Status words mean:
**Done** = built and proven by tests or a real run. **Built, not accepted** = code exists, nobody has used it on the Mac. **Open** = not built, or waiting on a decision or on Victor.

## Completion

Method: every line below counts once, unweighted (not effort). Done = 1, Built-not-accepted = 0.5, Open = 0.

| | Items | Credit |
|---|---|---|
| Done | 17 | 17 |
| Built, not accepted | 7 | 3.5 |
| Open | 24 | 0 |
| **Total** | **48** | **20.5 → 43%** (35% if only "Done" counts) |

Engineering-only open items: 15. Open items that wait on Victor: 9 (marked **V**).

## Features gained (all Done, on `main` at e14199f)

| # | Feature | Proof |
|---|---|---|
| 1 | Marcus intake: field validation, hash lock, idempotent replay | real Postgres + Marcus's own client |
| 2 | Marcus approval consumed exactly once (atomic) | concurrency test |
| 3 | Freeze and account lockdown block new tasks | tests |
| 4 | Marcus task status, confirm, resume and a live status stream | real HTTP |
| 5 | Worker repaired; daily budget report job | worker boots |
| 6 | Marcus executor: admits, runs real local-model analysis, ends `done` (~49 s) | real Ollama |
| 7 | Cross-department requests: up to 5 specialists in ≥4 directorates; over 5 blocks as `too_many_departments` | tests |
| 8 | Subsidiary labels and directorate steering (ECHELON side) | tests |
| 9 | `result_summary` returned, so Marcus sees results | e14199f |
| 10 | Build repaired: tsc 0, lint 0 errors, `pnpm build`, 2,491 tests pass | CI green |
| 11 | Marcus doc `docs/ECHELON-INTEGRATION.md` in the Marcus repo | 40f4649 |
| 12 | Marcus app pushed to its own repo | dd70be1 |
| 13 | Capability grants, per-tool policy, at-most-once dispatch | existing, verified |
| 14 | Real-database and Ollama test harness; model quality comparison | opt-in suites |
| 15 | `scripts/marcus-e2e.py` drives Marcus's client against ECHELON | ran once |
| 16 | Second-machine setup doc (`HARDWARE_SETUP.md`) | doc |
| 17 | Local-model check fixed | test |

## Built, not accepted (0.5 each)

| # | Item | What is missing |
|---|---|---|
| 18 | E01 spend admission | operator release after cutoff, micro-USD in usage UI, live paid test |
| 19 | Org-tier approval (opt-in, default off) | the 8-tier chain was not built (see 44) |
| 20 | Local-only enforcement | present in 12 modules; no single enforced check or call-site audit |
| 21 | Model failover modules | live ordered failover never shown |
| 22 | Executive screens | never opened in a browser |
| 23 | Voice, media, speech, avatar | no Mac audio acceptance |
| 24 | Hosts / infra (Group E) | no run outside tests |

## Open

| # | Item | Waits on |
|---|---|---|
| **25** | **Warp opening screen before login** (see below) | engineering + **V** (decisions) |
| 26 | Marcus sends `subsidiary` / `target_subsidiaries` (client allow-list, schema, model) | engineering, Marcus repo |
| 27 | Security review of the `proxy.ts` exemption for Marcus routes | security-reviewer |
| 28 | Auto-split requests over 5 domains | **V** (decide) |
| 29 | Owner account and passkey (F01) | **V** |
| 30 | Run executor on the Mac with a real account and worker | **V** |
| 31 | E02 live model failover | engineering |
| 32 | E03 durable founder-private objectives and memory | engineering |
| 33 | E04 lockdown across in-flight jobs, mic and camera | engineering |
| 34 | E05 iMessage bridge, real two-way phone audio | engineering + **V** |
| 35 | E06 real GitHub mission acceptance | **V** (F02) |
| 36 | E07 Board Room motion and voice, HOLO lifecycle, 15 vs 16 directorates | **V** (roster) |
| 37 | E08 desktop app, readiness, backup and tested restore | engineering |
| 38 | E09 Mac-off hosting | **V** (F06) |
| 39 | Nothing run on Windows | engineering |
| 40 | 131 dependency alerts; Prisma 7 and TypeScript 7 held; PRs #14, #11, #9, #15 | engineering |
| 41 | 132 skipped tests are not acceptance | engineering |
| 42 | Do Marcus tasks need attached documents or memory? | **V** (decide) |
| 43 | Does an SSH tunnel count as "local" for a second machine's Ollama? | **V** (decide) |
| 44 | Amend non-negotiable 4 to allow agent-tier approvals | **V** (decide) |
| 45 | Freeze sentinel row → table; crash between consuming approval and queueing ends `failed` | engineering |
| 46 | Worker-kill chaos test | engineering |
| 47 | Before wider release: legal/privacy, performance, accessibility, brand, hosting | engineering |
| 48 | Founder inputs F02–F08 (GitHub, channels, models, approvals, remote host, roster, repo settings) | **V** |

## Item 25: Warp opening screen (source: `docs/product/Whink-Warp-Preview.html`)

**Goal:** the first thing a visitor sees at `/` is the warp opening (logo, "CREATE THE U.L.T.I.M.A.T.E UNIVERSE"). **Clicking anywhere on the page goes to `/login`.**

**Acceptance**
- `/` shows the opening; `/login` stays the real sign-in page and still works directly.
- A click or tap anywhere, and Enter, Space or Escape, go to `/login`. The "Continue to sign in" button stays for keyboard and screen-reader users.
- Pause stays available; clicking Pause or Replay does not navigate.
- Reduced-motion users get the still version and the same click-through.
- A signed-in user who opens `/` is not stuck on the opening (goes straight to the app).
- If the logo fails to load, the page still works and click-through still works.

**Problems in the attached file that must be fixed first**
1. Sign-in link is hard-coded to `http://localhost:3210/login`. Nothing here runs on 3210. Use `/login`.
2. Only the button and Escape leave the page. "Click anywhere" is not built.
3. 1.6 MB single file: the logos are embedded as base64. Serve them as static assets, so the page loads fast.
4. The page must be reachable before login. `proxy.ts` sends visitors to `/login`; `/` needs an exact-match allowlist entry, and that needs the same security review as item 27.
5. No test exists. Add one: `/` renders for a visitor, click goes to `/login`, a signed-in user skips it.

**Open decisions (V):** show the opening every visit or once per session; add a visible "skip" hint; sound or silent (the file has none).
