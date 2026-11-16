#!/usr/bin/env bash
# Restore a db-backup.sh dump into an EMPTY database in a docker container. Refuses a database that already has tables.
# Usage: scripts/ops/db-restore.sh <container> <db> <user> <dump-file>
set -euo pipefail
[ $# -eq 4 ] || { echo "usage: $0 <container> <db> <user> <dump-file>" >&2; exit 2; }
C=$1; DB=$2; U=$3; F=$4
[ -s "$F" ] || { echo "no such dump: $F" >&2; exit 1; }
docker exec "$C" psql -U "$U" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
  || docker exec "$C" createdb -U "$U" "$DB"
docker exec "$C" psql -U "$U" -d "$DB" -c 'CREATE EXTENSION IF NOT EXISTS vector' >/dev/null
N=$(docker exec "$C" psql -U "$U" -d "$DB" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
[ "$N" = 0 ] || { echo "target $DB already has $N tables; refusing to overwrite" >&2; exit 1; }
docker exec -i "$C" pg_restore -U "$U" -d "$DB" --no-owner --no-acl --exit-on-error < "$F"
echo "restore ok into $DB"
