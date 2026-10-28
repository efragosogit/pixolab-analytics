#!/usr/bin/env bash
# SSH tunnel to the production Postgres for local development.
#
# The database is a private Coolify resource on the Pixolab-apps server —
# no public port — so a dev machine can only reach it through SSH. This
# forwards 127.0.0.1:$LOCAL_PORT to the DB container's private IP, which
# it looks up on every run (Docker can hand the container a new IP after
# a restart, so it can't be hardcoded).
#
# Usage (leave it running in its own terminal, Ctrl-C to close):
#   pnpm db:tunnel
# then keep DATABASE_URL in .env.local pointing at 127.0.0.1:5433.
#
# This is the REAL production database, not a copy — local scripts that
# write (create-first-user, import-historical-leads) change live data.
#
# Overridable via env: PIXOLAB_SSH_KEY, PIXOLAB_SSH_HOST, DB_CONTAINER,
# LOCAL_PORT.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="${PIXOLAB_SSH_KEY:-$ROOT/../pixolab-agents/pixolab-cloud/.ssh/coolify_agent_ed25519}"
HOST="${PIXOLAB_SSH_HOST:-server.pixolab.com.mx}"
DB_CONTAINER="${DB_CONTAINER:-qxgbhzlyt15spit3ud4uiibp}"
LOCAL_PORT="${LOCAL_PORT:-5433}"

if [ ! -f "$KEY" ]; then
  echo "No encuentro la llave SSH en: $KEY" >&2
  echo "Define PIXOLAB_SSH_KEY con la ruta a coolify_agent_ed25519 (pixolab-agents/pixolab-cloud/.ssh/)." >&2
  exit 1
fi

if nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
  echo "El puerto $LOCAL_PORT ya está en uso (¿ya hay un túnel abierto?). Usa LOCAL_PORT=<otro> y ajusta DATABASE_URL." >&2
  exit 1
fi

SSH_OPTS=(-i "$KEY" -o IdentitiesOnly=yes -o ConnectTimeout=10)

DB_IP="$(ssh "${SSH_OPTS[@]}" "root@$HOST" \
  "docker inspect -f '{{(index .NetworkSettings.Networks \"coolify\").IPAddress}}' $DB_CONTAINER" 2>/dev/null || true)"

if [ -z "$DB_IP" ]; then
  echo "No pude obtener la IP del contenedor $DB_CONTAINER en $HOST (¿está corriendo la base en Coolify?)." >&2
  exit 1
fi

echo "Túnel abierto: 127.0.0.1:$LOCAL_PORT -> $DB_CONTAINER ($DB_IP:5432) vía $HOST"
echo "Ctrl-C para cerrarlo."
exec ssh "${SSH_OPTS[@]}" -N \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L "127.0.0.1:$LOCAL_PORT:$DB_IP:5432" "root@$HOST"
