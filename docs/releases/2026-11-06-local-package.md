# UI consolidation and local installer candidate

All prior UI work in the isolated ui/dashboard-polish checkout is consolidated for main, based on 7ed73d5. Official assets, shared governed persona/conversation state, operational failure handling, microphone cleanup, responsive shell and futuristic styling are retained. See docs/ui for before/after evidence and isolated vs live verification limits.

## Final verification

- npm run typecheck: passed.
- npm run lint -- --ignore-pattern .build-ui/**: passed.
- npm test: 162 files passed, 5 skipped; 2330 tests passed, 112 skipped. Database-backed skips are not live proof.
- NEXT_DIST_DIR=.build-ui npm run build -- --webpack: passed.
- Repository staged secret scan via node --import tsx scripts/scan-secrets.ts: passed. tsx CLI pipe creation is sandbox-blocked; the same scanner runs through Node import. Only the exact disposable build URL and literal generated-shell-variable URL were added to its existing literal allowlist; no real credential exemption.
- bash -n launcher, Python compile, pkgbuild creation, payload inspection: passed. Package is unsigned and unnotarized.
- Separate assurance found no concrete blocker. Follow-up hardening: pin pgvector by digest; retire the bootstrap token file after initial signup.

The complete local stack candidate packages web, worker and isolated Postgres/pgvector startup via Docker. It requires preinstalled, running Docker/Compose and a local model service; first start downloads build dependencies/images, asks for owner email and creates private credentials. No credentials, data, model weights, paid service activation, automatic database reset or seeded account are included. Signing identity is not available. Docker socket access is denied in the coding environment: image build, install, migrations, restart, real worker/model/voice and backup/restore remain unverified. This is not certified as a one-click or production-ready installation. Existing readiness checklist remains open.

## Branch cleanup

13 remote non-main branch tips were preserved in verified remote archive tags before atomic lease-checked branch deletion. A complete pre-cleanup git bundle was also verified locally. No dependency upgrade or unmerged feature branch was blanket-merged. Deleted branch pull requests may close automatically; recover work from the tags below. Automated bots may create new branches later.

- `dependabot/docker/services/openclaw/node-26.13.0-alpine3.24` → `archive/2026-11-06/dependabot/docker/services/openclaw/node-26.13.0-alpine3.24` (`cfbf1e0a087a066fa9c33bdb1e62ca571afafde8`)
- `dependabot/github_actions/actions/checkout-7.0.1` → `archive/2026-11-06/dependabot/github_actions/actions/checkout-7.0.1` (`acb8f1b41958f27fc318a8bb9824af4a02aedb1d`)
- `dependabot/github_actions/actions/setup-node-7.1.0` → `archive/2026-11-06/dependabot/github_actions/actions/setup-node-7.1.0` (`5953d8ee4c5f294fb8a258ed1d7a3de404ffd008`)
- `dependabot/github_actions/actions/upload-artifact-7.0.2` → `archive/2026-11-06/dependabot/github_actions/actions/upload-artifact-7.0.2` (`b42383424b0b5189672d5a708c1a9ccb6c637f07`)
- `dependabot/github_actions/github/codeql-action/init-4.39.1` → `archive/2026-11-06/dependabot/github_actions/github/codeql-action/init-4.39.1` (`0f02b8befd83bc1e3c77174975295e063cdd347b`)
- `dependabot/github_actions/pnpm/action-setup-6.1.0` → `archive/2026-11-06/dependabot/github_actions/pnpm/action-setup-6.1.0` (`4ee5c8c68ddaf7c3970619a67a2922185bdac98e`)
- `dependabot/npm_and_yarn/framer-motion-14.7.1` → `archive/2026-11-06/dependabot/npm_and_yarn/framer-motion-14.7.1` (`a875b5d92030b383451ad02d212beaf8d23015d1`)
- `dependabot/npm_and_yarn/jotai-3.0.1` → `archive/2026-11-06/dependabot/npm_and_yarn/jotai-3.0.1` (`80fe6da50f1f814f7427e23cda5542c8d831f4e4`)
- `dependabot/npm_and_yarn/mapbox-gl-3.33.0` → `archive/2026-11-06/dependabot/npm_and_yarn/mapbox-gl-3.33.0` (`e7a02e530fbd4d38e0a4e4a6ac5b3f3d25379a40`)
- `dependabot/npm_and_yarn/minor-and-patch-76c6269f83` → `archive/2026-11-06/dependabot/npm_and_yarn/minor-and-patch-76c6269f83` (`23e2e12ef195f731032da8c5d41c5eed99f72a11`)
- `dependabot/npm_and_yarn/react-day-picker-10.0.2` → `archive/2026-11-06/dependabot/npm_and_yarn/react-day-picker-10.0.2` (`54a200fc7cb86ad62c9f57dcd20da40468109152`)
- `feat/c03-model-fallback` → `archive/2026-11-06/feat/c03-model-fallback` (`3b688b896fd4916cd55e9a6bb05f69f475f1ab88`)
- `fix/remediation-2a68d1fb-185920` → `archive/2026-11-06/fix/remediation-2a68d1fb-185920` (`0105b0deb24c38972b527c171b5af9837affe882`)
