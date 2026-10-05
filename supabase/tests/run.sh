#!/usr/bin/env bash
# Testa a migração do ForBarber num Postgres local descartável.
# Uso: bash supabase/tests/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-5444}"
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$DIR"; else RUN=""; fi
trap '$RUN "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
$RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$HERE/stub_supabase.sql"
for f in "$HERE"/../migrations/*.sql; do
  case "$f" in *storage*) continue ;; esac
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$HERE/forbarber_test.sql" -t
"${PSQL[@]}" -f "$HERE/forbarber_avisos_produtos_test.sql" -t
