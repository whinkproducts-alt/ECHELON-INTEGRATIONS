# Echelon source provenance — current status and bootstrap history
**New repository:** `whinkproducts-alt/ECHELON-CORP`, initial main contained the Founder's README; current main includes the reconciled app and updated documentation.
**Original private reference:** `whinkproducts-alt/KAMSI-PRIME`.
**Approved source branch:** `feat/whink-architecture-control-20261030`, architecture-control docs retrieved as of 30 October 2026.
**Original architecture PR:** https://github.com/whinkproducts-alt/KAMSI-PRIME/pull/14 (source provenance; do not auto-merge).
**Original code — updated 2026-11-04:** source import and main reconciliation are complete. The imported source/worker/GitHub work was reconciled in PR #21 and later PRs #23/#24. The former statement "NOT imported" described the bootstrap snapshot, not current main. The older local source tip `6f08789` is preserved but is not itself an ancestor of current main; source functionality is verified by paths/blobs and tests rather than blindly merging that history. See `docs/reconciliation/2026-11-04.md` and the current audit handoff.
**Supplemental existing HOLO references:** `whinkproducts-alt/Whink-Ultimate-UI` and `whinkproducts-alt/holo-gestures`.
**Repository baseline source audit:** branch work tree had ~1,072 file blobs and ~26.8 MB; this is a historical audit figure, not target migration proof.
**Current M1 source record:** `docs/architecture-control/08-M0-M1-EXECUTION-RECORD.md` reports a bounded internal-analysis execution repair and 2,038 passed/38 skipped tests on the legacy branch. These are **source-reported tests**, not tests run against ECHELON.

Do not overwrite or mirror legacy secrets, active production databases, paid cloud routes, worker schedules or workflow tokens.
