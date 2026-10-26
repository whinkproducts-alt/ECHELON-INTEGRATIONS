#!/usr/bin/env bash
# Run the whole verification locally the way CI does: throwaway pgvector Postgres in Docker (127.0.0.1 only),
# every migration, seed, build, then the Playwright suite. Needs Docker (OrbStack is fine), pnpm and Node 22.
# Usage: scripts/ci/e2e-local.sh [--keep-db]
set -euo pipefail
cd "$(dirname "$0")/../.."

NAME=whink-e2e-pg
PORT=${E2E_DB_PORT:-55432}
export DATABASE_URL="postgresql://whink:local_e2e_only@127.0.0.1:${PORT}/whink_e2e_test"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET="${AUTH_SECRET:-local-e2e-dummy-secret-not-real-0123456789}"
export NEXTAUTH_SECRET="$AUTH_SECRET"
export AUTH_URL="http://127.0.0.1:3100" NEXTAUTH_URL="http://127.0.0.1:3100"
export WHINK_OWNER_EMAILS="e2e-owner@example.test"

cleanup() { [ "${1:-}" = "--keep-db" ] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap 'cleanup "${1:-}"' EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_USER=whink -e POSTGRES_PASSWORD=local_e2e_only -e POSTGRES_DB=whink_e2e_test \
  pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U whink -d whink_e2e_test >/dev/null 2>&1 && break; sleep 1; done

pnpm install --frozen-lockfile
pnpm --filter app exec prisma generate
pnpm --filter app exec prisma migrate deploy
pnpm --filter app exec prisma db seed
pnpm --filter app test
pnpm --filter app build
( cd e2e && npm ci && npx playwright install chromium && npx playwright test )
