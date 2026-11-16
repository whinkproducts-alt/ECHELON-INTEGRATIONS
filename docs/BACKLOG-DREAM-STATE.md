# ECHELON-INTEGRATIONS: dream-state backlog (2026-11-15)

Built from `docs/pending-tasks.md`, `docs/handoffs/*` and this session's verified runs. Status words mean:
**Done** = built and proven by tests or a real run. **Built, not accepted** = code exists, nobody has used it on the Mac. **Open** = not built, or waiting on a decision or on Victor.

## Completion

Method: every line counts once, unweighted (not effort). Done = 1, Built-not-accepted or built-not-connected = 0.5, Open = 0. Item 43 is merged into item 50. Item 26 is done (Marcus commit e7f92d1, pushed). Item 56 moved from Open to Built-not-accepted on 2026-11-15 (roster loaded into org-kit; database org table still to build).

| | Items | Credit |
|---|---|---|
| Done | 21 | 21 |
| Built, not accepted | 11 | 5.5 |
| Built, connection unverified (Part 2) | 13 | 6.5 |
| Open (Part 1: 27; Part 2: 40; Part 4: 10) | 77 | 0 |
| **Total** | **122** | **33 → 27%** |

Dream state: **every row in Parts 1 to 3 reads "built and connected"**, except the exclusions listed in Part 2.

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

## Priority order (set 2026-11-15; first line is first to do)

Ranked by safety, then what unblocks others, then features. "Needs you" items are listed last because they cannot move without you.

1. **Safeguards before loosening:** 58 and 59 (built), then 67, 68, 70 (open).
2. **Rule and correctness gaps:** 27 proxy exemption review, 45 crash window (fails closed today, so lower), 46 chaos test, 41 skipped tests.
3. **Core function:** 28 auto-split, 31 failover, 32 durable memory, 33 lockdown in flight, 52 to 55 KPIs, learning, individual chat, training.
4. **Connections (Part 2)** in the order of work below.
5. **Needs you:** 29 passkey, 30 real run, 48 founder inputs, 66 inference caps, 25 warp choices, 47 pre-release review.

## Open

