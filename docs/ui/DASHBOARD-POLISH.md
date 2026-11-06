# Dashboard polish — evidence and acceptance

Base: ECHELON-CORP main, 7ed73d5a36fba3901966338e121522771fe2e3bf. Isolated branch: ui/dashboard-polish. Original Developer checkout clean at inspection; older Documents checkout has unrelated edits and is untouched. User confirmed public identity remains Whink Ultimate. No new imagery or replacement branding authorized.

## Acceptance before implementation

- /dashboard remains authenticated by its server layout. No fixture or login bypass enters production routes.
- Monitor independently reports worker, ledger, and project loading, empty, failed, denied, and stale data. Failure must never become a zero or an empty-success message. A refresh cannot overwrite newer data with an older response.
- Shell and dashboard share confirmed server persona state. Only existing supported direct-chat identities may be selected for chat. A directory profile does not grant backend support or permissions.
- Conversation uses the API's `message` field; non-JSON SSE lines are tolerated, application errors are visible, partial text survives interruptions, and draft/retry language never implies that an uncertain request was not executed.
- Preserve conversation draft/history when switching dashboard views. Prevent duplicate submit and persona changes during an in-flight message.
- Board selection truthfully distinguishes directory profiles from available direct conversations.
- Verify 390, 768, 1440 widths, long text, 200% zoom/reflow, keyboard/focus, dialog focus return, reduced motion, navigation, scroll, selection, API failure and stale states. Inspect actual before/after screenshots.
- Run package typecheck, lint, focused regression tests and build. Independently review implementation. Separate source/fixture/live proof. No paid model call, outbound send, deployment or database mutation for styling.

## Initial source findings

PremiumConversation sent `{content}` while POST reads `body.message`; displayed persona existed only in local state; shell fetched a different state. The premium directory contains eight personas, but only WHINK/MAMBA overlap the switch API allowlist. Ledger/projects failures became `[]`, yielding false empty states. SSE errors were thrown inside the JSON catch and swallowed. Worker statistics showed zero failures before any status arrived.

## Environment/evidence

Terminal cannot resolve github.com or bind local ports (EPERM). GitHub connector confirmed main and public visibility. User started port 3210 from the isolated checkout. /dashboard redirected to /login at baseline, so authenticated baseline and live tests remain pending sign-in. Login screenshots inspected at 1440 and 390 CSS widths; mobile document width matched viewport. Existing brand/avatar/board assets inventoried; no new asset is necessary for transport fixes. The server-generated next-env.d.ts change predates implementation.

## Implemented slice

- Shared confirmed server persona state between authenticated shell and premium dashboard; no new accepted backend identities. Directory selection is separate from direct chat. WHINK/MAMBA are the two overlapping supported identities. Changes do not expand permissions.
- Correct message payload and SSE handling; partial responses survive interruption. Failed messages display unsent/unconfirmed status, and definite pre-submit failures restore the draft. Views retain the mounted conversation. Board switching is blocked while the message is in flight.
- Monitor resource requests fail independently, preserve last known values with visible warnings, and distinguish empty, loading, denied and unavailable results. Heartbeat age advances between polls. No metrics are inserted into production data paths.
- Responsive top bar no longer clips at 390px; the roster uses a bounded table and long project/action strings wrap. Controls have larger hit areas, shared focus rings, and command-palette focus returns to the opener. The HOLO background and typography remain; floor intensity was reduced where it crossed the data rules.
- Board reuses existing approved portraits and PersonaAvatar initials, shows names/emails from the existing staff directory, and truthfully labels unavailable direct conversations. No generated or stock art. No outstanding asset request for this slice.
- Next Image quality allowlist now includes the existing BrandMark's quality 90, following installed Next 16 docs. No artwork changed.
- Existing development-only harness extended at /dev-preview/dashboard. All responses are explicitly synthetic; unknown APIs return 404 rather than passing through. The server's existing NODE_ENV gate is unchanged. No production auth bypass was introduced.

## Verification evidence

### Source and isolated tests

- `npm --prefix apps/web run typecheck`: passed.
- `npm --prefix apps/web run lint -- --ignore-pattern '.build-ui/**'`: passed, 0 errors and 8 pre-existing warnings in unchanged files. The temporary separate build directory must be excluded from lint. An earlier lint run during a concurrent build hit ENOENT in generated chunks; a later completed run is authoritative.
- `npm --prefix apps/web run test -- lib/__tests__/dashboard-client.test.ts lib/__tests__/dashboard-fixtures.test.ts lib/__tests__/conversation-helpers.test.ts lib/__tests__/ledger.test.ts`: 4 files, 31 tests passed.
- Default `npm run build` (Turbopack): failed because its PostCSS worker tried to bind a port and the session returned EPERM. No application compile failure was demonstrated by that result.
- `NEXT_DIST_DIR=.build-ui npm run build -- --webpack`: passed again on final source after callback-cleanup and lint-hook corrections (exit 0; compiled in 15.1 seconds, TypeScript passed).
- Independent read-only assurance reviewed the source in three passes. It identified the draft/delivery-state issue; implementation now marks unsent/unconfirmed results and restores definite unsent drafts. The reviewer confirmed the original delivery-state issue was addressed; its final callback-cleanup robustness note was also handled. Review is source assurance, not proof of live APIs.
- No database migration/reset, paid inference, external message, approval-policy change, remote push, merge, or deployment.

