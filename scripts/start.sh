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
if [ "${RUN_CRON:-}" != "true" ]; then
  echo "[start] running pending migrations"
  pnpm migrate
fi

exec node start.js
