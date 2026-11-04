# ECHELON full personal-use checklist

Updated **2026-11-04**. **Not fully ready for personal use.** This checklist preserves all requested features, not just a desktop icon or a text-only pilot. Mac-on is the agreed first operating milestone; Mac-off remains required for the full system. No calendar estimate or promised completion date.

[Current evidence](ECHELON-AUDIT-HANDOFF-2026-11-04.md) · [R01–R10 register](ECHELON-READINESS-EXECUTION.md) · [Engineering backlog](pending-tasks.md) · [Service inventory](SERVICE-INVENTORY.md).

Current main baseline `99f6d7eb3f58cff9d9aae8f59641137faf755a9c` has passing automatic CI/security (2345 tests passed, 39 skipped, 22 browser tests passed). None of the unchecked personal gates below is closed by that alone. Record results, job/receipt IDs, revision and failures without private payloads.

## A. Engineering before the full personal acceptance run

- [ ] All inference/voice dispatch paths have scoped admission, bounded retries/deadlines and safe accounting for failure/cancellation/uncertain responses. Local EAR reservations are not enough; unknown cost stays unknown.
- [ ] Saved model order reaches actual failover, with Local-Only/data/tool/trial/spend checks and no replay of actions. Resolve default-model inconsistency; keep DeepSeek browser manual and NVIDIA trials unadmitted until entitled.
- [ ] Private-team objectives/results/memory are durable and server-isolated from all unauthorized accounts/personas/ordinary organization.
- [ ] Lockdown is verified during running work across jobs/tools/cloud/mic/camera; local review remains accessible.
- [ ] iMessage has a selected, secure working bridge; two-way phone/audio and required inbound message journeys implemented. Existing real send adapters are retained.
- [ ] Interrupted capability jobs have honest UNKNOWN handling and input/result retention/cleanup policy; no uncertain side-effect retry.
- [ ] HOLO/organization lifecycle and unresolved directorate count are reconciled using canonical identities; no invented agents or fabricated activity.
- [ ] Desktop launcher and safe runtime startup/stop/restart plus backup/restore are implemented and documented.

## B. Configure the actual Mac instance

- [ ] Identify the real checkout/data directory, preserve existing private settings and back up personal DB/encryption material.
- [ ] Verify installed Node/pnpm, Docker/Postgres + pgvector, exact local model and optional local speech services. Do not auto-download/install from a launcher.
- [ ] Reconcile `.env`/`.env.local` loading between web, worker and Prisma privately. Owner, auth, origin/passkey and encryption settings correct; open signup controlled.
- [ ] Inspect migration status and apply checked-in migrations with `migrate deploy`; never reset, db push or seed over personal data.
- [ ] Owner signs in and tests passkey; account data survives app/worker restart.
- [ ] Start worker separately with approved limits and correct DB/model. Verify it actually claims the intended user's jobs.

## C. Prove actual work and controls

- [ ] Create one useful Founder mission, persist it, dispatch through canonical agent/worker and display the actual result and receipt.
- [ ] Approve one exact Class C request by ID/hash in its window; it runs once. Denial, expiry, bare "approved", repeat approval and parameter mutation execute nothing.
- [ ] Verify non-owner/cross-account boundaries and ledger/receipt truthfulness, including errors and unknown outcomes.
- [ ] Confirm existing GitHub App/key/installation securely (creation/download were reported; do not recreate blindly). Restrict to ECHELON and Contents/Checks/Statuses/Actions/Issues/PR read permissions.
- [ ] Run the GitHub report through ECHELON's own provider/grant/worker, not the coding assistant's connector. Pin exact commit; missing/pending/failed/incomplete checks stay truthful. Other repo/write/revocation tests pass.
- [ ] Prove configured model order and real Local-Only behavior, sidecars/embeddings/voice included. Measure representative call/token/cost and quality before/after; estimates labelled, no automatic paid fallback/top-ups.

## D. Accept all personal features

- [ ] Email, SMS, WhatsApp and Telegram: authorized recipient, exact approval where required, real send/receive path and receipt. Missing config/unknown delivery must not show delivered.
- [ ] iMessage: working owner-approved bridge and actual send/receive proof. No substitution with SMS.
- [ ] Phone: authorized actual two-way conversation and hearing/speaking; a scripted outbound call is insufficient.
- [ ] Voice: chosen local/cloud STT/TTS verified on the Mac, privacy/cost admitted, actual microphone/audio and failure/recovery work.
- [ ] Private team: objective persists after reload/restart and never appears to unauthorized account/persona/ordinary recall/briefing/event consumers.
- [ ] Activate lockdown during work; no new dispatch/cloud/capture proceeds after the defined cutoff; already-sent effects documented honestly, local receipts readable.
- [ ] Daily Board Room entrance presentation: real tasks/approvals and unavailable sources, correct local date and once-per-day behavior, replay/skip/mute/refresh, autoplay refusal and restart.
- [ ] WHINK/MAMBA approved portraits, real audio-driven mouth/breathing and optional safe blink/reduced-motion reviewed visually. Synthetic browser mouth cadence labelled; no unverified human-animation claim.
- [ ] Desktop ECHELON.app/icon: double-click opens a ready instance; second click reuses it; restart/login and occupied-port/dependency failures handled; stop is graceful; secrets never in bundle/logs.
- [ ] Backup and restore tested on a separate target, including encryption/decryption viability; retention/cleanup and diagnostic logs useful without private payloads.

## E. Mac-independent acceptance (required after Mac-on milestone)

- [ ] Approve an actual available remote host, data/privacy scope and any cost; no host selected merely by this checklist.
- [ ] Worker/provider liveness, authentication, budget, lockdown and recovery configured there.
- [ ] With Mac powered off, authorized work completes on remote compute and produces a verifiable receipt. A simulated offline host test is not this proof.
- [ ] Offline/stale local hosts refuse requests safely; restart/reconnect and backup restore verified.

## F. Audit closeout

- [ ] Resolve confirmed critical/high findings from independent audits; retain lower findings with explicit impact and acceptance owner.
- [ ] Review retained remediation/dependency work, licenses and active repository security settings; do not blanket merge major upgrades.
- [ ] Complete actual enabled-service/free/trial/paid inventory with verified entitlement, quota, limits, data retention and costs; no package-based billing guesses.
- [ ] Latest daily sync, pending tasks, execution register, decisions/learnings and evidence agree with source. Every unchecked item remains visible.

Wider sale/public launch still needs separate legal/privacy/platform compliance, product/white-label/billing, performance/accessibility and distribution assurance. Full personal use does not authorize external communication, proprietary exports, payments, subscription or deployment without the appropriate Founder approval.
