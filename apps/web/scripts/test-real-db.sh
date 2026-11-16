#!/usr/bin/env bash
# Runs every real-database test against a throwaway Postgres (pgvector) container on 127.0.0.1:55433, then removes it.
# Needs Docker. Usage: pnpm test:real
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=echelon-dbtest
docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=t -e POSTGRES_DB=echelon_test -p 127.0.0.1:55433:5432 pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 3
export DATABASE_URL=postgresql://postgres:t@127.0.0.1:55433/echelon_test
export DIRECT_URL="$DATABASE_URL" M1_EXECUTION_DATABASE_URL="$DATABASE_URL"
npx prisma migrate deploy
# Serial: parallel files share one database and steal each other's queued jobs, which made a worker test flaky.
npx vitest run --no-file-parallelism $(grep -rlE "M1_EXECUTION_DATABASE_URL" lib/__tests__ | tr '\n' ' ')
