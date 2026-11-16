# Mac-off hosting runbook (item 38)

**Status: Needs Victor.** Nothing is provisioned. Choosing a host, a domain and paying for them is Victor's decision (protected: money). This is the ready-to-run recipe.

## What exists
- Same containers as the Mac install: `packaging/local/compose.yaml` (Postgres+pgvector, one-shot `migrate`, `web`, `worker`).
- `packaging/hosting/compose.yaml`: overlay adding Caddy (Apache-2.0) for automatic HTTPS. Compose config validated 2026-11-15.

## What Victor must decide or supply
1. A Linux server with Docker Compose v2 (about 4 GB RAM, 40 GB disk minimum for web + worker + Postgres; more if speech or local models run there). Provider and monthly cost: not chosen.
2. A domain with an A/AAAA record to the server; ports 80 and 443 open.
3. Model access. A hosted box cannot reach the Mac's Ollama. Either run Ollama on the host or set a cloud provider key under the spend envelope (R15: nothing runs until Victor sets the caps).
4. Where encrypted off-site backups go.

## Steps (when approved)
1. Copy the repo; create `runtime.env` (copy keys from `.github/workflows/windows-installer.yml` first-boot block: random `AUTH_SECRET`, `ENCRYPTION_KEY` 64 hex, `WHINK_DB_PASSWORD`, `WHINK_OWNER_EMAILS`, `SIGNUP_BOOTSTRAP_TOKEN`); set `AUTH_URL`/`NEXTAUTH_URL` to `https://<domain>`. File mode 0600.
2. `export WHINK_RELEASE_ID=$(git rev-parse --short HEAD) WHINK_RUNTIME_ENV=$PWD/runtime.env WHINK_DOMAIN=<domain>`
3. `docker compose --env-file runtime.env -f packaging/local/compose.yaml -f packaging/hosting/compose.yaml up -d --build --wait`
4. `node scripts/ops/readiness.mjs --url https://<domain> --env runtime.env`
5. Open the domain, create the owner account with the setup token; signup closes after the first account. Enrol a passkey on the real domain (passkeys are bound to the origin, so Mac passkeys do not carry over).
6. Install a nightly `db-backup.sh` cron and copy dumps off-box (see BACKUP-RESTORE.md). Run `test-restore.sh` once on the host.

## Risks to settle before switching the Mac off
- The always-on worker and Marcus sandbox (`packaging/macos`) are Mac features; the hosted worker runs inside the compose stack with no Mac-only tools (no iMessage, no local mic/camera).
- Data that must stay on the Mac (founder-private) must be decided before any import; do not restore a Mac dump onto a shared host without that review.
- Database is never published to a host port; keep it that way. Firewall everything except 80/443/22.
