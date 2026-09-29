#!/usr/bin/env bash
# Brings up the synthetic "production" (same compose file, project bksynthsrc),
# shapes it like the hosted platform, creates two users through the real Auth
# API (real bcrypt hashes), seeds public data, and writes the connection URL
# (synthetic password) to src-url.txt. No port is published: the source db is
# additionally attached to Docker's default bridge so the backup script's own
# containers can reach it by IP.
set -euo pipefail
export MSYS_NO_PATHCONV=1
H="$(cygpath -m "$(cd "$(dirname "$0")" && pwd)")"
OUT="$(cygpath -m "${ACCEPT_OUT:-$HOME/bk-acceptance}")"; mkdir -p "$OUT"
REPO="$(cygpath -m "$(cd "$H/../../.." && pwd)")"
P=bksynthsrc
export VERIFY_ID=$P VERIFY_DB_PASSWORD="$(openssl rand -hex 16)" VERIFY_JWT_SECRET="$(openssl rand -hex 32)" \
       VERIFY_ANON_KEY=unused VERIFY_SERVICE_KEY=unused
docker compose -p $P -f "$REPO/scripts/backup/verify-stack.compose.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
docker compose -p $P -f "$REPO/scripts/backup/verify-stack.compose.yml" up --detach --wait --quiet-pull
DB=$P-db-1
docker exec -i $DB psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 < "$REPO/scripts/backup/verify-stack-shape.sql"
for u in 1 2; do
  docker exec $P-auth-1 wget -qO- --header 'Content-Type: application/json' \
    --post-data "{\"email\":\"synthetic$u@example.test\",\"password\":\"Synth-Login-$u-7788\"}" \
    http://127.0.0.1:9999/signup >/dev/null
done
docker exec -i $DB psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 < "$H/seed.sql"
docker network connect bridge $DB
IP="$(docker inspect --format '{{.NetworkSettings.Networks.bridge.IPAddress}}' $DB)"
printf 'postgresql://postgres:%s@%s:5432/postgres' "$VERIFY_DB_PASSWORD" "$IP" > "$OUT/src-url.txt"
docker exec $DB psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -t -A \
  -c "select 'users='||count(*) from auth.users" -c "select 'identities='||count(*) from auth.identities" \
  -c "select 'notes='||count(*) from public.notes" -c "select 'profiles='||count(*) from public.profiles" \
  -c "select 'cron_jobs='||count(*) from cron.job" -c "select 'buckets='||count(*) from storage.buckets" \
  -c "select 'custom_role='||count(*) from pg_roles where rolname='synthetic_reader'"
echo "source db bridge IP: $IP (no published port)"
docker ps --filter label=com.docker.compose.project=$P --format '{{.Names}}|{{.Ports}}'
