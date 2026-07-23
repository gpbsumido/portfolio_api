# Portfolio API

Backend REST API for [paulsumido.com](https://paulsumido.com). Built with Node.js/Express, PostgreSQL, and Python (FastF1). Deployed on Railway.

## Tech Stack

- **Runtime**: Node.js 18+ / Express
- **Database**: PostgreSQL (via `pg`)
- **Auth**: Auth0 JWT (`express-oauth2-jwt-bearer`)
- **Storage**: AWS S3 (image uploads via `multer` + `sharp`)
- **AI**: OpenAI GPT (chat + summarization)
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
| ChatGPT         | OpenAI-powered chat and journal entry summarization (Auth0-gated)               |
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
| `/api/chatgpt` | OpenAI chat + journal summarization (auth) |
| `/api/calendar` | Events, countdowns, and shared calendars (auth) |
| `/api/vitals` | Core Web Vitals ingest + P75 aggregation |
| `/api/likes`, `/api/replies`, `/api/reposts`, `/api/search`, `/api/notifications` | Ketsup social features — likes, replies, reposts, search, notifications |
| `/api` | Forum posts, map markers, DB table inspection |

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

# OpenAI
OPENAI_API_KEY=

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
```

### Google Calendar watch channel renewal

Watch channels expire after 7 days. The renewal job in `utils/renewWatchChannels.js`
renews any channel expiring within 24 hours. Set it up as a Railway cron service:

- **Command**: `node utils/renewWatchChannels.js`
- **Schedule**: `0 6 * * *` (daily at 6am UTC)
- The cron service lives in the same Railway project and shares the same env vars

You can also run it manually: `node utils/renewWatchChannels.js`

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

There's also a `fly.toml` in the repo. I might move hosting over to [Fly.io](https://fly.io) at some point to sit on the free tier, but Railway is working fine so it's not a priority. If I do switch it's roughly `fly launch` then `fly deploy` with the secrets set.
