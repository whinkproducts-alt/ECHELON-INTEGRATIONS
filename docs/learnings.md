# What we have learnt building W.H.I.N.K. Ultimate

Long-term project memory. Read this with `CLAUDE.md`, `docs/decisions.md` and the latest file in `docs/daily-syncs/` at the start of every session. Facts here were stated by Victor, read from his Group website on 2026-10-25, or verified in the code. Anything uncertain is marked "unverified". Last updated 2026-10-26 (second batch added in section 10).

## 1. Victor and how he wants to work

- Victor Igboekwe is the founder and final approver. He is a hands-on owner who sends short directives and expects the team to act: "do whatever you think is best" means full authority to decide, not to skip checks.
- His standing wishes: all agents autonomous and self-improving, agent swarms for accuracy and speed, no double work, maximum accuracy, and never hallucinate. When a fact is missing, ask for it or mark it "pending"; never invent it.
- The UI target is "stunning": a Jarvis-class interface that would impress a tech billionaire in 2088. Holo glass, depth, light, purposeful motion. The Holo, Presence and Obsidian screens are key features and are only touched if the change makes them look better.
- He sends images and links in chat. Photos arrive as files under the session scratchpad `images/` folder and must be copied into the repo by hand. The built-in WebFetch could not resolve his Render sites; `curl` through the session proxy worked once the network policy allowed it.
- Strict rule (2026-10-26): anything to do with money transfers or sharing proprietary secrets or information needs his approval. See `CLAUDE.md` "Protected actions".
- Product naming: the repo is called KAMSI-PRIME, but in the build and the website the product is "Whink Ultimate". W.H.I.N.K. = World-Aware Human-Integrated Neural Kernel, always written with "Ultimate". World-Aware: understands projects, people, files, communications and wider context. Human-Integrated: built around preferences, authority and memory. Neural: the intelligence and reasoning layer routing across multiple AI models. Kernel: the core layer coordinating memory, models, tools, permissions, automation and execution.

## 2. The organisation

