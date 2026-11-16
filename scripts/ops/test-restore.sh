#!/usr/bin/env bash
# Proves backup and restore: throwaway pgvector container, real migrations, seed rows, back up, restore into a second
# database, compare per-table row counts for EVERY public table. Needs Docker and a generated Prisma client. Usage: scripts/ops/test-restore.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
H=$(printf %s "$ROOT" | cksum | cut -d" " -f1)
C=echelon-restoretest-$H; PORT=$((56000 + H % 500))
T=$(mktemp -d); trap 'docker rm -f "$C" >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" -e POSTGRES_PASSWORD=t -e POSTGRES_DB=src -p 127.0.0.1:$PORT:5432 pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 1 40); do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done; sleep 3
export DATABASE_URL=postgresql://postgres:t@127.0.0.1:$PORT/src DIRECT_URL=postgresql://postgres:t@127.0.0.1:$PORT/src
(cd "$ROOT/apps/web" && npx prisma migrate deploy >/dev/null)
Q() { docker exec "$C" psql -U postgres -d "$1" -tAc "$2"; }
Q src "INSERT INTO users(id,email,\"updatedAt\") SELECT 'u'||g, 'u'||g||'@example.test', now() FROM generate_series(1,25) g"
# Row counts of every public table, exact (not estimates).
counts() { Q "$1" "SELECT string_agg(format('SELECT %L||'':''||count(*) FROM %I', tablename, tablename), ' UNION ALL ' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'" \
  | { read -r sql; Q "$1" "$sql"; } | sort; }
"$ROOT/scripts/ops/db-backup.sh" "$C" src postgres "$T/b.dump"
"$ROOT/scripts/ops/db-restore.sh" "$C" restored postgres "$T/b.dump"
# Restore into a populated database must be refused.
if "$ROOT/scripts/ops/db-restore.sh" "$C" restored postgres "$T/b.dump" >/dev/null 2>&1; then echo "FAIL: restore overwrote a populated db" >&2; exit 1; fi
counts src > "$T/a.txt"; counts restored > "$T/b.txt"
grep -q '^users:25$' "$T/b.txt" || { echo "FAIL: seeded rows missing after restore" >&2; exit 1; }
[ "$(wc -l < "$T/a.txt")" -gt 50 ] || { echo "FAIL: too few tables compared" >&2; exit 1; }
diff "$T/a.txt" "$T/b.txt" && echo "PASS: $(wc -l < "$T/a.txt" | tr -d ' ') tables, row counts identical after restore"