| # | Item | Waits on |
|---|---|---|
| **25** | **Warp opening screen before login** (see below) | engineering + **V** (decisions) |
| 26 | ~~Marcus sends `subsidiary` / `target_subsidiaries`~~ Done 2026-11-15 (Marcus e7f92d1, 75 tests pass, not run on real Postgres) | push, then restart Marcus so its database gets the new columns |
| 27 | Security review of the `proxy.ts` exemption for Marcus routes | **Done 2026-11-15.** Reviewed all 7 routes: each calls `requireMarcusAuth` first (hash plus constant-time compare, fails closed when no hash is set). New test `marcus-proxy-exemption.test.ts` checks the exemption pattern matches exactly the routes that exist and that every method of every route returns 401 without a valid token. | Done |
| 28 | Auto-split requests over 5 domains | **V** (decide) |
| 29 | Owner account and passkey (F01) | **V** |
| 30 | Run executor on the Mac with a real account and worker | **V** |
| 31 | E02 live model failover | engineering |
| 32 | E03 durable founder-private objectives and memory | engineering |
| 33 | E04 lockdown across in-flight jobs, mic and camera | engineering |
| 34 | E05 iMessage bridge, real two-way phone audio | engineering + **V** |
| 35 | E06 real GitHub mission acceptance | **V** (F02) |
| 36 | E07 Board Room motion and voice, HOLO lifecycle, 15 vs 16 directorates | **V** (roster) |
| 37 | E08 desktop app, readiness, backup and tested restore | engineering. **2026-11-15 (lane G2):** `scripts/ops/` adds `db-backup.sh`, `db-restore.sh` (empty target only), `readiness.mjs` (2 node tests) and `test-restore.sh`: real migrations in a throwaway container, backup, restore to a second database, row counts of all 81 tables identical (PASS), populated target refused. Runbook `docs/ops/BACKUP-RESTORE.md`. Open: realistic-size data, scheduled and off-machine copies (Needs Victor: where), packaged-app readiness button, signed desktop app. |
| 38 | E09 Mac-off hosting | **V** (F06). **2026-11-15 (lane G2):** `packaging/hosting/compose.yaml` (Caddy TLS overlay, config validated) and `docs/ops/MAC-OFF-HOSTING.md`. Nothing provisioned. Needs Victor: host, domain, spend, off-site backups. |
| 39 | Nothing run on Windows | engineering. **2026-11-15 (lane G2):** `docs/ops/WINDOWS-RUN-CHECKLIST.md`; CI already builds and tests the installer on `windows-2025` and boots the stack on Linux. Real Windows run: Needs Victor (hardware). |
| 40 | Dependency alerts; Prisma 7 and TypeScript 7 held; PRs #14, #11, #9, #15 | engineering. **2026-11-15:** `pnpm audit --prod` reports no known vulnerabilities (hono pinned in `pnpm-workspace.yaml`, unused `@azure/storage-blob` removed). The older "131 alerts" figure was GitHub's count across all dependencies and has not been re-checked. Held majors and the four PRs are still open. **Lane G2 2026-11-15, throwaway-branch results (nothing merged):** PR #14 applies (re-apply bumps; PR conflicts with base), install, tsc, 2508 tests and `next build` pass: merge. PR #11/#9 (Prisma 7.10.1): CI fails, `prisma generate` rejects `directUrl`/`url` in schema, needs `prisma.config.ts` + driver adapter, do as one migration, close the two PRs. TypeScript 7.0.2: 47 type errors (Buffer vs Uint8Array), hold. PR #15: 12 conflicts vs base, do not merge as is. Also fixed a base type error in `marcus-proxy-exemption.test.ts` that broke `next build`. Detail: `docs/lanes/g2-notes.md`. |
| 41 | 132 skipped tests are not acceptance | **Done for the database tests 2026-11-15:** `pnpm test:real` (`scripts/test-real-db.sh`) starts a throwaway Postgres, migrates and runs every real-database test serially (96 pass). Serial running fixed a flaky worker test caused by parallel files stealing each other's queued jobs. The Ollama tests remain opt-in and need a running model. | Done |
| 42 | Do Marcus tasks need attached documents or memory? | **V** (decide) |
| 43 | ~~SSH tunnel counts as local?~~ Decided 2026-11-15: own SSH hosts count as local. Merged into item 50. | done in 50 |
| 44 | Amend non-negotiable 4 to allow agent-tier approvals | **V** (decide) |
| 45 | Freeze sentinel row → table; crash between consuming approval and queueing ends `failed` | engineering |
| 46 | Worker-kill chaos test | engineering |
| 47 | Before wider release: legal/privacy, performance, accessibility, brand, hosting | engineering. **2026-11-15 (lane G2):** `docs/release-review/PRE-RELEASE-REVIEW-PACK.md`: privacy/legal checklist (sign-off Needs Victor), measured performance on this Mac (web p95 9 ms, 189 MB, build 130 s loaded), code-level accessibility audit (1 real finding, 2 to verify), brand check (3 hex literals, hardcoded names/title). Open: contrast and screen-reader run, recall/first-token budgets with real models, legal sign-off. |
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

## Part 2: connect everything (decided 2026-11-15)

Target for every row: **built and connected**. "Connected" means all of: the key or login is in ECHELON's encrypted settings (never in git), a health check passes, one real call is ledgered, and for paid services a price and cap are set. Paid services stay switched off until you set the cap. Inbound content is untrusted data. Every write or send follows the permission classes.

### Decisions and the rules they touch

