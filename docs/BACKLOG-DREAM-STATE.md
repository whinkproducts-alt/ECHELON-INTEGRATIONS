# ECHELON-INTEGRATIONS: dream-state backlog (2026-11-15)

Built from `docs/pending-tasks.md`, `docs/handoffs/*` and this session's verified runs. Status words mean:
**Done** = built and proven by tests or a real run. **Built, not accepted** = code exists, nobody has used it on the Mac. **Open** = not built, or waiting on a decision or on Victor.

## Completion

Method: every line counts once, unweighted (not effort). Done = 1, Built-not-accepted or built-not-connected = 0.5, Open = 0. Item 43 is merged into item 50. Item 26 is done (Marcus commit e7f92d1, unpushed).

| | Items | Credit |
|---|---|---|
| Done | 18 | 18 |
| Built, not accepted | 7 | 3.5 |
| Built, connection unverified (Part 2) | 13 | 6.5 |
| Open (Part 1: 30; Part 2: 40) | 70 | 0 |
| **Total** | **108** | **28 → 26%** |

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

## Open

| # | Item | Waits on |
|---|---|---|
| **25** | **Warp opening screen before login** (see below) | engineering + **V** (decisions) |
| 26 | ~~Marcus sends `subsidiary` / `target_subsidiaries`~~ Done 2026-11-15 (Marcus e7f92d1, 75 tests pass, not run on real Postgres) | push, then restart Marcus so its database gets the new columns |
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
| 43 | ~~SSH tunnel counts as local?~~ Decided 2026-11-15: own SSH hosts count as local. Merged into item 50. | done in 50 |
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
| 56 | **Org structure with reporting lines**, draft in [ORG-STRUCTURE.md](ORG-STRUCTURE.md). Needs: board list, kill team list, subsidiary head names, whether the 141 named heads are real people, the Marketing data check, an agent-to-agent chain inside departments. | Open | One org table in the database seeded from the leadership and registry files. One manager per entity, no loops, chain depth checked. |

### How the KPI, promotion and training system works (design)

1. **Org table.** `OrgEntity`: id, kind (human, persona, agent), directorate, department, tier, manager id, status. Seeded from the two org files, never typed by hand. A check rejects loops and entities with no manager.
2. **KPI definitions.** `Kpi`: role or entity, name, a **fixed measure code**, target, weight, period. Each measure code is one hard-coded ledger query, so nobody can define a KPI that reads anything else. Measures: task completion rate, rework rate, approval overrides, cost per task, viable ideas, revenue credit, training completion.
3. **Scoring job.** A worker job writes `KpiScore` rows each period. Only this job writes scores. No entity can edit its own KPIs, targets or scores.
4. **Promotion proposal.** When a score stays above a threshold for N periods, a proposal is created. It is hash-locked to its content and needs both managers' approval. If it changes access or permissions, it also needs you. It does not use the 30-second window, which belongs to Class C actions.
5. **Reviews.** A scheduled job opens the twice-yearly subsidiary head review. WHINK and MAMBA each write their view; MAMBA's is stored as a hypothesis.
6. **HR training.** A curriculum table, a scheduler job, completion records and a pass check per entity. Overdue mandatory training lowers the score and notifies you.
7. **Prerequisites.** Agents must be activated first. Ideas need an author field. Contracts need a "sourced by" field and a link to the work that produced them.
