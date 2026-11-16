# Backup, restore and readiness (backlog item 37)

Scripts live in `scripts/ops/`. They need Docker. They change nothing except the file you name.

| Task | Command |
|---|---|
| Find the database container | `docker ps --format '{{.Names}}'` (packaged stack: `whink-personal-postgres-1`; user `whink`, db `whink`) |
| Back up | `scripts/ops/db-backup.sh whink-personal-postgres-1 whink whink ~/Backups/whink-$(date +%F).dump` |
| Restore into an EMPTY database | `scripts/ops/db-restore.sh whink-personal-postgres-1 whink_restored whink ~/Backups/whink-2026-11-15.dump` |
| Readiness | `node scripts/ops/readiness.mjs --env "$HOME/Library/Application Support/Whink Ultimate/runtime.env"` |
| Prove restore works | `scripts/ops/test-restore.sh` |

## What the restore test proves
`test-restore.sh` starts a throwaway pgvector container, applies every real migration, inserts 25 rows, backs up, restores into a second database, then compares the row count of **every public table** (81 tables on 2026-11-15). It also checks that a restore into a populated database is refused. Last result: PASS, 81 tables identical.

## Keep with the dump (not inside it)
- `ENCRYPTION_KEY` from `runtime.env`. Stored provider tokens are encrypted with it; a restore without it cannot decrypt them.
- `AUTH_SECRET`. Without it sessions are invalid (people sign in again; passkeys depend on the same origin).
Store the key apart from the dump. Never put either in git or the brain.

## Restore into production (outage procedure)
1. Stop web and worker: `Start.command --stop`. 2. Restore into a **new** database name with `db-restore.sh`. 3. Point `DATABASE_URL`/`DIRECT_URL` in `runtime.env` at the new name. 4. Start, run `readiness.mjs`, sign in, check the ledger. 5. Keep the old database until you are satisfied.

## Limits
- The test covers the database only, not Docker volumes for speech models or `releases/` source copies.
- Dumps are not encrypted at rest by these scripts (mode 0600 only). Put them on an encrypted disk or encrypt before off-machine copy. Off-machine copy and its schedule are a Victor decision (storage spend).
- No automatic schedule is installed. A nightly launchd job can call `db-backup.sh`; not provisioned.
