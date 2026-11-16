# Lane G2 notes (platform), 2026-11-15

## Item 40: held upgrades and open PRs (tested on throwaway branches, nothing merged)
Baseline fix first: `apps/web/lib/__tests__/marcus-proxy-exemption.test.ts` had a type error (headers union) that made `tsc --noEmit` and therefore `next build` fail on the lane base. Fixed with a cast (one line, lane A area, test file only).

| Item | Result | Recommendation |
|---|---|---|
| PR #14 minor/patch group (next 16.4.6, nodemailer 10.4, framer-motion 14.11, 11 packages) | Applied to this base on a throwaway branch: install ok, `tsc` clean after baseline fix, vitest all pass, `next build` passes (16.4.6, 31 s). Its own CI is green. The PR itself conflicts with the current base (`apps/web/package.json`, lockfile), so Dependabot must rebase or the lead re-applies the bumps. | **Merge** (re-apply on integration branch, then run the full suite). Low risk. |
| PR #11 prisma 6.7.0 to 7.10.1 and PR #9 @prisma/client 7.10.1 | Both CI runs FAIL. Local test of 7.10.1 on a throwaway branch: `prisma generate` fails at schema validation: `directUrl` and `url` no longer allowed in `schema.prisma`; connection URLs must move to a new `prisma.config.ts`. Prisma 7 also needs driver adapters and the new generator; `new PrismaClient` appears in 5 places plus every `@prisma/client` import. They must land together (one PR), never separately. | **Close both** and do Prisma 7 as one planned migration: `prisma.config.ts`, `@prisma/adapter-pg`, generator change, 5 client constructions, then full suite and `pnpm test:real`. Not done on this branch (suite would not pass). |
| TypeScript 7.0.2 | `tsc` reports 47 errors (28 TS2345, 15 TS2322, 4 TS2769), first ones `Buffer` not assignable to `Uint8Array` (stricter typed-array generics in newer @types/node/TS lib). Not a runtime issue but the build fails. | **Hold.** Do after Prisma 7; try a matching `@types/node` bump first, then fix remaining Buffer/Uint8Array sites (documents upload, passkey verify). |
| PR #15 consolidation into `main` | Its own CI is green but it is based on an older commit: merging it into the current lane base gives 12 conflicts (docs, `lib/worker/roster.ts`, `lib/notifications/deliver.ts`, org-kit leadership files). The integration branch already supersedes its code path. | **Do not merge as is.** Treat it as the carrier for the integration to `main` (Victor's separate step); close it if the lead opens a fresh PR from `feat/handsfree-voice-omniroute-composio`. |

## Environment note for timings
Measurements were taken while ten lanes were building: load average above 200 on an M3 with 16 GB. Treat all times as upper bounds; the gesture-latency test (`timestamp out of range`) fails intermittently under that load and passes alone.

## Decisions needed
None blocking. Proposed for `decisions.md` (lead to merge): backups use `pg_dump -Fc` via the Postgres container, restore targets an empty database only; hosting uses the local compose plus a Caddy overlay.
