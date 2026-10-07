# W.H.I.N.K. Ultimate: Project Handoff

Read this first in any new chat or build session. CLAUDE.md holds the rules. This file holds the current state.

Last updated 6 October 2026. Checked against the repo on Victor's Mac that day: 63 commits, last commit 3 October 2026. "Built" in this file means committed. The app and the tests were not run for this update.

## Where the build stands

| Phase | Status |
|---|---|
| 1. Own it | **Complete.** Victor ticked the checklist on 2 October. |
| 2a. Foundation | Merged into `main` on 3 October. |
| 2b. Approvals | Merged into `main` on 3 October. |
| 2c. Gateway | Merged into `main` on 3 October. |
| 2d. Social | Built on branch `phase-2d-social`, 11 commits ahead of `main`. **Not merged.** |
| 2e. Assurance | Not started. |
| Victor's Phase 2 checklist | 0 of 9 items ticked. |
| 3. Recall | First pass committed on 2 October. No acceptance criteria or checklist yet. |
| 4. Voice | First pass committed on 2 and 3 October. No acceptance criteria or checklist yet. |
| 5. Face | First pass committed on 2 October. No acceptance criteria or checklist yet. |
| 6. Product | First pass committed on 2 October. No acceptance criteria or checklist yet. |

A phase is not done until it passes Victor's checklist on his Mac. By that rule only Phase 1 is done.

## Next steps, in order

1. Commit the four untracked 2d test files in `apps/web/lib/__tests__/` (`social-d3-sse`, `social-d6-write-tools`, `social-d9-deps`, `social-d11-disconnect`).
2. Run the full suite and the build from `apps/web`: `pnpm exec vitest run` and `pnpm exec next build`.
3. Merge `phase-2d-social` into `main`.
4. Run 2e Assurance (items E1 to E7 in CLAUDE.md).
5. Victor runs the nine item Phase 2 checklist in CLAUDE.md.
6. Write acceptance criteria and a checklist for Phases 3 to 6, then verify each one. The code exists. The proof does not.

## What we are building

W.H.I.N.K. (World-Aware Human-Integrated Neural Kernel) Ultimate is an AI personal CEO, built by WHINK Apps, the software studio of The WHINK Group, Calgary. Owner and final approver: Victor Igboekwe. Tagline: "WHINK, intelligence that understands your world." It runs Victor's own work first. Later it is sold to others as a white labelled product.

Two minds share one memory and one permission system:
- **WHINK**: primary mind. Chief of staff voice: direct, brief, pushes back, never flatters.
- **MAMBA**: adversarial strategist, **Obsidian mode only**. Lawful "hardest adversary" red teaming of an opponent's moves. Never illegal help. White and Grey modes are now removed in the schema, the data and the interface.

A persona is never a permission. Switching minds changes voice, never access.

## The repo

Location: `~/Developer/whink-ultimate` on Victor's Mac. It moved there from `~/Downloads/whink-ultimate`. The old Downloads folder now holds only four interface images and a stale worktree. Do not build there.

Start a session with:
```
cd ~/Developer/whink-ultimate
claude
```

Remote: a private GitHub repo named `whink-ultimate` under the `whinkproducts-alt` account. If `git remote -v` prints nothing, the first push has not been run yet and the Mac holds the only copy.

Package manager: pnpm workspace. Do not use npm or yarn. CLAUDE.md still shows yarn commands. The README is correct.

Layout:
```
apps/web/            Next.js 16 core. Prisma, Postgres, Tailwind, shadcn. 19 migrations. 60 test files.
packages/org-kit/    @whink/org-kit. 326 agents, 570 skills, 163 teams, 15 directorates.
services/openclaw/   WHINK's own MCP gateway. 5 test files.
services/voice/      How to run local speech services.
services/anythingllm/  Compose file for document recall.
docker/postgres/     init.sql. Creates the pgvector extension.
docker-compose.yml   Postgres with pgvector, Whisper, Kokoro. Localhost only.
docs/                HANDOFF.md, decisions.md, THIRD_PARTY_NOTICES.md, db-exports/.
assets/              Avatars, mouth shapes, badges, brand drafts, avatar demo.
.claude/agents/      13 agent files. See Build team.
CLAUDE.md            Rules, team, workflow, Phase 2 acceptance criteria, Victor's checklist.
```

