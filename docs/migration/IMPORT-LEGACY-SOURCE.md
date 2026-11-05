> Historical import runbook. Source transfer/reconciliation is already complete on current main; do not execute the import again. See [2026-11-04 reconciliation](../reconciliation/2026-11-04.md) and the [current completion plan](../product/ECHELON-END-TO-END-COMPLETION-PLAN.md). Commands below describe the original migration procedure.

# ECHELON full-source import runbook
**Purpose:** preserve **all source code and Git history** from KAMSI-PRIME in the independent ECHELON repository without modifying the original, deleting ECHELON's existing main README, or copying production secrets.

## Why source import is a separate action
The connected GitHub interface can write text files and commits but cannot fork or directly transfer 1,000+ cross-repository Git objects. Attempting to create Git trees in ECHELON referencing blobs in KAMSI-PRIME was rejected by GitHub. The full code import is NOT completed by the architecture-docs bootstrap PR.

The recommended method is authenticated Git on the Founder's computer/Codex Desktop. It preserves the legacy history as a distinct branch and does **not** rewrite ECHELON `main`.

## Safe Codex Desktop command sequence
Run in a new working directory (do not execute inside a live KAMSI-PRIME checkout). All commands below are non-destructive to the original remote:

```bash
git clone https://github.com/whinkproducts-alt/ECHELON-CORP.git
cd ECHELON-CORP
git remote add legacy https://github.com/whinkproducts-alt/KAMSI-PRIME.git
git fetch legacy feat/whink-architecture-control-20261030
git switch -c import/kamsi-prime-m1 FETCH_HEAD
# Verify the source and branch before any push
git log -1 --oneline
git status --short
test -f apps/web/package.json
test -f docs/architecture-control/08-M0-M1-EXECUTION-RECORD.md
git push --set-upstream origin import/kamsi-prime-m1
```
**Stop if any verification fails.** Confirm the latest source branch SHA and whether newer validated work should be incorporated before moving forward. Do not fetch and overwrite `main` with force-push. If Git checkout already has a `legacy` remote or branch, inspect and reconcile first rather than overwriting it.

After import, the two histories are unrelated. On a dedicated integration branch, merge them explicitly with `--allow-unrelated-histories`, resolving README and any document conflicts while retaining both histories, then test before proposing a PR. Never auto-resolve all conflicts with `-X ours` or `-X theirs`. The initial ECHELON README describes the new sister company and must be preserved.

## Security gate before executing inherited code
Audit `.github/workflows/`, scheduled jobs, credentials and environment variables; disable external side-effect/scheduled workflows in the import/integration branch pending review. Prevent inherited deployment targets, incoming webhooks, database migrations, remote sync, paid model calls and outbound messages from pointing at production. Provision fresh local-only test credentials and isolated database. No secret or real user-data copying by default.

## What to carry forward
- Source snapshot from legacy `feat/whink-architecture-control-20261030`, including recent bounded M1 execution repair, actual org registry and migrations.
- HOLO visual framework from existing project and `whinkproducts-alt/Whink-Ultimate-UI` and `whinkproducts-alt/holo-gestures` as additional **read-only references** after inspecting licences and overlap; never blindly replace current HOLO.
- Approved FDR-001..029 and traceability, unchanged except for explicit ECHELON-specific clarifications.
- Known deficits: generic spending gate, full HOLO live event integration, temporary takeover, model benchmark, off-device Mac-off uptime, commercialized deployment.

## Completion evidence
A GitHub branch `import/kamsi-prime-m1` in ECHELON with source history, count/tree comparison against original reference, environment-isolation check, and passing baseline non-destructive CI/test suite. This runbook alone is not source migration.
