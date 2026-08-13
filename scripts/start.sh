#!/usr/bin/env bash
#
# Container entrypoint. Runs pending migrations, then starts the app.
#
# This exists because nothing else ran migrations. Railway deploys on a push to
# main and starts the process; no workflow in either repo touched knex, so every
# schema change had to be remembered and run by hand, and the window between a
# deploy and that memory was a production API serving code its database had not
# caught up with.
#
# set -e is the point rather than an incidental: if the migration fails the
# server must not come up. Railway keeps the previous deploy serving, which is
# the right outcome — a failed deploy is recoverable, a live process talking to
# a half-migrated schema is not.

set -euo pipefail

# Cron containers share this image. They must not migrate: two containers
# racing for the knex migration lock means one of them dies, and a cron job
# that failed to run is a worse outcome than a migration landing a moment later
# when the web container boots.

# Wait for the database to accept connections before migrating.
#
# Railway's private network is not up the instant a container starts, so a
# migrate that fires immediately can fail on DNS or a refused connection. With
# set -e that is a failed deploy which reads as "the migration broke" when the
# network simply was not ready yet — the worst kind of error, because it sends
# you to look at the wrong thing.
#
# Bounded on purpose. Retrying forever converts "the database is gone" into a
# container that never starts and never says why, which is harder to diagnose
# than a clean failure. Roughly 30s by default, then it gives up loudly.
wait_for_database() {
  # No URL, or no client to check with, means no wait. A fresh clone and a
  # laptop should behave exactly as before rather than acquiring a new
  # dependency to run the thing locally.
  if [ -z "${DATABASE_URL:-}" ]; then
    return 0
  fi
  if ! command -v pg_isready >/dev/null 2>&1; then
    echo "[start] pg_isready unavailable, migrating without waiting"
    return 0
  fi

  attempts="${DB_WAIT_ATTEMPTS:-15}"
  delay="${DB_WAIT_DELAY:-2}"
  i=1
  while [ "$i" -le "$attempts" ]; do
    if pg_isready -q -d "$DATABASE_URL"; then
      [ "$i" -gt 1 ] && echo "[start] database reachable after ${i} attempts"
      return 0
    fi
    echo "[start] database not ready (${i}/${attempts}), retrying in ${delay}s"
    sleep "$delay"
    i=$((i + 1))
  done

  echo "[start] database unreachable after $((attempts * delay))s, giving up" >&2
  return 1
}

if [ "${RUN_CRON:-}" != "true" ]; then
  wait_for_database
  echo "[start] running pending migrations"
  pnpm migrate
fi

exec node start.js