Branches:
- `main`: Phase 1, Phase 2a, 2b and 2c, plus the first pass of Phases 3 to 6.
- `phase-2d-social`: the working branch. Everything on `main` plus 2d Social.
- `phase-2-hands`: already merged into `main`.
- `worktree-frolicking-hugging-snail` and `worktree-mamba-reel`: old scratch branches from 1 October.

Untracked folders at the repo root are not part of the product and are not in git: `MARKETING VIDEOS/`, `SVG_Files_Request/`, `WHINK_Group_Portable_AI_Plugin_v2/`, `whink-image-briefs/`, `whink-repo-setup/`, plus two loose files. Move them out of the repo or add them to `.gitignore`.

## What is built

### Phase 1, Own it (complete)
- Abacus removed from the code. Models go through `lib/model-router.ts`.
- Own Postgres with pgvector, started by `docker compose up -d`.
- Org-Kit wired in as a workspace package.
- First migration and a regression baseline of 29 tests on 1 October.
- Switch to local Ollama by changing two values in `.env`. No code change.

### Phase 2a, Foundation (merged)
- `lib/ledger.ts` is the only code that writes to the action ledger.
- Tool calling works through the model router on Anthropic, OpenAI compatible endpoints including Ollama, and Gemini.
- Every tool call goes through `executeTool`, then `checkPermission`.
- A user message flagged by the injection scan is never sent to the model. The block is ledgered and shown in Neural Link.
- MAMBA is Obsidian only at the schema and validation layer. Old White and Grey rows were migrated.
- Project ownership checks are scoped by owner. TypeScript build errors are no longer ignored.

### Phase 2b, Approvals (merged)
- Every pending Class C tool call and every EAR has its own id.
- An approval must name that id. A bare "approved" approves nothing.
- A request expires 30 seconds after it is issued.
- An approved call runs exactly once. The state change is atomic in the database.
- Approved content is hash locked. If the stored parameters change after approval, the call does not run.
- Raising the autonomy level is itself a Class C approval.
- Spoken approvals use a strict classifier, a confirmation code and push to talk. WHINK does not listen while she is speaking.
- CSRF origin checks added. The unused `/api/auth/login` route was deleted.

### Phase 2c, Gateway (merged)
- `services/openclaw` is WHINK's own MCP gateway. Any MCP server plugs in through compose and a mounted config file, with no change to WHINK code.
- Only `lib/openclaw-client.ts` knows the transport.
- Tool names follow `openclaw__<platform>__<action>`.
- WHINK assigns permission classes, not the gateway. Every gateway tool defaults to Class C.
- Gateway results are wrapped as untrusted before the model sees them.
- The gateway is off by default. Leave `OPENCLAW_URL` empty to run without it.
- Container hardening: no root user, read only filesystem, owner only access, token required.

### Phase 2d, Social (built, not merged)
- `social_connections` table, one row per user per platform. Tokens encrypted with AES-256-GCM through `lib/key-encryption.ts`.
- OAuth 2.0 with PKCE and a single use `state`.
- Connectors: X is full. Instagram and TikTok are skeletons. Official APIs only. No scraping.
- Reads are Class A. Post, reply, DM, schedule, delete, follow and unfollow are Class C at every autonomy level.
- Scheduled posts are approved at schedule time and hash locked.
- Connected Apps screen with a consent step and daily limits.
- A migration for the BYOK keys table and the preferred model setting, which the schema lacked.

