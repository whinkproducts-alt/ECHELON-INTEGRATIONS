# Pending upgrade consolidation (2026-11-12)

This local branch starts from ECHELON-INTEGRATIONS PR #12 (governed media, speech, navigation and Mac sandbox). It brings overlapping open dependency and CI PRs from ECHELON-CORP into the ECHELON-INTEGRATIONS test branch. No change has been pushed or merged into either repository by this consolidation.

## Included in this branch

- ECHELON-INTEGRATIONS PRs #1–#8 and #10: OpenClaw Node 26.13.0 image, GitHub action upgrades, the 74-update dependency group, tailwind-merge 3 and Jotai 3.
- ECHELON-CORP PRs #33–#36 and #38–#39: the shared OpenClaw/CodeQL/dependency changes, Framer Motion 14.9.1, and react-resizable-panels 4.18.0. The newer ECHELON-INTEGRATIONS versions win the four shared-version differences (AWS S3 client and presigner, React Query and Zustand).
- The resizable panel wrapper now uses the v4 `Group` and `Separator` exports and orientation styling.
- The temporary postcss 8.5.31 override was removed so the proposed 8.5.32 update can resolve.

## Held from the combined code

- ECHELON-INTEGRATIONS #9 and #11, plus ECHELON-CORP #37: Prisma CLI and Client 7.10.1. They must migrate together. This environment returns HTTP 403 for the official Prisma schema-engine download, preventing code generation. Prisma 7 also requires schema/config and runtime adapter migration; a version-only merge is not ready.
- ECHELON-CORP #40: TypeScript 7.0.2. The current `@typescript-eslint` packages declare TypeScript `<6.1` support. Applying the PR produced type errors, including Buffer incompatibilities. Upgrade the lint toolchain and resolve types before including it.

These PRs remain open at their original repositories. Their requested versions were tested in a temporary manifest and then removed from this candidate branch when they did not meet the build gate.

## Verification and next gate

- `pnpm install --frozen-lockfile` and lockfile supply-chain policy passed before the final postcss override cleanup; the lockfile was regenerated afterward.
- ESLint passed with four warnings and no errors.
- Vitest: 176 files and 2,409 tests passed; five integration suites could not initialize because Prisma Client generation was blocked by the engine download.
- A targeted speech policy test passed (five tests).
- `pnpm audit --prod --audit-level high` passed; it reported one low-severity advisory.
- TypeScript and production build remain unverified because Prisma Client could not be generated. The OpenClaw Node 26 image build failed when this workspace ran out of disk space; the temporary pnpm cache was removed afterward.
- `git diff --check` passed.

Before pushing this branch, run frozen install, Prisma generate, typecheck, full tests, production build, OpenClaw image build, and the Mac sandbox acceptance workflow in an environment that can fetch official Prisma engines and has sufficient disk space. Then review all updated dependencies and action runtime requirements. Do not promote to ECHELON-CORP until the Integrations sandbox passes acceptance.