| # | Decision | Rule touched | Needed |
|---|---|---|---|
| 49 | **Browser:** allow a local, non-stealth, permissively licensed browser tool. Class C approval for any write. Page content untrusted. | Group D rule D9 (no automation libraries) | Amend D9 in `CLAUDE.md` and `decisions.md`. Licence check on the chosen tool. |
| 50 | **Remote execution:** own SSH machines count as local; cloud sandboxes (Modal, Daytona, Vercel) allowed with approval for each run. | Local-only enforcement (12 modules); Protected actions (data leaving the machine) | Amend the local-only rule. Cloud runs are Class C, and the approval card names what leaves. Cloud sandboxes also need a hard timeout and a cost cap. |
| 51 | **Global Approval, routine only:** a timed window you open and set. It lifts Class B, browser and in-cap tool approvals. Money, proprietary sharing, lockdown and spend caps stay protected. | Non-negotiable 4 (no shortcuts): it is a timed delegation, so no rule change. Rule 10 is untouched. | Build it (see below). |

**Global Approval requirements:** only you can open it, from a signed-in session with a passkey check. No agent or tool can open or extend it. It has a start, a fixed end and an instant cancel. It reverts on its own, including after a restart. Every action inside it is ledgered with the window id. Lockdown ends it at once. Its tests must prove money and sharing still need approval inside the window.

**Excluded, not built:**
- Honcho (leave it out; ECHELON memory covers it).
- Stealth browsers and CAPTCHA solving: Browserbase stealth, Camofox, Lightpanda, agent-browser. Claude will not build tools that bypass CAPTCHAs or bot detection, whatever the rule. Alternatives: official APIs, or the browser pauses and asks you to solve it.
- `SUDO_PASSWORD`: never. Use named-command sudo rules without a password if needed. Not yet confirmed with you.

### Connection checklist (53 items)

State today: **B** = built, connection unverified. **O** = open, to build or configure.

| Group | Item | Today | Notes |
|---|---|---|---|
| Models | Ollama (local) | B | default local path |
| Models | Anthropic | B | |
| Models | OpenAI-compatible | B | covers any compatible endpoint |
| Models | Gemini | B | |
| Models | NVIDIA NIM | B | trial adapter; metered stays blocked until priced |
| Models | OmniRoute | B | adapter exists |
| Models | Hermes | B | adapter exists |
| Models | OpenRouter | O | config + price + cap |
| Models | Fireworks | O | same |
| Models | Novita | O | same |
| Models | DeepInfra | O | same |
| Models | Hugging Face | O | same |
| Models | Kimi / Moonshot | O | same |
| Models | z.ai / GLM | O | same |
| Models | MiniMax | O | same |
| Models | Nebius | O | same |
| Models | Upstage | O | same |
| Models | Ramp Router | O | same |
| Models | Tencent TokenHub / TokenPlan | O | same |
| Models | OpenCode Zen | O | same |
| Models | OpenCode Go | O | same |
| Models | Arcee | O | same |
| Models | Xiaomi MiMo | O | same |
| Models | Ollama Cloud | O | not local: never for founder-private data |
| Search | Exa | O | gateway provider; metered |
| Search | Parallel | O | same |
| Search | Firecrawl | O | same |
| Search | Reddit (public feeds) | O | read-only |
| Media | FAL.ai images | O | metered; prompts leave the machine, approval each time |
| Browser | Local browser tool (decision 49) | O | |
| Models | Qwen OAuth (you import the login once into encrypted settings) | O | decided 2026-11-15; ECHELON never reads the other tool's file |
| Messaging | WhatsApp via unofficial bridge (Baileys-style) | O | needs "official APIs only" amended; ban risk on the number, use a dedicated one; licence check; Twilio stays the default |
| Messaging | Email out (SMTP) | B | |
| Messaging | SMS (Twilio) | B | |
| Messaging | WhatsApp (Twilio) | B | |
| Messaging | Telegram | B | |
| Messaging | Email in (IMAP) | O | owner allowlist |
| Messaging | Discord | O | owner allowlist |
| Messaging | Slack | O | owner allowlist |
| Messaging | Microsoft Teams | O | owner allowlist |
| Messaging | Google Chat | O | owner allowlist |
| Voice | Local Whisper | B | |
| Voice | Local Kokoro | B | |
| Voice | Groq speech | O | audio leaves the machine; approval |
| Voice | OpenAI speech | O | same |
| Voice | ElevenLabs | O | same |
| Execution | Local and Docker command backend | O | needs approval path first |
| Execution | SSH to own machines (decision 50) | O | |
| Execution | Cloud sandboxes (decision 50) | O | approval per run |
| Integrations | GitHub skills token | O | read-only, fine-grained |
| Integrations | Context compression | O | `context-budget.ts` exists; compare with Hermes behaviour |
| Integrations | Hyperliquid | O | reads; orders only by approval request ID |
| Safety | Global Approval window (decision 51) | O | |