### Phases 3 to 6, first pass only
- **3 Recall:** pgvector embeddings, hybrid vector and keyword search, automatic memory extraction, a working memory table, task handoff, document workspaces, AnythingLLM compose file.
- **4 Voice:** `/api/voice/stt` and `/api/voice/tts`, a `useVoice` hook, a mic button, spoken approvals. Deepgram for speech to text and OpenAI for text to speech, with local Whisper and Kokoro in compose. The browser Web Speech API is the zero dependency default in development. ADA V2 is not wired in yet. It maps to `STT_URL` and `TTS_URL` when it is running.
- **5 Face:** avatar renderer, Obsidian overlay, Neural Link activity feed.
- **6 Product:** onboarding flow, billing usage, white label tenant config.
- Also committed: a model picker with BYOK key management, a calendar and notes, and a security hardening pass on 2 October.

## How approvals work now

1. A task directive is caught by the Task Gate (`apps/web/lib/task-gate.ts`).
2. The gate builds an Execution Authorization Request (EAR) through `@whink/org-kit`: proposed team, lead agent, capability gaps.
3. The EAR and every Class C tool call are stored with an id, a 30 second expiry and a hash of the exact content.
4. Victor approves by id, on the approval card or by voice.
5. The permission engine evaluates the approval. The action runs once and lands in the ledger.

Permission classes: Class A runs. Class B runs if delegated. Class C always waits for a human.

## Org-Kit

`packages/org-kit` is version 2.0.0 of the WHINK Group Portable AI Organization Kit. It holds 326 agents, 570 skills and 163 teams across 15 directorates. All agents start dormant. It is provider neutral.

Governance rules that never change:
- An agent must be explicitly assigned to a task.
- An EAR always needs approval before anything runs.
- A new permanent agent needs a full reuse scan and human approval.
- Use the smallest competent team.

Open: a 16th directorate, AI Organization and Autonomous Operations, was decided on 3 October. It is not in `organization/whink_group_leadership.json` yet.

## Secrets and environment

- `.env` files are ignored by git everywhere in the repo. Only `.env.example` files are tracked.
- A scan on 6 October checked every commit on every branch. No real key, token or password is in git history. The only matches were fake keys inside three test files.
- The tracked database export in `docs/db-exports/` holds seven test chat rows and no personal data.
- The local Postgres password in `docker-compose.yml` is for development only and is bound to localhost.

Action needed in `apps/web/.env`:
- **Remove `ABACUSAI_API_KEY` and rotate that key.** The code no longer uses Abacus. The secrets in the original source zip were flagged for rotation on 30 September, so treat this key as exposed.
- **Add `ENCRYPTION_KEY`.** Generate it with `openssl rand -hex 32`. It encrypts stored API keys and social tokens.
- Not set yet: `BRAVE_SEARCH_API_KEY`, `DEEPGRAM_API_KEY`, `OPENCLAW_URL`.

## Decisions made

Full log with reasons: `docs/decisions.md`.

- Proactive with limits: she raises urgent things unprompted and respects quiet hours.
- First areas: WHINK GROUP consulting, and career and job search.
- Agent factory: from a goal, WHINK creates departments and specialist agents, runs the project and reports in numbers. Account creation, payments and signing terms stay with Victor.
- Build tool: Claude Code on Victor's Mac against the repo. The Claude app is for planning and design.
- Multi tenant and white label plumbing from day one.
- Only MIT, Apache 2.0, BSD or ISC dependencies. No AGPL. Two dev only exceptions are recorded in `docs/THIRD_PARTY_NOTICES.md`.
- No vendor lock. No provider SDK is imported outside the model router.
- One ledger write path (3 October).
- Approvals by id, 30 second expiry, exactly once (3 October).
- WHINK builds its own MCP gateway behind the existing adapter (3 October).
- Social connectors use official APIs only. Posting is always Class C (3 October).
- Suspicious user input is blocked, ledgered and surfaced (3 October).
- No avatar blinking.
- WHINK accent is brand azure #38B6FF.

## Architecture

| Role | Piece | Licence |
|---|---|---|
| Mind, personas, permissions, ledger, interface | WHINK core, Victor's own Next.js app | owned |
| Org, routing, governance | `@whink/org-kit` | owned |
| Hands: outside tools and social platforms | WHINK's own MCP gateway in `services/openclaw` | owned, MIT SDK |
| Recall: document search with citations | AnythingLLM | MIT |
| Voice: speech in and out | Browser speech in development. Deepgram, Whisper and Kokoro behind env vars. ADA V2 planned. | mixed, see notices |
| Models | Router across Claude, Gemini, OpenAI compatible endpoints and local Ollama | swappable |
| Optional room device | Open Voice OS on a Raspberry Pi | Apache 2.0 |

