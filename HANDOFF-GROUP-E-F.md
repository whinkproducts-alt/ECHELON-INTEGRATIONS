# Groups E and F handoff

Committed locally, not pushed.

## Decision

Same as Group D: both groups were written from design documents, and the real repo already contains most of what they list. I built only what was missing and what blocked the build, instead of re-creating existing work.

## E (infra / hosts): already built, one real gap fixed

Already in the repo, verified by reading and by the existing tests:
- Heartbeat route and sender (`scripts/host-heartbeat.mjs`, rejects plain http to non-loopback, never prints the token).
- Thresholds 30 / 75 / 120 s, derived from the last heartbeat. A returning host needs no re-enable and a provider disabled by hand stays disabled (`lib/capability/heartbeat.ts`, `capability-heartbeat*.test.ts`).
- Mac and Windows installers in `packaging/` (unsigned candidates).

Gap found: the backlog's Mac-plus-Windows plan has Ollama on a Windows laptop reached over the LAN, but the app accepts only exact loopback model endpoints (`lib/local-only.ts`), so every local analysis would fail closed. Added `docs/HARDWARE_SETUP.md` with the supported route, an SSH tunnel that keeps the endpoint on loopback and avoids opening Ollama to the LAN. It is not tested on Windows. Whether a tunnel satisfies your "local" intent is a judgement call recorded in the doc.

Not built: public Cloudflare tunnel (exposes the login surface; `SETUP.md` section 6 gates Mac-off operation), backup automation (restore test is an open launch item).

## F (UI): the screens exist; the build was broken, now fixed

Already in the repo: `three`, framer-motion, holo orb/fps/LOD components, executive shell, holo, corporate, office and Marcus screens, avatar, neural link. Not built: the 5-mode transition system and React Three Fiber port from the unification plan. It would add dependencies and a large rewrite of screens that already exist, for a design you have not signed off.

The real F problem was that `main` could not build. Fixed (12 type errors to 0, lint errors to 0):
- `marcus/new/page.tsx` imported `../_components/...`; the file is two levels up.
- `founder-office.tsx` (a client component) imported five server-only database modules it never used. Removed. It also called `setLoading(true)` on every 30 s poll, flashing the loading view; removed, and the fetch-on-mount line uses the repo's own `eslint-disable-line react-hooks/set-state-in-effect` precedent.
- `Idea.body` is nullable in the database; the type now says so.
- `lib/notifications/deliver.ts` imported `deliverEmail`, which is not exported. Email is now reported `skipped` instead of sent. Reason: mailing ledger data outside the account is a protected disclosure needing owner approval by request id; exporting a sender would have opened that path. The in-app notice still works.
- Two test files had type-only errors (`spend-cap-25`, `monthly-budget-report`).

## Verified

- `next build`: compiled, typechecked, 14 static pages, all Marcus API routes and executive screens listed.
- `tsc --noEmit`: 0 errors. Whole-repo `eslint`: 0 errors (2 warnings already in `model-router.ts`).
- Unit: 2442 passed, 0 failed, 128 skipped (database-gated suites, which passed separately earlier).

## Not verified

- The executive screens were not looked at in a browser. The dev-preview harness does not include them and rendering needs a signed-in session plus a database.
- Nothing was run on a Windows machine.
