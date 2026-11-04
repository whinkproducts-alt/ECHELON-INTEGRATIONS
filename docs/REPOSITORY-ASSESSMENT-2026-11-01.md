> Historical assessment, 2026-11-01. Current status, branches, test evidence and remaining work are reconciled in [the 2026-11-04 audit handoff](ECHELON-AUDIT-HANDOFF-2026-11-04.md). Preserve this record as provenance; its branch inventory and counts are not current.

# ECHELON repository assessment and main consolidation

Date: 2026-11-01, America/Edmonton. Requested outcome: assess the repo, refresh notes and consolidate latest app state onto main. This is repository readiness, not production deployment or acceptance of all architecture features.

## Reconciliation

Inspection main: `d5921d87a651342a6e182567beeb7735a2934a02`. Its CI and security workflows both completed successfully (runs 41286825321 and 41286825324). The architecture branch was 24 commits behind main and two ahead; the supporting pilot was 32 behind and five ahead. Merely replacing main with either would discard newer work.

Reconciled pilot code into latest main in `fc020b0`, retaining gateway security fixes. Combined the e2e tool-name addition with main's review fingerprint requirement. Integrated architecture and continuation notes after that. Independent read-only assurance identified and rechecked two corrections: provider review fixtures must pass the current checks fingerprint; failed statuses/cancelled runs must never produce a clean GitHub health verdict. Added regression coverage.

Main should be the single implementation starting point after this consolidation. Supporting branches remain preserved for provenance. No force push, branch deletion, deployment, provider purchase or live external send was performed.

## Branch inventory and decisions

| Branch group | Assessment / disposition |
|---|---|
| main | Retain newest security, credential-name, CI-efficiency and model-handoff changes; integrate verified pilot and architecture work. |
| integration/echelon-capability-gateway | Unique architecture/notes integrated by this consolidation; do not replay old code over main. |
| handoff/echelon-local-pilot-20261101 | Five unique worker/provider/model-evaluation commits reconciled; provenance only after consolidation. |
| claude/wonderful-carson-ci81s4 | No unique commit at inspection; main was one commit ahead. Restart future work from main. |
| bootstrap/echelon-foundation-20261030 | No unique commit; preserve unless owner later requests cleanup. |
| import/kamsi-prime-m1 | Historical source snapshot with distinct ancestry; app-source import is already represented in main, with subsequent fixes/additions. Do not merge 200 historical commits blindly just because graph ancestry differs. |
| fix/remediation-2a68d1fb-185920 | Two old bot commits. Provider-log fix superseded; approval-sweep removal is unreviewed and can regress crash handling. Retain existing main behavior; inspect finish-check separately. |
| 11 Dependabot branches / PRs #5–9, #11–16 | Proposed dependency changes, not completed application functionality. Do not merge major versions, 70-package group or Actions replacements without compatibility/license and workflow checks. Existing notes retain the Mapbox license concern; it was not resolved by this pass. |

## Verification

- The initial 41 migrations applied successfully to a NEW isolated test database (`echelon_reconcile_test_20261101`), not the owner database. The older test DB failed two new FK expectations because its previously applied migration predated updated constraints; no owner DB was reset.
- Full serial Vitest: **150 files passed; 2246 tests passed, 38 skipped**. Includes real gateway/worker/Postgres/MCP tests and explicit installed `wink-qwen3.5-9b-8k:latest` streaming. NVIDIA external trial disabled. Skips remain skips, not model/tool/remote proof.
- Initial full run exposed the existing hardcoded missing llama model. Hardware test now requires explicit `OLLAMA_INTEGRATION_MODEL`, restricts to loopback and fails if configured service/model is unavailable; absent opt-in is an honest skip. A subsequent unconstrained parallel run hit resource timeouts; serial run passed without increasing test assertion thresholds.
- Typecheck passed. Lint: zero errors, eight existing warnings.
- Production build with supported webpack compiler passed. Default Turbopack build failed in this execution environment at local process/port binding (Operation not permitted), including an escalated attempt; default GitHub build remains a required remote gate.
- Repository tracked-tree secret scanner passed: 1147 files. No credential values were published.
- Independent assurance rechecked fixes: no new critical/high blocker found in the inspected pilot/reconciliation diff; not a whole-product certification.
- Full built-app browser suite: **22 passed**, real isolated Postgres and Chromium.
- Added forward migration `20261102010000_gateway_constraint_upgrade` to reassert four security FK actions for databases that already applied the old gateway migration. It preserves rows and runs transactionally; tested against the older isolated DB. Default-compiler/CI/security verification is required on the final PR before main publication.

## Application readiness and next action

Worker and provider code are now present together with current gateway protections. The real GitHub App installation/configuration and real worker report are still unverified; App creation/key download were reported, so check before recreating. NVIDIA evaluation results are narrow synthetic evidence, not application integration. Model order/profile UI, automatic fallback, all requested communications and real speech acceptance, private Kill Team persistence/isolation, global lockdown, daily briefing, conditional blinking and physical Mac-off operation remain as ticketed in the architecture. Do not label the whole application ready because the repository is consolidated.

Continue from [execution checklist](ECHELON-READINESS-EXECUTION.md), using [architecture](product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md) and [launch checklist](LAUNCH-CHECKLIST.md). Start with live owner setup and harmless governed mission, then fixed-repo GitHub pilot. Credentials and exact protected test sends require the existing approval path. Current dependency alerts must be assessed against actual package/lockfile scope; publication-time vulnerability counts alone are not verified reachable application findings.

## Remote gate correction

Initial PR #21 CI passed the default production build but failed the new queue browser assertion (503 instead of 202): the clean CI browser environment lacked an encryption key for encrypted pending jobs. Added a disposable deterministic test-only key to E2E_ENV. Local .env had masked that fixture gap. This changes only the isolated browser-test setup; real deployments still require their own encryption key. Final remote gate results must be checked before merging.

## Verified main publication

PR #21 merged into main as `ef7e8971c8c8165f6fce900e1b277df2ebd86c90` after all checks passed on code head `92a072e`: CI (typecheck, lint, migrations, tests, default production build and browser suite), CodeQL, gitleaks and production dependency audit. Evidence: https://github.com/whinkproducts-alt/ECHELON-CORP/pull/21 ; CI https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41383823495 ; security https://github.com/whinkproducts-alt/ECHELON-CORP/actions/runs/41383823554 . This final publication record changes documentation only; main-push workflows may run again.

Main is the canonical continuation branch and contains the former supporting-pilot and architecture-branch heads plus newer security fixes. Local verification: 2246 tests passed/38 skipped; 22 browser tests passed; old-database forward-upgrade tests 47 passed; explicit hardware test 25 passed after final transport safeguard. Live GitHub/provider/Founder acceptance and remaining architecture tickets remain pending. No deployment or external communications were performed.
