# W.H.I.N.K. Ultimate: Project Handoff

Background and history for anyone joining the build, human or agent. CLAUDE.md holds the rules; this file holds the story so far. Last updated 27 September 2026.

## What we are building
W.H.I.N.K. (World-Aware Human-Integrated Neural Kernel) Ultimate is an AI personal CEO, built by WHINK Apps (the software studio of The WHINK Group, Calgary). Owner: Victor Igboekwe. Tagline: "WHINK, intelligence that understands your world." It will run Victor's own work first, then be sold to others as a white labelled product.

Two minds share one memory and one set of permissions:
- **WHINK**: primary mind. Voice: chief of staff, direct, brief, anti sycophantic, pushes back.
- **MAMBA**: adversarial strategist, **Obsidian mode only** (White and Grey modes to be removed from code). Lawful "hardest adversary" red teaming of opponents' moves, never illegal help.

## The repo
- apps/web: the WHINK Next.js core (imported from WHINK_Phase1_Source). The original .env with secrets is on disk and git ignored.
- CLAUDE.md: rules, team, workflow, Phase 1 tasks and Victor's checklist.
- docs/decisions.md: dated decision log.
- .claude/agents: twelve build team agents.
- assets/: avatars, mouth shapes, badges, brand drafts, avatar demo. See assets/README.md.

## Avatars
Masters: WHINK FINAL.png and MAMBA FINAL.png (1086 x 1448) in ~/Downloads/Whink Super Jarvis/WHINK JARVIS and ~/Downloads/SVG_Files_Request/Uploads.
- **WHINK**: photoreal Black woman, natural afro, gold beaded headpiece, round gold glasses, gold Africa shaped earrings, red lips, teal suit, navy W monogram scarf, gold W pin. Cyan HUD #4FF3EE.
- **MAMBA**: photoreal Black man, natural afro, scar across one eye, pale piercing eyes, charcoal suit with red lining, black turtleneck, snake pin. Red HUD #FF3B24 with fire.

