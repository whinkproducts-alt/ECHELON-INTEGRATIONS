# GitHub Gateway Handoff

Reconciliation update 2026-11-01: the supporting pilot is now reconciled with the latest main gateway security fixes. See `REPOSITORY-ASSESSMENT-2026-11-01.md` for current verification. The original verification and setup sections below are historical; live GitHub acceptance is still pending.

Continuation update, 2026-11-01: read `product/ECHELON-FUNCTIONAL-READINESS-ARCHITECTURE.md`
and `ECHELON-READINESS-EXECUTION.md` before continuing implementation. The Founder
requested a complete build plan for readiness items 1–10. App creation and private-key
download were reported after this original note; installation/configuration and live
worker acceptance must be checked before recreating anything. The historical statement
below that no App exists is not current evidence. No live pilot pass is recorded here.

This note describes the local work on `integration/echelon-capability-gateway` after
baseline commit `fc877121226af09cf9dc71c353e5c015083749db`. Read
[`CAPABILITY-GATEWAY.md`](CAPABILITY-GATEWAY.md) for the gateway design and limits.

## Implemented

- An owner can queue one agent tool call through `/api/integrations/jobs`. The
  existing worker runs it as the named agent through the gateway's grants,
  permission engine, approvals, and ledger. Duplicate submissions reuse a job;
  uncertain dispatches are not retried automatically.
- Queued inputs and successful output are encrypted. Owner-only job status
  returns a bounded result marked as untrusted. Pending inputs are erased after
  dispatch; the existing approval system still has its own storage behavior.
- A separate loopback MCP provider exposes only `repo_build_health`. Its fixed
  owner, repository, and branch come from local configuration. It accepts no
  repository or method arguments, makes fixed GitHub GET requests, and pins
  results to one commit. It requires a private GitHub App installed for the
  intended repository with read permissions only.

## Verification completed locally

- Typecheck and production build passed; lint had no errors and eight existing
  warnings.
- The final focused fixture and real-database test run passed 44 tests across
  the GitHub report, worker, and gateway suites.
- A standalone MCP smoke check passed initialization, the single-tool roster,
  missing-bearer denial, and caller-supplied repository denial using a
  disposable key. It did not contact GitHub.
- Earlier Integration Hub browser tests passed, including owner-only queue
  admission and duplicate-request behavior.
- The broader suite remains non-green: one pre-existing model test requests a
  model that is not installed, and 38 older tests skip under the default shared
  database mock. A separate real-database run exposed 26 failures in older
  social tests. Do not report those checks as passing.

## Next acceptance work

1. Create and install a private GitHub App for `whinkproducts-alt/ECHELON-CORP`
   with read-only Contents, Checks, Commit statuses, Actions, Issues, and Pull
   requests permissions. Store its private key outside Git. Never paste a key
   or token into chat. No App or live credential is configured yet.
2. Configure the provider locally with a fixed repository and branch, App and
   installation IDs, private-key path, and a separate local bearer. Register,
   discover, review, and grant its one tool through the Integration Hub.
3. Run a real worker job and verify its report, receipt, revocation behavior,
   denial of another public or private repository, and rejection of writes
   before network I/O. Missing checks must stay `UNVERIFIED`.
4. Define retention and cleanup for encrypted input left by interrupted jobs
   and for encrypted results before using sensitive business data. Physical
   Mac-off operation remains a later milestone.

No GitHub provider live call, deployment, purchase, or Mac-off test has been
completed. The web server does not start the worker automatically.
