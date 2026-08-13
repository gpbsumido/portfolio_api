# Portfolio API

Backend REST API for [paulsumido.com](https://paulsumido.com). Built with Node.js/Express, PostgreSQL, and Python (FastF1). Deployed on Railway.

## Tech Stack

- **Runtime**: Node.js 18+ / Express
- **Database**: PostgreSQL (via `pg`)
- **Rate limiting**: `express-rate-limit`, backed by Redis when `REDIS_URL` is set
- **Auth**: Auth0 JWT (`express-oauth2-jwt-bearer`)
- **Storage**: AWS S3 (image uploads via `multer` + `sharp`)
- **Data**: Python + FastF1 (F1 telemetry), NBA Stats API proxy
- **Deployment**: Railway + Docker

## Features

| Feature         | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| NBA             | Live standings, team rosters, player stats, shot charts, and playoff bracket picks/leaderboard |
| F1              | Race schedules, results, telemetry, weather, and championship points via FastF1 |
| Fantasy F1      | Custom fantasy scoring engine based on qualifying, race results, and overtakes  |
| YouTube         | Recent videos from a YouTube channel via RSS feed                               |
| Gallery         | Authenticated image upload/delete with S3 storage and Sharp optimization        |
| Medical Journal | Protected CRUD journal for medical rotations (Auth0-gated)                      |
| Feedback        | Rotation feedback linked to journal entries (Auth0-gated)                       |
| Calendar        | Personal calendar events, countdowns, and calendar sharing with editor/viewer roles (Auth0-gated) |
| Web Vitals      | Real-user Core Web Vitals collection, P75 aggregation, and per-version filtering |
| Forum / Markers | Post forum and geolocation markers stored in PostgreSQL                         |

## API Endpoints

The Features table above is the quick tour. For the full, always-current reference (every route, its params, and the request/response schemas) I generate live Swagger docs straight from the code so this README never drifts out of date:

- **Swagger UI:** `/api/docs`
- **OpenAPI spec:** `/api/docs/openapi.json`

Route groups at a glance:

| Base | Area |
| ---- | ---- |
| `/api/nba`, `/api/nba/playoffs` | NBA standings, rosters, stats, shot charts, bracket picks |
| `/api/f1`, `/api/fantasy` | F1 schedules, results, telemetry, standings, fantasy scoring |
| `/api/youtube` | Recent videos from a channel |
| `/api/gallery` | S3 image upload / delete |
| `/api/med-journal`, `/api/feedback` | Medical rotation journal + feedback (auth) |
| `/api/calendar` | Events, countdowns, and shared calendars (auth) |
| `/api/vitals` | Core Web Vitals ingest + P75 aggregation |
| `/api/likes`, `/api/replies`, `/api/reposts`, `/api/search`, `/api/notifications` | Ketsup social features — likes, replies, reposts, search, notifications |
| `/api` | Forum posts, map markers, DB table inspection |

## Deprecations

### ChatGPT endpoints (removed 2026-07-28, v2.17.0)

`POST /api/chatgpt` and `POST /api/chatgpt/summarize` are **gone**, along with the
`chat` module, the `openai` dependency (npm and pip), and the `OPENAI_API_KEY`
environment variable.

They wrapped OpenAI `gpt-3.5-turbo` for a free-text chat and for rewording
medical-journal entries. Nothing called them: a sweep of every project on this
machine (`paul-explore`, `ketsup`, this repo) found no consumer, and the
medical-journal module never wired up the summarizer it was written for. They
were authenticated but unmetered, so any signed-in user could spend against the
key with 4000-character prompts.

Callers get a 404. If you need this back, restore the module from history rather
than rewriting it:

```bash
git log --oneline --all -- src/modules/chat
```

**Operational follow-up:** remove `OPENAI_API_KEY` from the deployment
environments (Railway/Fly) and revoke the key at OpenAI — deleting the code does
not invalidate it.

## Local Development

### Prerequisites

- Node.js >= 18
- Python 3.10+
- PostgreSQL (or Docker)
- Docker + Docker Compose (optional)

### Setup

```bash
# Clone
git clone <repository-url>
cd portfolio_api

# Install Node dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env
```

### Environment Variables

See `.env.example` for the full list. Required values:

```env
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/portfolio

# Auth0
NEXT_PUBLIC_AUTH0_AUDIENCE=https://your-api-identifier
NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=


# Google Calendar sync (optional, only needed if using the calendar sync feature)
# Create an OAuth 2.0 client in Google Cloud Console (Web application type)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# the callback URL you registered in Google Cloud Console
GOOGLE_REDIRECT_URI=https://api.paulsumido.com/api/google/auth/callback
# any random secret, used to sign the OAuth state param (openssl rand -hex 32)
GOOGLE_STATE_SECRET=
# publicly reachable URL for the webhook endpoint -- must be https, won't work on localhost
# use ngrok or similar for local testing: ngrok http 3001, then set this to the tunnel URL
GOOGLE_WEBHOOK_URL=https://api.paulsumido.com/api/google/webhook
# the frontend URL the OAuth callback redirects back to after connect/disconnect
FRONTEND_URL=https://paulsumido.com

# Operator dashboard writes (required in any deployed environment)
# Must match OPERATOR_SERVICE_TOKEN in paul-explore. Generate with:
#   openssl rand -hex 32
# Leave it unset locally and the check is a deliberate no-op, so a fresh clone
# works with no setup. Set it on one side only and reads keep working while
# every write 401s, which presents as a baffling partial outage -- so set both
# or neither.
OPERATOR_SERVICE_TOKEN=
```

### Operator dashboard auth

Three layers answering three different questions. They are not interchangeable:

| Layer | Question | Enforced by |
| --- | --- | --- |
| `OPERATOR_SERVICE_TOKEN` | Can this caller write at all? | `requireServiceToken` on every write |
| `x-operator-visitor` | Which visitor is this? | `createKeyedLimiter`, and the audit actor |
| Auth0 JWT (optional) | Who is this, really? | `optionalCheckJwt` on the operator router |

Reads are open on purpose: the dashboard is a public demo and it has to work
without an account. Writes are closed, so nobody can point curl at these
endpoints and mutate the data around the app.

The visitor id is **self-asserted and not a security control**. Clearing the
cookie gets you a fresh rate-limit budget, which is fine, because the service
token already decides who reaches these endpoints at all — a fairness limit only
has to tell honest callers apart. Never hang an authorization decision on it.

### Google Calendar watch channel renewal

Watch channels expire after 7 days. The renewal job in `utils/renewWatchChannels.js`
renews any channel expiring within 24 hours. Set it up as a Railway cron service:

- **Command**: `node utils/renewWatchChannels.js`
- **Schedule**: `0 6 * * *` (daily at 6am UTC)
- The cron service lives in the same Railway project and shares the same env vars

You can also run it manually: `node utils/renewWatchChannels.js`

### Feature-flags reset cron

The feature-flags console is public and any signed-in user can toggle flags, so a
cron restores the canonical demo seed every 6 hours. It reuses the same seed the
migration applies (`src/modules/feature-flags/seed.ts`), so the demo can't drift.

Run it as its **own** Railway cron service (separate from the web service and the
calendar cron — a service has only one schedule and one `CRON_JOB`):

- **Source**: this repo, `main`; **Start command**: `node start.js` (from `railway.json`)
- **Schedule**: `0 */6 * * *` (00/06/12/18 UTC)
- **Variables**: `RUN_CRON=true`, `CRON_JOB=reset-feature-flags`, `NODE_ENV=production`, `DATABASE_URL=<railway postgres>`

`start.js` dispatches on `CRON_JOB` (defaulting to `renew-watch-channels`), so set
these vars **only on the cron service** — setting them project-wide would boot the
web service into cron mode. `NODE_ENV=production` is required so the DB pool uses
SSL against the Railway Postgres (`src/config/database.ts`). Run manually with
`node dist/jobs/resetFeatureFlags.js`.

### Operator demo re-seed cron

The operator dashboard is a public demo whose views are time-relative (the 24-hour
alert trend, the day/week sales ranges) but whose seed timestamps are static, so
the data thins out as it ages — and visitors can dismiss alerts or rearrange a
planogram. A cron re-seeds the whole fleet daily, restoring the canonical demo and
refreshing every timestamp. It reuses the same `seedOperator()` the CLI seed uses
(`src/modules/operator/seed.ts`), so the two can't drift.

Run it as its **own** Railway cron service (a service has only one schedule and one
`CRON_JOB`):

- **Source**: this repo, `main`; **Start command**: `node start.js` (from `railway.json`)
- **Schedule**: `0 4 * * *` (daily at 4am UTC)
- **Variables**: `RUN_CRON=true`, `CRON_JOB=reseed-operator`, `NODE_ENV=production`, `DATABASE_URL=<railway postgres>`

Same caveats as the feature-flags reset: set these vars **only on the cron service**
(project-wide would boot the web service into cron mode), and `NODE_ENV=production`
is required for SSL against the Railway Postgres. Run manually with
`node dist/jobs/reseedOperator.js`, or locally with `pnpm seed:operator`.

Note this **wipes and re-inserts** the `operator_*` tables, so anything a visitor
changed is reset. paul-explore shows a note on the dashboard so that isn't a
surprise.

### Database migrations

Migrations are TypeScript (`src/migrations/`) run via knex through `tsx`:

```bash
pnpm migrate            # apply pending migrations
pnpm migrate:rollback   # roll back the last batch
```

Notes:

- The scripts invoke `tsx node_modules/knex/bin/cli.js` — plain `knex` can't load
  the TS migrations or their `.js`-style ESM imports.
- Migrations pick up `DATABASE_URL` from `.env`. Use `NODE_ENV=production pnpm migrate`
  against a managed/Railway database so the connection enables SSL.
- On a database that already has the pre-migrations schema, mark the baseline as
  applied once so knex skips it: `INSERT INTO knex_migrations (name, batch, migration_time) VALUES ('000_baseline.ts', 1, NOW());`

### Migrations run themselves on deploy

`scripts/start.sh` is the container entrypoint. It runs `pnpm migrate` and then
starts the app, so a deploy brings its own schema with it and there is no window
where the new code is serving against the old database.

Two things follow from that:

- **A failed migration stops the server coming up.** That is deliberate. Railway
  keeps the previous deploy serving, which is recoverable; a live process
  talking to a half-migrated schema is not.
- **Cron containers skip it.** They share the image and set `RUN_CRON=true`. Two
  containers racing for the knex migration lock means one of them dies, and a
  cron job that failed to run is worse than a migration landing a moment later.

Running `pnpm migrate` by hand still works and is still the right move for a
one-off against an environment mid-flight.

### What migrations are allowed to need

`ci/migration-env.json` declares the environment the migrations may rely on,
and `scripts/ci-migrate.sh` runs them with exactly that and nothing else.

This exists because migration 020 was mergeable and green in this repo while
breaking every branch in paul-explore. It encrypts the stored Google tokens and
refuses to run without `TOKEN_ENCRYPTION_KEY`, but nothing here ran migrations,
so the only thing that noticed was the frontend workflow — which is the one
place nobody looks when reviewing an API migration.

Both repos now call the same script against the same file. The Migrations CI job
here runs it against a throwaway Postgres, and paul-explore runs it against the
database it spins up for e2e. So:

- A migration that needs a new variable fails **here**, in the repo that added
  it, rather than turning up as a red build on every frontend branch
- Declaring it in `ci/migration-env.json` fixes both sides at once, because
  paul-explore reads the same file
- The values in there are throwaway and obviously fake on purpose. They protect
  nothing — the database is created empty and thrown away — and a fake-looking
  value cannot be mistaken for a real secret. Never put a real credential in it

The job also rolls the batch back, because a `down()` can need a key just as
much as an `up()` can.

### What automating them did not fix

Running migrations on deploy removed the step that kept getting forgotten. It
said nothing about what is in them, or what happens when one fails partway.

**Failing partway is handled, and it is worth knowing why.** Postgres has
transactional DDL and knex wraps the whole batch in one transaction, so a
migration that dies after its third statement leaves nothing behind — not the
statements before it, and not the migrations earlier in the same batch.
Verified rather than assumed: a migration that creates a table and then throws
leaves no table, no row in `knex_migrations`, and every previously applied
migration untouched. Combined with `set -e` in the entrypoint, a bad migration
means a failed deploy and the previous release still serving.

The one way to lose that is to opt out of the transaction, which is what
`CREATE INDEX CONCURRENTLY` requires. A test fails if any migration mentions it
or sets `disableTransactions`. If a table ever gets big enough to genuinely
need a concurrent index, that is a deliberate decision to make then, not
something to acquire by accident.

**Dropping things is not handled, and cannot be.** Nothing about automation
stops a destructive migration going out unread. So a test scans the `up()` of
every migration for drops, renames, truncations and column tightening, and
fails unless the file carries a written reason:

```ts
// DESTRUCTIVE: drops todos.detail, unused since 4.9.0 and confirmed empty in
// production before this shipped.
```

`down()` is not scanned, because a `down()` that drops the column its `up()`
added is exactly correct.

It is an acknowledgement rather than a ban on purpose. Dropping a column is
sometimes right; doing it without having thought about the code currently
running against that schema is not. The reason has to appear as a line in the
diff, which is the only place it is any use. Usually the correct response to
this test failing is not to write the comment — it is to expand first: add the
new thing, ship the code that stops using the old thing, drop it a release
later.

### Run (without Docker)

```bash
npm run dev
```

The server starts on `http://localhost:3001`.

### Run with Docker

**Option A — App + Postgres via Docker Compose:**

```bash
# In .env, set the database host to the compose service name:
# DATABASE_URL=postgresql://postgres:postgres@db:5432/portfolio

docker compose up --build
```

**Option B — Postgres in Docker, app on the host:**

```bash
docker compose up -d db
# then in .env:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolio
```

This is the one to use day to day. The container publishes 5432, so migrations
and `dev` run against a throwaway local database.

**Do not put the Railway value in a local `.env`.** It points at a public proxy
host, which means local `dev` reads and writes live data and `migrate` migrates
production — with the credentials crossing the open internet to get there. The
same applies to `DATABASE_PUBLIC_URL`. If port 5432 is already taken by a
Postgres you installed directly, publish `"5433:5432"` instead and match the
port in the URL.

### Rate limiting and Redis

Rate-limit counters live in memory unless `REDIS_URL` is set. In memory is
correct for a fresh clone and for CI, but it is per-process: on Fly, with
`min_machines_running = 0`, every cold start wipes every counter, and scaling to
N instances multiplies each limit by N. A shared Redis store fixes both.

To exercise the Redis path locally:

```bash
docker compose up -d redis
# then in .env:
# REDIS_URL=redis://localhost:6379
```

**Do not put the Railway value in a local `.env`.** It is
`redis.railway.internal`, a private hostname that only resolves inside
Railway's network, so locally it can never connect — every boot falls back to
in-memory and logs about it.

Boot never blocks on Redis. An unreachable instance degrades to in-memory
rather than failing to start, so a Redis outage costs you shared counters, not
the API.

**Option B — App container only, using your local Postgres:**

```bash
# In .env, use host.docker.internal instead of localhost:
# DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/portfolio

docker build -t portfolio-api .
docker run --rm -p 3001:3001 --env-file .env portfolio-api
```

> The app waits for Postgres to be ready before starting (via `wait-for-it.sh`).

### Database Migrations

Migrations are one-time scripts in `scripts/`. Run them manually after setup:

```bash
# Create calendar_events table
node scripts/calendar/migrate.js

# Create event_cards junction table (TCG card ↔ event)
node scripts/calendar/migrate_tcg.js

# Create web_vitals table
node scripts/vitals/migrate.js

# Create countdowns table
node scripts/calendar/migrate_countdowns.js

# Create users + calendar_members tables (required for calendar sharing)
node scripts/calendar/migrate_sharing.js

# Create nba_playoff_brackets table
node scripts/run-migration.js migrations/006_nba_playoffs.sql
```

> **Auth0 setup for sharing**: add a post-login Action that sets `api.accessToken.setCustomClaim("email", event.user.email)` so the backend `upsertUser` middleware can populate the users table from the JWT email claim.

### Tests

```bash
npm test
```

Covers the fantasy scoring engine (`calculateQualifyingPoints`, `calculateRacePoints`) — DNF variants, disqualification, fastest lap, driver of the day, positions gained/lost, overtakes, and combined scenarios.

## Deployment

Deployed on [Railway](https://railway.app) using the included `Dockerfile`. Environment variables are configured in the Railway dashboard. FastF1 cache is persisted at `./cache/fastf1` via a Railway volume.

Deploys are automatic on merge to `main` via GitHub Actions. `develop` is not
deployed for the API, so the frontend's staging environment
(`develop.paulsumido.com`) talks to this same production deployment.

For `REDIS_URL`, prefer Railway's reference syntax — `${{Redis.REDIS_URL}}` —
over pasting the value. It tracks the variable if the service is recreated, and
it resolves to the private `.railway.internal` host, so the connection never
crosses the public internet.

There's also a `fly.toml` in the repo. I might move hosting over to [Fly.io](https://fly.io) at some point to sit on the free tier, but Railway is working fine so it's not a priority. If I do switch it's roughly `fly launch` then `fly deploy` with the secrets set.