Legend note: the 13 "B" rows are the ones counted at 0.5 in the completion table; the other 40 are Open.

### Order of work for Part 2

0. **First (decided 2026-11-15, safeguards before loosening):** build the execution sandbox (item 58) and sender pairing (item 59), and add OpenClaw's rule that approvals can only tighten policy, never loosen it, to learned delegations (item 60). The loosened rules in Part 4 are not switched on until these exist.
1. Amend D9 and the local-only rule in `CLAUDE.md` and `decisions.md` (you approve the wording).
2. Build Global Approval, with its tests, before any browser or remote-execution tool, so those tools use the same approval path.
3. Prove the 13 built rows are connected: run one real call each and ledger it.
4. Add the paid model providers by config, each off until its cap is set.
5. Add gateway tools (search, Reddit, FAL, GitHub, Hyperliquid reads), then inbound channels, then speech providers.
6. Browser, SSH and cloud sandboxes last, after a security review.

## Part 3: the organisation (asked 2026-11-15)

| # | Item | Today | Target |
|---|---|---|---|
| 52 | **KPIs per entity and promotion rules you set.** Registry agents carry a `kpis` list (checked non-empty by `agent-validator`) but nothing measures or scores it. No promotion or review system exists; "promote" in the code means idea → initiative only. | Open | You set KPIs and targets per entity (board, directorate head, subsidiary head, kill team member, agent). Scores come from the ledger and task results. A promotion or demotion is a proposal you approve. |
| 53 | **Learning per entity.** Agents read and write lessons (`agent-memory.ts` in the chat orchestrator; swarm learnings per run). The self-improvement job learns at the WHINK/owner level only. | Built, partial | Every entity keeps its own lessons and debriefs from real work, and improves its own procedures. Changes outside low-risk procedural updates go to you as proposals. |
| 54 | **Talk to every person individually in the Founders Office.** Chat exists for 9 personas (WHINK, MAMBA, Marcus, and 6 directorate-style personas). No individual chat for the rest of the 326-agent roster, subsidiary heads or kill team members. | Partial | One conversation per board member, directorate head, subsidiary head, kill team member, WHINK, MAMBA and Marcus. Each speaks as itself, with its own memory. A persona changes voice, never access. |
| 55 | **HR runs training for every entity, all the time.** No training code exists at all. | Open | An HR training cycle: curriculum (skills, ethics, compliance, mandatory), a schedule, completion records and a pass check per entity. For agents, "training" means vetted lessons added to their knowledge plus a scenario test they must pass (agents do not change their model weights). Overdue mandatory training shows on the entity's score and to you. Content for ethics and compliance comes from you and the compliance checker, not invented by an agent. |

### KPI design (agreed 2026-11-15; open items still marked)

**Who is scored:** leaders only (board, directorate heads, subsidiary heads, kill team members), from ledger evidence. All agents also carry two company-wide signals (ideas, revenue contribution), see below.

