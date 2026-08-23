# Portfolio API

Backend REST API for [paulsumido.com](https://paulsumido.com). Built with Node.js/Express, PostgreSQL, and Python (FastF1). Deployed on Railway.

## Tech Stack

- **Runtime**: Node.js 22+ / Express
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
| Forum / Markers | Post forum and geolocation markers stored in PostgreSQL. Markers are create-and-read; there is no delete |
| Operator        | Unattended-retail dashboard — auditable restocking, promotions, per-store sales, planogram, all resolved in the store's own timezone |
| Feature Flags   | Flag definitions, deterministic evaluation, targeting rules, and an audit log   |
| To-do           | Admin-only outstanding-work list behind an email allowlist. Every change is recorded as a revision and can be reverted; reverting writes a new revision rather than discarding later ones |
| Gallery Walls   | Saved frame layouts with S3-backed photos                                       |

## API Endpoints

The Features table above is the quick tour. For the full, always-current reference (every route, its params, and the request/response schemas) I generate live Swagger docs straight from the code so this README never drifts out of date:

- **Swagger UI:** `/api/docs`
- **OpenAPI spec:** `/api/docs/openapi.json`

Route groups at a glance:

Every router mounted in `src/app.ts`, in source order:

| Base | Area |
| ---- | ---- |
| `/api` | Health and version (`/api/health`) |
| `/api/docs` | Swagger UI and the OpenAPI spec |
| `/api/nba`, `/api/nba/playoffs` | NBA standings, rosters, stats, shot charts, bracket picks |
| `/api/youtube` | Recent videos from a channel |
| `/api/f1`, `/api/fantasy` | F1 schedules, results, telemetry, standings, fantasy scoring |
| `/api/vitals` | Core Web Vitals ingest + P75 aggregation |
| `/api/geo` | Geolocation lookup |
| `/api/referrals` | Referral links and counts |
| `/api/operator` | Unattended-retail operator dashboard — stores, inventory, restock sessions, promotions, sales, planogram |
| `/api/feature-flags` | Flag definitions, evaluation, and the audit log |
| `/api/todos` | Admin to-do list behind an email allowlist, with per-item revision history, revert, and comments |
| `/api/tcg` | Fantasy TCG economy — per-user coin wallet, daily claim, pack opening, and card collection |
| `/api/calendar` | Events, countdowns, and shared calendars (auth) |
| `/api/gallery` | S3 image upload / delete |
| `/api/walls` | Saved gallery-wall layouts |
| `/api/med-journal`, `/api/feedback` | Medical rotation journal + feedback (auth) |
| `/api/profiles` | Ketsup profiles |
| `/api/posts`, `/api/likes`, `/api/replies`, `/api/reposts` | Ketsup posts and interactions |
| `/api/search`, `/api/notifications`, `/api/follows`, `/api/timeline` | Ketsup search, notifications, follows, timeline |
| `/api/google` | Google Calendar OAuth and webhook |
| `/api` | Forum posts (`/api/postforum`) and map markers (`/api/markers`) |

Two routers mount at bare `/api` — health first, forum last — which is why the
forum paths look like they belong to no group.

**Gone, and deliberately:** the table-inspection routes (`/tables`,
`/table/:tableName`) read `information_schema` and handed every table and column
name to any caller with an account. `DELETE /api/markers/:id` is absent too, so
markers are create-and-read.

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

- Node.js >= 22 (`engines` requires it, and CI runs 22)
- Python 3.10+
- PostgreSQL (or Docker)
- Docker + Docker Compose (optional)

### Setup

```bash
# Clone
git clone <repository-url>
cd portfolio_api

# Install Node dependencies (pnpm, per the packageManager field)
pnpm install

# Install Python dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env
```

### Environment Variables

`.env.example` is the complete annotated list and the source of truth — every
key there carries a comment explaining what breaks without it. This section does
not repeat all of them, because two lists is how one of them ends up wrong.

The minimum to boot:

```env
PORT=3001
NODE_ENV=development   # production in any deployed environment — see Database networking
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolio
NEXT_PUBLIC_AUTH0_AUDIENCE=https://your-api-identifier
NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
```

Everything else turns a feature off rather than stopping the server:

| Unset | What stops working |
| ----- | ------------------ |
| `AWS_*` | Gallery uploads and saved wall photos |
| `GOOGLE_*`, `FRONTEND_URL` | Google Calendar sync and its webhook |
| `OPERATOR_SERVICE_TOKEN` | Operator reads still work; every write 401s. Must match paul-explore's |
| `FLAGS_SERVICE_TOKEN` | Open-tier flag writes reach only the in-memory store |
| `ADMIN_ALLOWED_EMAILS` | Nobody can read or tick `/api/todos` |
| `TOKEN_ENCRYPTION_KEY` | Migration `020` refuses to run, and Google tokens are stored unencrypted |
| `REDIS_URL` | Rate limits fall back to in-memory: per-process, so they reset on every cold start and multiply by the instance count |
| `CDN_BASE_URL` | Falls back to the bucket URL. Must match paul-explore's `NEXT_PUBLIC_MEDIA_ORIGIN` or saved walls render blank |
| `PLAYOFFS_ADMIN_SECRET` | Bracket admin routes refuse |
| `SITE_URL`, `LOG_LEVEL` | Fall back to the production domain and `info` |

**The admin allowlist has two different names.** It is `ADMIN_ALLOWED_EMAILS`
here and `FLAG_ADMIN_ALLOWED_EMAILS` in `paul-explore`, and both need the same
addresses. Set one and not the other and `/to-do` renders in the browser while
every tick 403s at the API, which reads like a bug in the page rather than a
missing variable.

### Database networking and TLS

**The database is not reachable from the internet.** `DATABASE_URL` points at
`postgres.railway.internal` over Railway's private network, and public access on
the Postgres service is switched off. There is no proxy host to connect to and
no password to guess from outside.

That resolves a question this section used to spend a lot of words on. The old
setup pointed at a public proxy whose certificate presents `CN=localhost` signed
by a CA Railway does not publish, so verification could only be made to work by
scraping their CA out of the handshake and disabling hostname checking. The
decision was not to pin, on the grounds that a scraped certificate trades a real
control for a future outage — but the better answer turned out to be removing
the path rather than securing it. Verification is not unavailable now, it is
beside the point.

Traffic on the private network is encrypted by the tunnel itself, so
`DB_CA_CERT` and `DB_SSL_REJECT_UNAUTHORIZED` are effectively vestigial. They
still work if this ever needs to reach a database somewhere else, and the boot
warning about an unverified connection now fires only when the connection is
genuinely public *and* unverified — warning about a private one trains you to
ignore the warning.

Two consequences worth knowing:

- **`NODE_ENV` must be set to `production` in production.** The config defaults
  to `development` when it is unset, and the TLS helper disables SSL entirely
  outside production. That was true here for longer than it should have been,
  and it meant the connection had no TLS at all rather than merely unverified
  TLS — which is worse than what the documentation claimed.
- **Nothing outside Railway can reach this database**, including your laptop.
  That is the point. Local development uses the compose Postgres below.

The full account is written up at
[/thoughts/database-networking](https://paulsumido.com/thoughts/database-networking).

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
pnpm dev
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

**The production value will not work locally, and that is deliberate.** It is a
`postgres.railway.internal` host on Railway's private network, which does not
resolve from anywhere else. There is no longer a public proxy to fall back on
either — public access is switched off on the Postgres service.

This used to be the other way round: the production string worked fine from a
laptop, so `dev` read and wrote live data and `migrate` migrated production
without anyone deciding it should. The local database below is now the only
thing that works, which is a better guarantee than a warning in a README.

If port 5432 is already taken by a Postgres you installed directly, publish
`"5433:5432"` instead and match the port in the URL.

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

> **Auth0 setup for calendar sharing**: add a post-login Action that sets
> `api.accessToken.setCustomClaim("email", event.user.email)` so the backend
> `upsertUser` middleware can populate the users table from the JWT email claim.

### Tests

```bash
pnpm test
```

53 test files under `src/`, run by vitest (`include: ['src/**/*.test.ts']`).

The coverage is deliberately lopsided. The operator module has 14 files —
aggregations, promotions, restock sessions, rate limiting, service-token auth,
timezone resolution, SQL smoke tests against a real database — because it is the
only module with real write traffic and non-trivial money-shaped arithmetic.
Most of the rest sit on authorization boundaries: `write-auth`, `write-tier`,
`feedback-ownership`, `journal-ownership`, `post-visibility`,
`profile-visibility`, `webhook-auth`. That is where a mistake is quiet and
expensive, so that is where the tests are.

Nothing covers `calendar`, `gallery`, `geo`, `nba`, `youtube`, `forum`,
`follows`, `timeline`, `fantasy` or `docs`. Mostly thin proxies over external
APIs, but it is a gap rather than a decision.

`tests/fantasy.test.js` is **not run** — it is a `.js` file and the vitest
include pattern only picks up `src/**/*.test.ts`. It has been dead weight for a
while; the README used to describe it as the whole suite.

## Deployment

Deployed on [Railway](https://railway.app) using the included `Dockerfile`. Environment variables are configured in the Railway dashboard. FastF1 cache is persisted at `./cache/fastf1` via a Railway volume.

Deploys are automatic on merge to `main`, but **not via GitHub Actions** —
Railway watches the branch through its own GitHub integration and builds from
the `Dockerfile`. The workflows in `.github/workflows/` are `ci.yml` (lint,
typecheck, test, migrations, build) and `tag-release.yml` (tags minor and major
releases). Neither deploys anything.

The distinction matters when a deploy does not appear: a green CI run says the
code is sound, not that anything shipped. Railway's own dashboard is the only
place that knows.

`develop` is not deployed for the API, so the frontend's staging environment
(`develop.paulsumido.com`) talks to this same production deployment. There is no
staging API, which is fine for reads and worth remembering before testing
anything destructive.

Migrations run as part of the deploy — see the migrations section above. There
is no separate step and nothing to remember.

For `REDIS_URL`, prefer Railway's reference syntax — `${{Redis.REDIS_URL}}` —
over pasting the value. It tracks the variable if the service is recreated, and
it resolves to the private `.railway.internal` host, so the connection never
crosses the public internet.

There's also a `fly.toml` in the repo. I might move hosting over to [Fly.io](https://fly.io) at some point to sit on the free tier, but Railway is working fine so it's not a priority. If I do switch it's roughly `fly launch` then `fly deploy` with the secrets set.