Voices: WHINK VOICE.m4a (47 s) and MAMBA Vocal Warm-Up.mp4 (26 s, used as MAMBA's voice). MP3 copies in assets/avatar-demo.

Built 27 Sep 2026 (in assets/):
- Six mouth shapes per character (rest, mbp, aa, ee, oo, fv), derived from existing closed, parted and open frames. visemes.json maps positions.
- Audio driven lip sync demo in assets/avatar-demo. Under 400 KB per character versus 15 MB per state in the old SVGs. The lip sync logic in its index.html is the reference for the production avatar renderer.
- Circular chat badges, 32 to 512 px.
- WHINK transparent cutout (draft: right shoulder clipped, soft hair edges).
- Decision: **no blinking.** Animation is mouth shapes, subtle breathing, and interface state only.

Remaining avatar gaps:
1. MAMBA transparent cutout: automatic removal failed (hair lost against fire). Needs regenerating in the image tool.
2. Names and HUD panels are baked into the art. For white labelling and live data, the product should use the cutout portrait with the HUD drawn by the interface.
3. HUD colour: cyan #4FF3EE versus brand azure #38B6FF. Decision pending.
4. Optional: one real rounded mouth per character to sharpen the OO shape.

## Decisions made
- Proactive with limits: she raises urgent things unprompted, respects quiet hours.
- First areas: WHINK GROUP consulting, and career and job search.
- Agent factory: from a goal (example: "build an Etsy store that profits monthly") WHINK creates departments and specialist agents, runs the project, reports in numbers. Agents produce work; account creation, payments and signing terms stay with Victor.
- Build route: Victor and Claude build phases 1 to 3 together; reassess before voice; hire a specialist only if needed.
- Multi tenant and white label plumbing from day one, even with one user.
- Only MIT, Apache 2.0, BSD or ISC dependencies. No AGPL, no unlicensed code.
- No avatar blinking.

## Architecture (the Super Jarvis stack)
| Role | Piece | Licence |
|---|---|---|
| Mind, personas, permissions, ledger, UI | WHINK core (this repo) | owned |
| Senses: voice, vision, gestures, face unlock | ADA V2 (github.com/nazirlouis/ada_v2) | MIT |
| Hands: email, calendar, web, WhatsApp, Telegram | OpenClaw | MIT |
| Document recall with citations | AnythingLLM | MIT |
| Models | Router across Claude, Gemini, local Ollama | swappable |
| Optional room device | Open Voice OS on a Raspberry Pi | Apache 2.0 |

## Audit of the inherited WHINK source
Next.js 16, Prisma, Postgres, about 30 models. Built on Abacus AI.
Strong: seven layer prompt builder, WHINK and MAMBA personas, permission classes A, B, C with autonomy levels and expiring delegations, action ledger, memory tables (episodic, semantic, procedural, hypothesis capped at 0.4 confidence), knowledge graph, projects, tasks, decisions, risks, evaluation tables.
Broken or missing: runs on Abacus; tool registry never connected to chat; keyword only memory search; no automatic memory writes; working memory lost on restart; regex only injection checks whose result is ignored; live secrets were in the original zip (rotate them).

## Audit of ADA V2
Excellent real time voice with interruption, vision, gestures, face unlock, CAD, printing, smart lights, browser agent.
Problems: Gemini preview model lock in; save_memory writes nothing; unfenced file reads; server without auth and open CORS; simple on or off permissions. Use as voice and vision service only, behind WHINK.

## Build phases
1. Own it: move off Abacus, own Postgres with pgvector, model router, rotate secrets.
2. Hands: tool loop through the permission engine, OpenClaw, action trace, Obsidian only MAMBA.
3. Recall: semantic memory, automatic memory writes, Redis working memory, AnythingLLM with citations.
4. Voice: ADA behind WHINK, spoken approvals, visible mic and camera kill switches.
5. Face: audio driven avatars (demo exists), Obsidian mode, Neural Link agent map.
6. Product: tenant isolation, onboarding, billing, white labelling.

## Brand and design
- Hierarchy: The WHINK Group (parent, contracts and billing) > WHINK Apps (publisher) > W.H.I.N.K. Ultimate (product, swappable slot for white label).
- Palette: base #070B12, surface #0E1520, WHINK azure #38B6FF (or cyan #4FF3EE, pending), deep #0B4E7A, MAMBA blood #C41E1E, ember #FF4A1C, amber #F5A623 (pending approvals and limits only), denial #E5484D. WHINK Apps gold #CC944B is marketing only.
- Type: Jost display, IBM Plex Sans body, IBM Plex Mono for numbers and system events.
- Drafts in assets/brand: app icon and WHINK Apps mark. Wordmark is live text; outline before print or store use.
- Claude Design (in the Claude app, not this repo): "WHINK Design System" and pass 1 screens in "W.H.I.N.K. Ultimate interface mockups".
- Screens planned: Onboarding, Presence, Conversation, Voice, Obsidian, Neural Link, Metrics Deck, Permissions and Ledger, Everywhere mode, Account and Usage, Connections and Data.

## Victor's Mac
MacBook Air M3, 16 GB RAM, macOS 26.3. Xcode tools, Homebrew, git, Node 26, pnpm, Python, uv, conda, OrbStack, Ollama with llama3.1:8b, ffmpeg, portaudio, AnythingLLM, Jan.

## Still open
- Avatar HUD colour: cyan or azure.
- Face size on the home screen: cinematic centre or numbers first.
- Keep gesture control and face unlock from ADA, or drop them.
- Smart home control; watch and widget spec.
- Deepgram as the speech fallback (Victor has a key; ask him for it, never commit it).
- Check MSP Corp employment agreement (IP and outside work clauses) before selling.
- Register WHINK as a trademark before launch.
- Victor's weekly hours for the build.

## Next step
Phase 1: secret rotation, own Postgres, model router. See CLAUDE.md.
