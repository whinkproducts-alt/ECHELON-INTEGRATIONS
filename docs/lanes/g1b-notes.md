# Lane G1b notes (core safety and memory)

## Decisions for the lead to merge into decisions.md
- **Item 42:** Marcus tasks carry no attached documents or memory. The approved hash covers title, goal and deadline only, so intake now rejects attachment-like fields (`attachments`, `documents`, `files`, `memory`, `context`, `knowledge`) with 400 instead of ignoring them. If attachments are ever added they must be untrusted data, size-capped and inside the content hash.
- **Item 32:** Founder-private rows use `scope = founder_private` (semantic) or `privacyClass = FOUNDER_PRIVATE` (episodic), plus a separate `founder_objectives` table. Shared and agent-facing reads exclude them by default (`searchMemory` needs `includePrivate: true`, set only for the owner's own recall and chat context). `writeDebrief` with `sourceUserId` refuses a lesson that quotes (5-word run) the user's private text; the orchestrator debrief passes it. Dedup compares only within the same scope.
- **Item 33:** lockdown engage now aborts running work in the same process (`lib/safety/inflight.ts`, one ledger row `lockdown_inflight_stopped` with counts) and the worker runner polls the persisted state every 2 s and aborts a running job. Browser microphone and camera already stop through `client-lockdown.ts` on the next state poll.
- **Item 65 / R13:** `mission_activations` rows label which dormant agents a mission woke. They grant nothing; the permission engine is not imported. `runSwarm` wakes the agents its tasks use and always returns them to dormant in `finally`.

## Files touched outside the lane
`lib/worker/runner.ts` (lockdown watcher, lane A), `lib/marcus/intake.ts` (one reject line, lane A), `lib/swarm/engine.ts` (wake/return hooks), `lib/context-engine.ts` and `app/api/memory/search/route.ts` (one argument each).

## Item 29: Needs Victor (enrolment needs your device)
Built and tested already: passkey register, login, re-auth, delete, session revoke, password forgot/reset (the recovery route). New: `ownerReadiness()` in `lib/auth/owner-readiness.ts` lists what is still open.
Steps for you:
1. In `.env.local` set `WHINK_OWNER_EMAILS`, `WEBAUTHN_RP_ID` (e.g. `localhost`) and `WEBAUTHN_ORIGIN` (e.g. `http://localhost:3000`). Restart the app.
2. Create the owner account on the sign-up page with the owner email and a password (the password is the recovery route).
3. Sign in, open Settings, Passkeys, Add passkey, approve with Touch ID on your Mac.
4. Add a second passkey (phone or security key) so losing one device does not lock you out.
5. Sign out and sign back in with the passkey; restart the app and confirm it still works.