**Signals from the ledger:** tasks done vs failed or blocked; how often your approval was needed and what you decided; rework; time and cost; your thumbs up or down. Nothing an agent says about itself.

**Company-wide signals for every agent (new, and what is missing):**
1. *Viable ideas.* Today `FounderIdea` has no author, so no idea can be credited to an agent. Needs an author field and a definition of "viable". Proposed: an idea counts when it is promoted to an initiative or you approve it, not when it is merely written. Counting raw ideas would reward volume.
2. *Money the organisation makes.* Today `Contract` has a value, subsidiary and status, but no record of who sourced it or worked on it. No invoices, payments or lead records exist. Needs: who sourced each contract, and a credit rule. Proposed: credit goes to the agents who worked on tasks linked to the contract's project, split by share of tasks, counted only when the contract is ACTIVE or COMPLETED. Revenue is slow and shared, so it is one signal among several, never the only one.

**Promotion:** a proposal, never automatic. It needs approval from the person's line manager **and** that manager's manager (two levels). Reporting lines exist for `staff-directory.ts` entries only; the 326-agent registry has `reports_to_human` and no agent-to-agent chain, so one must be defined. Line managers are mostly AI personas, so their approval is a workflow gate, not human authority. Anything that changes access or permissions (tools, autonomy level) also needs you, because no agent can approve on your behalf (rule 4, Protected actions).

**Subsidiary heads:** reviewed twice a year by WHINK and MAMBA. MAMBA's view is adversarial and stored as a hypothesis (confidence capped at 0.4), so the review shows both opinions side by side for you and the two managers to weigh. A scheduled job opens each review.

**Tamper rule:** scoring code and scores are written by ECHELON only, from ledger rows. A scored agent cannot edit its own KPIs, targets or score.

**Still to decide:** the targets and weights per role (you set them in a screen), the review period for non-subsidiary roles, and the thresholds that trigger a promotion proposal.
| 56 | **Org structure with reporting lines**, in [ORG-STRUCTURE.md](ORG-STRUCTURE.md). **Done 2026-11-15:** the locked roster is loaded into org-kit (16 directorates, 132 departments, board of 8, 5 subsidiary heads, 5-member kill team); the registry holds 338 agents and 169 teams including all of D16 and People Operations & HR Strategy; you approved the 6 placeholder Analyst & Reviewer names; Marcus Vale's line is set (WHINK sets KPIs, you appraise and decide promotion and pay); AI and human follow the same chain. Real-database tests now pass with the new counts. **Still open:** whether the heads are real people (you said it makes no difference to the chain); an agent-to-agent chain inside departments. | Built, not accepted | One org table in the database seeded from the leadership and registry files. One manager per entity, no loops, chain depth checked. |

### How the KPI, promotion and training system works (design)

1. **Org table.** `OrgEntity`: id, kind (human, persona, agent), directorate, department, tier, manager id, status. Seeded from the two org files, never typed by hand. A check rejects loops and entities with no manager.
2. **KPI definitions.** `Kpi`: role or entity, name, a **fixed measure code**, target, weight, period. Each measure code is one hard-coded ledger query, so nobody can define a KPI that reads anything else. Measures: task completion rate, rework rate, approval overrides, cost per task, viable ideas, revenue credit, training completion.
3. **Scoring job.** A worker job writes `KpiScore` rows each period. Only this job writes scores. No entity can edit its own KPIs, targets or scores.
4. **Promotion proposal.** When a score stays above a threshold for N periods, a proposal is created. It is hash-locked to its content and needs both managers' approval. If it changes access or permissions, it also needs you. It does not use the 30-second window, which belongs to Class C actions.
5. **Reviews.** A scheduled job opens the twice-yearly subsidiary head review. WHINK and MAMBA each write their view; MAMBA's is stored as a hypothesis.
6. **HR training.** A curriculum table, a scheduler job, completion records and a pass check per entity. Overdue mandatory training lowers the score and notifies you.
7. **Prerequisites.** Agents must be activated first. Ideas need an author field. Contracts need a "sourced by" field and a link to the work that produced them.

