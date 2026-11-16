#!/usr/bin/env bash
# Backup the Postgres database in a running docker container to a custom-format dump (pg_dump -Fc).
# Usage: scripts/ops/db-backup.sh <container> <db> <user> <out-file>
# The dump holds personal data: it is written mode 0600. Keep ENCRYPTION_KEY (runtime.env) separately; a restore without it cannot decrypt stored tokens.
set -euo pipefail
[ $# -eq 4 ] || { echo "usage: $0 <container> <db> <user> <out-file>" >&2; exit 2; }
C=$1; DB=$2; U=$3; OUT=$4
umask 077
docker exec "$C" pg_dump -U "$U" -d "$DB" -Fc --no-owner --no-acl > "$OUT.partial"
[ -s "$OUT.partial" ] || { rm -f "$OUT.partial"; echo "backup empty, refusing" >&2; exit 1; }
mv "$OUT.partial" "$OUT"
echo "backup ok: $OUT ($(wc -c < "$OUT") bytes)"