### Rendered fixture verification

The screenshots are fixture evidence, not live worker/account proof. Before-monitor images used the four premium components retrieved from base 7ed73d5, mounted in the shared shell with the same synthetic API responses. Temporary baseline source copies were removed after capture. This is a reproducible source baseline, not a historical production screenshot.

| Workflow | Observed result |
| --- | --- |
| Monitor at 390 / 768 / 1440 CSS px | Inspected screenshots; bounded header and table. At 390, baseline header scrolled 505px and table 536px; after change header is 390px and table 344px inside its padded content area. |
| Conversation | Inspected at all three widths; MAMBA selection reached simulated backend state; simulated SSE rendered as MAMBA. Long unbroken content wrapped, composer remained visible. |
| View switching | Typed draft survived Monitor → Conversation. History stayed mounted. |
| Board | Profiles inspected at all widths. Amara selection remained a directory profile; no conversation support was invented. Existing WHINK/MAMBA portraits reused. |
| Command palette | Input receives focus; Escape returns focus to opening button after the observed failure was corrected. |
| Loading / empty / error / denied / stale | Rendered and inspected. Errors did not become empty-success messages. Refresh failure retained known data with explicit warnings. |
| Reduced motion / reflow | Emulated reduced-motion media confirmed true; 720×500 reflow had document/header width 720. This is not a complete physical browser-zoom test. |
| Runtime | Clean final reload recorded no new Runtime.exceptionThrown events. Earlier development history contained three unhandled-promise console entries during editing/automation; no root cause was independently established. No claim that the entire console history is clean. The repeated Next Image quality warning was addressed in config. |

### Live integration verification — pending

The real `/dashboard` route redirected to `/login`; sign-in then displayed a server configuration error. The isolated checkout lacked runtime configuration. Existing auth/database settings were copied privately into its ignored local env, without exposing values, and the login page loaded again. The user has not completed the subsequent sign-in in this run. Real model calls were intentionally not used as a styling test.

Landing/login were inspected as public surfaces; broader landing/auth/onboarding alignment remains pending rather than being claimed complete. The separate canonical /dashboard/conversation route has its own existing persona controls; its complete integration with shell state has not been verified by this premium-dashboard fixture run.

## Remaining acceptance and next action

1. Complete real sign-in, capture authenticated baseline/current state, and verify real own-account worker/ledger/project reads and persona persistence without paid calls.
2. Finish live navigation, actual browser zoom, offline behavior, mobile keyboard, all dialog focus traps, full contrast/accessibility audit, and relevant DB-backed safety tests. The current tests do not establish accessibility compliance or every integration boundary.
3. Resolve existing persona metadata discrepancies separately: configured reporting lines differ between lib/personas.ts and lib/staff-directory.ts for Amara/Maya. No authority model was silently rewritten.
4. Review all local changes, then request explicit authorization before publishing or deploying. Current branch is local and uncommitted.

Rollback: revert only this branch's listed source changes; retain the original Developer checkout, local credentials and personal database. No data rollback is needed for these UI changes.

## Changed files

- `HANDOFF-NOTES.md`
- `docs/daily-syncs/2026-11-05.md`
- `apps/web/app/dashboard/_components/dashboard-shell.tsx`
- `apps/web/app/dev-preview/_components/fixtures.ts`
- `apps/web/app/dev-preview/_components/fixtures-dashboard.ts`
- `apps/web/app/dev-preview/_components/mock-fetch.tsx`
- `apps/web/app/dev-preview/_components/preview-client.tsx`
- `apps/web/app/globals.css`
- `apps/web/components/premium/ECHELONDashboard.tsx`
- `apps/web/components/premium/DashboardMonitor.tsx`
- `apps/web/components/premium/PremiumConversation.tsx`
- `apps/web/components/premium/PremiumBoard.tsx`
- `apps/web/components/shell/persona-context.tsx`
- `apps/web/components/shell/command-palette.tsx`
- `apps/web/components/shell/top-bar.tsx`
- `apps/web/lib/dashboard-client.ts`
- `apps/web/lib/__tests__/dashboard-client.test.ts`
- `apps/web/lib/__tests__/dashboard-fixtures.test.ts`
- `apps/web/next.config.js`
- `docs/ui/DASHBOARD-POLISH.md`

Next-generated next-env.d.ts remains in the dev-server form present before implementation; it is excluded from the UI patch. No runtime credentials or generated build outputs are included in deliverables.


## Second visual pass — official assets

A second pass now redesigns Monitor, Conversation and Board with stronger hierarchy, official executive portraits and shared brand configuration. Sixteen optimized public derivatives were made from the 27 checksum-verified supplied masters; private leadership assets remain excluded. Shared authentication now presents all eight approved logo variants with reduced-motion and visibility handling. Final evidence and remaining live/asset gates are recorded in `outputs/ECHELON_UI_Review_V2.md` in the task workspace. Source-only independent assurance found no concrete blocker. Final focused tests: 33 passed; lint: zero errors and eight pre-existing warnings; production webpack build passes. Fixture responsiveness was checked at 390/768/1440 and compact 720×500 reflow. This does not complete live authenticated verification or the cinematic daily arrival sequence.