## Part 4: approved rule changes (decided 2026-11-15, see `docs/decisions.md`)

All decided, none built. Items 44 (R4) and 51 (R9) already exist above and now have an approved design.

| # | Rule change | What to build | Status |
|---|---|---|---|
| 57 | R1 Local-only: one audited check | **Done 2026-11-15.** `lib/__tests__/outbound-audit.test.ts` fails if any server file calling `fetch(` neither checks Local-Only mode nor is classified (local service or browser code). The audit found one real gap, GitHub read-only reports, now refused in Local-Only mode. Local-only stays a mode you switch on; it is off by default (R1). | Done |
| 58 | R2 Execution sandbox, R14 command allow-list | **Built 2026-11-15, not connected:** `lib/exec-policy.ts` (command class B or C from an owner allow-list, hardened `docker run` arguments, plain-language explain), 6 tests. **Still to do:** the command and browser tools must call it; the allow-list screen. No tool runs commands through it yet. | Built, not accepted |
| 59 | R3 Sender pairing | **Built 2026-11-15, not connected:** `lib/pairing.ts`, table `channel_pairings` (migration `20261115010000`), one-time code hashed, 1 hour expiry, 5 pending per channel, revoke; 3 real-database tests pass. **Still to do:** every inbound channel adapter must call `requestPairing` (none exist yet), and an owner screen to approve a code. | Built, not accepted |
| 60 | R5 Learned delegations | Offer after 5 identical approvals; 30 day expiry, daily cap, revocable; Class C excluded. A delegation can only tighten the action class, never loosen it (as in OpenClaw approvals) | Open |
| 61 | R7 Batch approval | One card, N hash-locked request ids | Open |
| 62 | R8 Template plus schedule approval | 30 day cap, non-protected public content, edit cancels | Open |
| 63 | R11 Licence rule | Amend non-negotiable 7 wording; compliance-checker checks each MPL or LGPL dependency | Open |
| 64 | R12 Assurance gate for docs, data and test changes | Automated gate; amend non-negotiable 9 wording | Open |
| 65 | R13 Mission activation | Wake agents per mission, return to dormant after | Open |
| 66 | R15 Model-inference envelope | **Built 2026-11-15, not yet used in a real run:** table `spend_envelopes`, approval kind `spend_envelope`, daily and monthly CAD caps plus rate editable in Settings ("Model spending limits"), enforced in admission; `CLAUDE.md` rule 10 amended. Tests: 5 unit, 2 real-database. **Still to do:** set the real CAD per USD rate (placeholder 1.37), switch it on and approve once, then watch one real paid call stop at the cap. | Built, not accepted |

| 67 | Wire pairing into every inbound channel adapter (WhatsApp, Telegram, Discord, Slack, Teams, Google Chat, IMAP) | Each adapter calls `requestPairing` before replying; test per adapter. Comes with each Part 2 messaging row. | Open |
| 68 | Wire `exec-policy` into any command or browser tool | Class from `classifyCommand`, run under `sandboxDockerArgs`; no tool may spawn a command another way (add a call-site audit test like item 57). | Open |
| 69 | Owner screens: approve a pairing code, edit the command allow-list, see the sandbox explanation | One settings panel. | Open |
| 70 | Switch-on gate for the loosened rules | R4, R5, R7, R8, R9 stay off by a flag until items 58, 59, 67 and 68 are connected, so the order of work is enforced in code, not only written. | Open |

**Settled:** R6 dropped (30 s stays); R10 option C (Class B on allow-listed domains, Class C on login, payment and settings pages); R14 option B now, option C after item 58.
**R15 figures set:** CA$1 a day, CA$20 a month.