- The WHINK Group is a group of companies (Calgary). WHINK Apps is a subsidiary of the Group that builds innovative apps. Whink Ultimate is the app built by WHINK Apps.
- Five subsidiaries (from the Group website): Whink Consult (IT services, implementation, delivery), Whink Real Estate (flipping, development, commercial rentals), Whink Trades & Investments (trading arm; no longer accepting investors; trading bot planned), Whink Apps (application development, AI, robotics, technology), Whink Frontliners (construction and procurement, based in Nigeria).
- Executive directors as published on the site: Consult, Victor Igboekwe; Apps, Anthony Igboekwe; Trades & Investments, Juliet Igboekwe; Frontliners, Dr Tinaye Lydia Muzenyi; Real Estate, Whitney Brown (she is not on the board list).
- Board (from the site's leadership data): Victor Igboekwe, Founder & Executive Director, Whink Consult; Anthony Igboekwe; Juliet Igboekwe; Dr Tinaye Lydia Muzenyi, Executive Director & Head of People Operations; Genevieve Igboekwe, Chief Legal Counsel (Victor calls her Barrister Genevieve); Marcus Vale, Chief Executive Assistant, Office of the Founder. WHINK (Chief of Staff / Managing Director) and MAMBA (Chief Executive Operating Officer / Consigliere) are AI board members.
- Staff email standard: `firstname.lastname@whinkgroup.com`. Board emails other than Victor's and Marcus's were generated from this rule; the mailboxes are unverified.
- Innovation & Opportunity Directorate (AI personas with human names, report to Victor): Amara Okafor, Mateo Restrepo, Priya Raghunathan, Soren O'Connell, Mei-Ling Tan. The 326-agent, 15-directorate roster lives in `packages/org-kit` and every agent is dormant.
- Websites (given by Victor): Group https://whink-group.onrender.com, Pro Assist https://wpma.onrender.com, Whink Predict https://whinkpredict.onrender.com. WHINK Apps and Whink Ultimate URLs are not supplied. The Group site is a single-page app with its data in `leadership.js`, `app.js` and `upgrade.js`.

## 3. Brand and assets

- Tokens: base #070B12, surface #0E1520, accent #38B6FF, deep #0B4E7A, MAMBA blood #C41E1E, ember #FF4A1C, amber #F5A623 (pending approvals and limits only), denial #E5484D (security events only). Fonts: Jost, IBM Plex Sans, IBM Plex Mono. Google Fonts are blocked in the container, so screenshots show fallback fonts.
- Logos live in `apps/web/public/brand/` (Group, Apps v1 and v2, Ultimate emerald and violet, Pro Assist) and `public/brand/subsidiaries/` (consult, real-estate, trades, apps, frontliners). Board photos in `public/board/`. Photos arrive mode 600 and must be `chmod 644`.
- Avatars: the animated WHINK and MAMBA avatars use `public/avatar/whink-portrait.webp` and `mamba-portrait.webp`. Their lip-sync mouth coordinates are hard-coded for those files, so swapping the image misaligns the mouth. Victor approved those as they are. The white-background WHINK and MAMBA portraits (`public/board/whink.webp`, `mamba.webp`) are for the Board Room only.

## 4. What exists in the app (as of 2026-10-26)

- Design system: `components/ui/holo/*` (HoloPanel, HoloHeading, HoloStat, HoloMeter, HoloBadge, HoloButton, HoloTabs, HoloGrid, HoloEmpty, HoloOrbBackdrop, HoloModal). CSS only, because framer-motion's layout feature breaks the build with the installed motion-dom.
- Shell: `components/shell/*`, navigation in `components/shell/nav-config.ts` (one entry plus one page adds a screen), Ctrl/Cmd+K command palette, boot sequence, install prompt, PWA manifest (`app/manifest.ts`) and icons.
- Screens: Command Center, Holo, Presence, Obsidian, News, Today, Board Room, Directory, Workforce, Companies, Subsidiaries (hub, per-subsidiary page, full project report), Connectors & Plugins, Usage & Offline, Security Center, Contacts & Calls, The Kernel.
- APIs added: board, board meetings and minutes, connectors, usage and budget, contacts (vCard import, message, call), security status, subsidiaries, project cards and report.
- Project flow: each project has an optional `subsidiary`. The Command Center shows a brief status and links to `/dashboard/subsidiaries/<id>/projects/<projectId>`, the full report. Unassigned projects link to `/dashboard/projects/<id>`. Owners can change a project; members can read it. There is no contract object yet.
- Security: headers and CSP in `proxy.ts` (the Next 16 name for middleware), rate limits, capped request bodies, owner-only board roster and operator credential status, secret scan script, GitHub workflow, Dependabot, CODEOWNERS.
- Stubs: sending SMS, WhatsApp, Telegram, email and phone calls returns "not configured" until credentials exist. Gmail, Google Calendar and Google Drive have no adapter. Google Contacts sync is not built; vCard import is the only route.

## 5. Running it

- From `apps/web`: `pnpm dev` (binds 127.0.0.1), `pnpm build`, `pnpm lint`, `pnpm test`, `npx prisma migrate dev`, `pnpm board:import <folder>` (dry run by default), `pnpm security:scan`, `pnpm memory:reembed`.
- Two migrations are hand-written and have never run against Postgres: `20261025050000_board_connectors_usage_contacts` and `20261026000000_project_subsidiary`. Run `npx prisma migrate dev` first.
- Set `WHINK_OWNER_EMAILS` to Victor's sign-in email or the Board Room shows an owner-only message. Other new env vars: `TRUSTED_PROXY_HOPS`, `WHINK_OFFLINE_FALLBACK`, `WHINK_LOCAL_MODEL`, `WHINK_MONTHLY_TOKEN_BUDGET`, `WHINK_BUDGET_SOFT_PCT`, `WHINK_BUDGET_HARD_PCT`, `WHINK_MODEL_PRICES`, plus Twilio, Telegram and SMTP credentials. Never commit values.
- No Postgres runs in the cloud container, so nothing has been exercised against a real database or signed-in session.

## 6. Technical lessons

- This Next.js (16.3.x) has breaking changes: read `node_modules/next/dist/docs/` before routing code. `middleware.ts` is now `proxy.ts`.
- Next allows one build at a time. Do not run `pnpm build` while another agent builds or a dev server shares `.next`.
- `typecheck` has known errors that predate this work and do not stop the build: memory routes, `tool-registry.ts` initiator types, `auto-memory` tests, orchestrator `blendedItems`. New code must add none.
- Persona is stored in `PersonaState`, not `userPreference`. An earlier guard read the wrong table and would have crashed at runtime; types caught it, tests did not.
- Source-rule tests are strict: `lib/__tests__/holo-rendering.test.ts` fails on a raw hex colour or the words WHINK and MAMBA anywhere in the listed component files, even in a comment. `gateway-acceptance.test.ts` fails if non-test source contains a literal `openclaw__` tool name.
- A dev-only preview harness (`/dev-preview/<screen>`) renders screens with fake data so they can be screenshotted without a database. It returns 404 unless `NODE_ENV` is exactly `development`, and the proxy only allows it in development. Screenshots use Playwright (preinstalled). Hide the Next dev overlay and set a session-storage key to skip the boot sequence.
- Preview mock fetch was once restored by React strict-mode cleanup, so screens hit the real API and got redirects; fixtures must match real response shapes.
- Rate limiting cannot see the socket address inside the Next proxy, so `X-Forwarded-For` is trusted only when `TRUSTED_PROXY_HOPS` is set; otherwise per-route and per-account buckets apply.
- Progress is derived from status strings the schema does not constrain: tasks done at `DONE`, risks closed at `CLOSED`, `MITIGATED` or `RESOLVED`. If real data uses other values the counts are wrong.

## 7. Process lessons

- Builders never grade their own work. Every batch got an independent security review. The reviews found real issues each time (spoofable rate-limit key, removable budget cap, offline fallback that could reach a cloud URL, operator data visible to every signup, project writes outside the permission engine). Always run one.
- Agent reports are claims, not evidence. Screenshots exposed a broken preview harness and empty states that the agents had called done. Rendering the UI is part of done.
- Commit checkpoints often; the container is ephemeral. Commit only finished files while agents are still editing, and never commit half-built work to the branch.
- When editing a test file, apply a narrow change and diff the test names afterwards. One edit once deleted five unrelated tests.
- The stop hook demands a clean tree. Hold in-progress agent files rather than committing a broken state, then commit when gates pass.
- Do not invent facts about people: seats, surnames, bios, emails and URLs come from Victor or his site, or stay "pending".

## 8. Open items

- Contracts: Victor must say what a contract holds (counterparty, value, dates, status, relation to projects) before it is modelled and assigned to a subsidiary.
- Supply URLs for WHINK Apps and Whink Ultimate; logos for Whink Predict.
- Confirm the generated board emails exist; supply bios and committees.
- Set GitHub protections only he can set: branch protection with required reviews, secret-scanning push protection, 2FA, signed commits.
- Add provider credentials for sending, run the migrations, and run the Phase 2 checklist on his Mac. A phase is not done until it passes for him.
- Not built: editing product websites from the app, pushing news-driven updates to the company website, Google Contacts sync, video-room link for Quick Meeting with Marcus Vale.
- Phase 3 (Recall) is planned and untouched.

## 9. Protected actions: how it works and what we learnt (2026-10-26)

- Rule: money movement and sharing proprietary information always need Victor's approval (`CLAUDE.md` non-negotiable 10). Code: `lib/protected-actions.ts` classifies; `checkPermission` in `lib/permission-engine.ts` asks it first and forces Class C. Delegation, autonomy level, persona, allow-lists and plugin manifests cannot lower it, and an attempt to ask for a lower class is refused and ledgered as a security event.
- Classification is deterministic: an explicit registry plus keyword rules for unknown tools. Action words win over read words, names are NFKC-normalised, and non-ASCII tool names are treated as protected. Plain reads and local tools (memory, tasks, notes, documents, calendar read) are not protected.
- `web_fetch` and `web_search` are judged per call. A fetch is protected when the turn is tainted by external content (including recalled documents), or the URL has a query, fragment, credentials or a non-default port. A search is protected on a secret pattern or a query over 300 characters. Known gap: data encoded in a URL path is not caught.
- Review lessons: the first version put `web_fetch` on the safe list, which let a planted document exfiltrate data on the first call of a turn. A tainted turn must be passed into the tool loop from the start. Any new tool that can send data out must be added to the registry or named so the keywords catch it, and gets a test.
- Approvals: the card shows "Protected: money" or "Protected: proprietary information". Voice approval needs a server-derived confirmation code (`lib/approval-code.ts`, from `APPROVAL_CODE_SECRET` or `AUTH_SECRET`, 16+ characters); without a secret the voice control is hidden and the Approve button is used. Phrases such as "approve all" approve nothing.
- The automated SMS briefing is blocked by this rule (no human present). Victor has not decided whether a message to his own number counts as inside his account.

## 10. Second batch (2026-10-26): quality debt, durable limits, auth, skills, 24/7 organisation, swarm, operations

What Victor asked for and what now exists (backend; the screens for most of it are the next wave):
- Remember me, passkeys and Touch ID. Not-remembered sessions last 12 hours, remembered ones 30 days, enforced by an absolute `authAt` stamp (Auth.js re-signs the JWT on every read, so library expiry is sliding and cannot enforce this). Passkeys use @simplewebauthn (MIT) with user verification required, so Touch ID works as a platform authenticator. Needs `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN`; HTTPS or localhost only. Login flow: verify assertion, mint a one-time 60 second ticket, then `signIn('passkey', { ticket })`. Tokens issued before this change fall back to `iat`, so one forced sign-in is expected.
- Skill upload pipeline (`/api/skills`): deterministic scan, then the security agent (org-kit "Cybersecurity & Resilience"), then a committee of 3 directors; accept needs 2 of 3 approvals and mean score 3.5 or more. Accepted skills become semantic memory labelled "uploaded skill (untrusted reference)", confidence capped 0.6, and can never register tools or touch permissions. A model failure or malformed reply is never a pass. No model configured means WAITING_MODEL. Needs `SKILL_PIPELINE_MODEL` or `DEFAULT_MODEL`. YAML gets a shape check only (no parser dependency).
- 24/7 organisation: `config/standing-roster.json` lists 28 always-on agents (5 innovation committee, 6 news desks, 5 subsidiary monitors, 3 security, 2 memory curation, 3 executive office, 2 operations, 1 finance, 1 legal) chosen from the real org-kit. They are woken on schedules by `pnpm worker` (`scripts/worker.ts`), not constantly running, and cost model tokens; the budget guard skips non-critical loops at the soft limit and everything at the hard limit. Jobs: news digest (30 min), opportunity scan (hourly) and weekly brief, project monitor, memory curation, security watch, skills sweeper, swarm resume. Output goes to memory (INFERRED, confidence capped) and the Recommendation table. `WORKER_ENABLED` defaults to false.
- Swarm (`/api/swarm`): a plan of at least 50 distinct real agents (1 lead, 6 integrators, 3 red-team, 10 reviewers, 30 workers at 50; 100 scales to 1/12/6/20/61). Non-overlap is enforced by exclusive lane claims (unique per run and lane in the database), dependency order, per-run token cap and a concurrency cap. Agents have no tools; tool requests in their output are dropped and ledgered. Only learnings approved by every covering reviewer with confidence 0.6 or more reach central memory. A start click shows the estimate (about 55 calls, up to 150, roughly 240k tokens at 50 agents) and refuses past the hard budget limit. Governance still says teams of 5 with human approval; "swarm" from Victor pre-approves size only, not budget.
- Change Requests (`/api/change-requests`): refine, then a protected approval (source details leave the account), then a GitHub issue asking a build agent for a pull request; falls back to a markdown export. Needs `CHANGE_REQUEST_GITHUB_REPO`, `CHANGE_REQUEST_GITHUB_TOKEN`, optional `CHANGE_REQUEST_BUILD_MENTION`, `CHANGE_REQUEST_MODEL`. Claude Code only acts if the Claude GitHub App is installed on the repo, which cannot be done from code.
- Contracts (`/api/contracts`) and Finance (`/api/finance/summary`, GET only, enforced by a test). Contract fields are assumptions: title, counterparty, subsidiary, project, value, currency, status, start, end, renewal, notes. Contract value is data only; nothing moves money. Spend per subsidiary is not available because usage events are not linked to projects.
- Approvals history, ledger search and system health APIs are read-only and tenant-scoped; secret-looking keys and values are redacted; health probes have 1.5 s timeouts and never call third-party clouds.
- Meeting rooms: `MEETING_PROVIDER_BASE_URL` (for example a self-hosted Jitsi). Unset means no room link and no call to any public service.
- Mail routing: `config/mail-routing.json` sends any address on whinkgroup.com to the owner's inbox with `X-Original-To`; the SMTP sender is still a stub, and real inbound mail for the domain must be forwarded at the mail provider.
- `SIGNUP_ENABLED=false` blocks signup. `WHINK_OWNER_EMAILS` trusts the email string and signup does not verify email ownership, so register the owner first, then close signup.
- Durable rate limiter: counts live in Postgres (`RateLimitBucket`), with an in-memory fallback when the database errors. Fixed windows, and rejected attempts count.
- Type safety: the build used to ignore type errors (`ignoreBuildErrors: true`); it now fails on them, and `pnpm typecheck` exists. Fixing them found a real bug: the memory route selected fields that do not exist (`source`, `steps`).

Lessons from this batch:
- Eight builders editing shared files (schema, permission engine, protected-actions, rate limiter) at once worked, but one builder's write wiped another's edit once. After a parallel batch always check every new capability exists in `CAPABILITY_CLASSES` and `LOCAL_SAFE_REGISTRY`.
- Wiring written in parallel did not match: the skills sweeper imported a module path and argument shape that did not exist, so it would have done nothing forever, and `resumeSwarms()` was only safe at boot because it treated every run without an in-process engine as orphaned. It now skips any run with recent activity (a task started in the last 15 minutes or the run row updated) and takes an optional `userId`. Test the seams between builders, not only each side.
- New worker jobs change counts that tests pin (23 desired jobs: 21 roster plus two system jobs). Update the pinned tests deliberately.
- Account limits are real: two builders died on rate limits (one on the weekly limit, which resets Oct 28 09:00 UTC). Work is saved on disk, so check the files, run the gates yourself, and resume the agent with SendMessage when allowed.
- The strict D9 rule bans browser-automation libraries in app dependencies, so browser tests (Playwright) belong in a separate `e2e/` package, with a decision for Victor to confirm. The e2e package, CI workflow and real-Postgres run were started by a devops builder that stopped on the limit; `.github/workflows/ci.yml`, `e2e/global-setup.ts`, `docs/testing.md` and `scripts/e2e-seed.ts` exist, but the suite is not finished or run.
- Hand-written migrations remain unproven against real Postgres until the CI job or a local database applies them.

Open items added by this batch:
- The screens for: login (remember me, passkey button, device list), Skill Library, Swarm Control, Standing Roster and worker status, Approvals inbox, Contracts, Finance, Ledger explorer, Change Requests, System Health, Meeting room, and the Today recommendations column.
- Finish the devops work: real Postgres in CI, e2e tests, migration verification.
- Victor to decide: the SMS briefing (approve each, treat his verified number as inside his account, or leave blocked), the Playwright e2e interpretation of D9, and the contract fields.
- Victor to do: set `WHINK_OWNER_EMAILS`, set `WEBAUTHN_*`, configure `DEFAULT_MODEL` or `SKILL_PIPELINE_MODEL`, set mail forwarding for whinkgroup.com at the provider, install the Claude GitHub App if he wants issue pickup, provide the WHINK Ultimate URL, run `npx prisma migrate dev`, run `pnpm worker` on the Mac Mini with `WORKER_ENABLED=true`.

## 11. Security review rounds on the second batch (2026-10-26)

- Two independent reviews of the second batch found no critical issues. Round 1 blocked on a high: skill text beyond the 24,000 character model window could be stored although no model had read it. Fix pattern: never store text a reviewer did not see; reject over-limit input at intake and enforce it again in the writer.
- Patterns that recurred and are now rules of thumb for this repo:
  - Any state machine that two runners can touch needs an owner or lease in the WHERE clause of every write, not only a status check (skills pipeline, swarm tasks). Staleness must be measured from a heartbeat, not from when work was queued.
  - Recalled memory must taint the turn by default. Use an allow-list of trusted memory sources, not a block-list of bad ones, because every new feature adds a new source (skill_upload, news, swarm, worker_brief).
  - A global setting that rewrites per-account behaviour (staff mail routing) must be conditional on the account, or it leaks across accounts.
  - Owner-by-email needs normalised emails (trim, lowercase) everywhere and a safe first-account rule, because signup does not verify email ownership. Fresh installs should set `SIGNUP_BOOTSTRAP_TOKEN`.
  - Credential changes (adding or removing a passkey, changing a password) must require fresh re-authentication and bump a session version so stolen sessions die. The app still has no password-change route; the first one must call `bumpSessionVersion()`.
  - Budget checks must count other in-flight runs, or parallel starts bypass the cap.
  - A scanner allow-list must match exact strings, never whole files.
- Migration policy: several migrations were edited in place after being pushed (passkeys, skill submissions, swarm, change requests). That is only safe because no database had applied them. Once Victor runs `prisma migrate` anywhere, pushed migrations are immutable: add a new migration for every change. If a database applied an earlier commit of this branch it must be reset before applying the latest.
- Open after round 2: the e2e suite and real-Postgres CI have never run (builder blocked by the weekly account limit until Oct 28 09:00 UTC); a "sign out everywhere" action does not exist; session-version cache can lag up to 15 seconds across processes.

## 12. SMS and the Group website links (2026-10-26)

- Victor's request: the app must be able to send SMS. Built as real Twilio sending (`lib/comms/delivery.ts`, global fetch, fixed host, E.164, 1 to 1600 characters, 10 second timeout, never a retry because a retry after a timeout could double-send). Needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` (or `TWILIO_MESSAGING_SERVICE_SID`). A Twilio trial account only texts verified numbers. WhatsApp, Telegram, email and phone calls are still stubs.
- Every SMS is still a protected Class C action: an approved `contact_message` really sends once Twilio is configured. The on-demand briefing (`POST /api/briefing/sms`, Today card "Send briefing by SMS") shows the exact text and waits for approval. The automated daily briefing never sends by itself; it leaves a "briefing is ready" recommendation. Whether his own verified number may receive briefings without a tap is an exception to rule 10 that only Victor can grant; he has not granted it.
- Privacy rule found by testing: the ledger must not hold phone numbers or message bodies. `executeApprovedTool` now writes a placeholder summary for `contact_message`, `contact_call` and `sms_briefing_send`, and a test enforces it. Any new tool that carries personal content must do the same.
- Website links from Victor: Group https://whink-group.onrender.com, Apps https://whink-group.onrender.com/#apps, Ultimate https://whink-group.onrender.com/#ultimate, Pro Assist https://wpma.onrender.com, Whink Predict https://whinkpredict.onrender.com. They live in `config/companies.json` and `config/products.json`.
- Mail: staff addresses at whinkgroup.com route to the owner's Gmail inbox for mail the app sends; inbound forwarding for the domain must be set at the domain's mail provider (provider not yet known).

## 13. Hosting plan (decided direction 2026-10-26, nothing built)

- Victor uses the app on a MacBook and also has an old Windows laptop and a 2 TB external drive (backups only, never the live database). He wants to leave Render and needs sites that never sleep. His Render workspace (checked read-only) held: static site `whink-group`; web services `Wpma` (wpma.onrender.com, Pro Assist), `wpma` (duplicate), `whinkpredict` (whinkpredict.onrender.com), `whink-bet` (same repo as whinkpredict), and `whink-voice` (this repo, branch feat/whink-voice). All on Render's free plan, no Render databases. Repos: whinkproducts-alt/{Wpma, whinkpredict, whink-group, KAMSI-PRIME}.
- Products: Whink Group (company site), Whink Predict and Whink Pro Assist (sellable now), Whink Ultimate and WhinkOS (future sellable; WhinkOS is not yet described or located).
- Plan: Group site on Cloudflare Pages (free); Predict and Pro Assist on one small Linux VPS (about 4 GB RAM, Hetzner is cheapest per sources but prices are unverified) with Docker, Caddy (automatic HTTPS), GitHub Actions deploys, nightly backups, uptime alerts; Ultimate and WhinkOS later on a separate private server reached through Tailscale or a Cloudflare Tunnel. Domain whinkgroup.com is being bought by Victor (3 years about 33 USD at a registrar; skip the paid email and web hosting add-ons; use the included email forwarding or Cloudflare Email Routing to forward to the owner Gmail).
- Boundaries: spending money and handling secrets are protected actions. Victor pays and creates accounts, adds scoped API tokens in the environment settings (never in chat), and approves each spend. The cloud session reaches outside services over HTTPS only, so servers are configured with cloud-init and deployed by GitHub Actions, not by SSH from here. Other repos must be attached to the session before they can be changed.

## 14. Capability Gateway, import and CI lessons (2026-11-01)
- The master plan and the imported WHINK code have unrelated histories. Merge them on an integration branch, resolve README and `.gitignore` by hand, and merge the PR with a MERGE COMMIT (not squash) so the imported history survives.
- The gitleaks GitHub Action scans `<first PR commit>^..<last>`. A PR that contains a root commit has no parent, so the range fails and the job scans nothing. Use the gitleaks CLI over the full history instead. Findings in test files are fake keys; an exact-fingerprint `.gitleaksignore` records the reviewed ones. A base64 block in the master plan matched the Square token pattern by chance.
- CodeQL on a PRIVATE repository: the analysis runs but the upload fails with "Code scanning is not enabled" unless GitHub Code Security (paid) is on. This repository's Advanced Security page has no Code scanning switch.
- JSON hides secrets from line-oriented regexes: `{"api_key":"..."}` has a quote between the name and the colon, and quotes inside strings are escaped. A credential gate must walk the structure, scan each value alone, and carry a credential-named ancestor down through objects and arrays.
- A fingerprint-pinned review ("review exactly what the Founder was shown") needs the UI, the API and the e2e spec to send the fingerprint back; changing one without the others fails only in CI.
- Rate limiting an unauthenticated token endpoint: count FAILED attempts only (including unreadable bodies), per client address or one shared bucket, so nobody can starve a real host.
- A tool run in CI that the local sandbox cannot download (gitleaks binary) can still be verified through CI: have the workflow verify the release checksums and read the job log.
- Reviewers and bots find real bugs in code you just fixed. Run the local gates AND the Playwright specs before every push: the first CI failure on this PR was an e2e spec I had not run.
- The security workflow (gitleaks, audit, CodeQL) runs only on pull requests, pushes to `main` and a weekly schedule, not on pushes to `claude/**` branches. A change to it can only be verified by opening a pull request. Its concurrency group cancels an in-progress run when you push again, so a docs push to the same PR restarts CodeQL.
- `upload: never` on `github/codeql-action/analyze` is the way to keep a CodeQL analysis without uploading; SARIF then goes to the `output` directory. Verified on `github/codeql-action` v3.39.1 (PR #10): green run, SARIF artifact uploaded with `actions/upload-artifact`.
- A cloud session's git proxy returned HTTP 403 for pushing tags and for deleting remote branches (pushing and merging branches worked). Delete merged branches from the GitHub UI or from the owner's machine, and record tip SHAs in the notes first; the commits stay reachable from `main`, so a branch can always be rebuilt.
- A `.github/dependabot.yml` inside an imported repository starts working the moment it reaches the default branch and opens a wave of update PRs. Read it before merging an import, and expect major-version bumps that break a licence rule or need app testing.
- Qodo's fixer opens `fix/remediation-*` branches with no PR. They are claims to verify, not patches to merge: one of them removed a safety path (the stuck-approval sweep) and changed no tests.