## Build team

Thirteen agent files in `.claude/agents`.

- Builders: lead-architect, backend-engineer, integrations-engineer, frontend-engineer, devops-engineer.
- Assurance, never write the code they check: security-reviewer, test-engineer, qa-engineer, ai-evaluator, performance-benchmarker.
- Guardians: brand-guardian, compliance-checker.
- Orchestrator: `whink.md`, the build commander that relays Victor's approved decisions to the lead architect.

All 12 specialist files carry the build knowledge from the six phases.

## Avatars

- **WHINK:** photoreal Black woman, natural afro, gold beaded headpiece, round gold glasses, gold Africa shaped earrings, red lips, teal suit, navy W monogram scarf, gold W pin.
- **MAMBA:** photoreal Black man, natural afro, scar across one eye, pale piercing eyes, charcoal suit with red lining, black turtleneck, snake pin.
- Built in `assets/`: six mouth shapes per character, `visemes.json`, an audio driven lip sync demo, chat badges from 32 to 512 px, a draft WHINK cutout.
- Animation is mouth shapes, subtle breathing and interface state. No blinking.

Still needed:
1. MAMBA on a transparent background with no HUD or name text. Automatic removal failed.
2. A cleaner WHINK cutout. The draft clips the right shoulder.
3. Optional: one real rounded mouth per character.

## Brand and design

- Hierarchy: The WHINK Group (parent, contracts and billing) > WHINK Apps (publisher) > W.H.I.N.K. Ultimate (product, the slot that swaps for white label).
- Palette: base #070B12, surface #0E1520, WHINK azure #38B6FF, deep #0B4E7A, MAMBA blood #C41E1E, ember #FF4A1C, amber #F5A623 for pending approvals and limits only, denial #E5484D. WHINK Apps gold #CC944B is marketing only.
- Type: Jost display, IBM Plex Sans body, IBM Plex Mono for numbers and system events.
- No product name, logo or colour is hardcoded in markup. Names come from tenant config. Colours come from design tokens.

## Victor's Mac

MacBook Air M3, 16 GB RAM. Homebrew, git, Node, pnpm, Python, OrbStack, Ollama with llama3.1:8b, ffmpeg, AnythingLLM. OrbStack must be running before Postgres starts. Keep Claude or Gemini as the default model when Ollama is also running, to protect memory headroom.

## Housekeeping

- CLAUDE.md lists yarn commands. The repo uses pnpm.
- The "Known issues in the inherited code" list in CLAUDE.md describes problems that 2a, 2b and 2c have since fixed.
- CLAUDE.md tells sessions to read `docs/daily-syncs/`. That folder does not exist in the repo.
- The nightly sync runs in the cloud and cannot see the repo. From 1 to 5 October it reported "no new build work" while 60 commits landed. Treat this file and `git log` as the source of truth.

## Still open

- Finish Phase 2: merge 2d, run 2e, Victor's checklist.
- Acceptance criteria and checklists for Phases 3 to 6.
- Remove and rotate the Abacus key. Add `ENCRYPTION_KEY`.
- X API read and DM access needs a paid X tier. Meta needs app review. Both need Victor's approval before credentials go in.
- Add the 16th directorate to the leadership JSON.
- Deepen Org-Kit skill coverage from 6 to 8 agents per skill toward 12 or more.
- Avatar HUD colour: cyan #4FF3EE or azure #38B6FF.
- Face size on the home screen: cinematic centre or numbers first.
- Keep gesture control and face unlock from ADA V2, or drop them.
- Smart home control. Watch and widget spec.
- Check the MSP Corp employment agreement, IP and outside work clauses, before selling.
- Register WHINK as a trademark before launch.
- Victor's weekly hours for the build.
