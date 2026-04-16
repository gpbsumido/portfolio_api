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

### NBA — `/api/nba`

| Method | Path               | Description                         |
| ------ | ------------------ | ----------------------------------- |
| GET    | `/teams`           | Current season standings            |
| GET    | `/players/:teamId` | Roster for a team                   |
| GET    | `/stats/:playerId` | Player stats for the current season |
| GET    | `/shots/:playerId` | Deterministic mock shot chart data  |

### NBA Playoffs — `/api/nba/playoffs`

| Method | Path                    | Auth     | Description                                                             |
| ------ | ----------------------- | -------- | ----------------------------------------------------------------------- |
| GET    | `/picks/:season`        | Required | Fetch the authenticated user's bracket picks for a season               |
| PUT    | `/picks/:season`        | Required | Save (upsert) the authenticated user's bracket picks for a season       |
| GET    | `/leaderboard/:season`  | —        | Score all user brackets against official results; returns ranked entries |

### F1 — `/api/f1`

| Method | Path                                            | Description                         |
| ------ | ----------------------------------------------- | ----------------------------------- |
| GET    | `/schedule/:year`                               | Race schedule for a season          |
| GET    | `/results/:year/:round/:session`                | Session results (Q/R)               |
| GET    | `/telemetry/:year/:round/:session/:driver/:lap` | Driver telemetry                    |
| GET    | `/fastest-laps/:year/:round/:session`           | Fastest laps                        |
| GET    | `/best-lap/:year/:round/:session/:driver`       | Driver's best lap                   |
| GET    | `/weather/:year/:round/:session`                | Session weather                     |
| GET    | `/driver-points/:year`                          | Driver championship standings       |
| GET    | `/constructor-points/:year`                     | Constructor standings               |
| GET    | `/driver-points/:year/:round`                   | Standings after a round             |
| GET    | `/constructor-points/:year/:round`              | Constructor standings after a round |
| GET    | `/driver-points-per-race/:year`                 | Points breakdown per race           |
| GET    | `/constructor-points-per-race/:year`            | Constructor breakdown per race      |
| GET    | `/driver-points-per-race/:year/:round`          | Driver points up to a round         |
| GET    | `/constructor-points-per-race/:year/:round`     | Constructor points up to a round    |
| GET    | `/queue-status`                                 | Current Python script queue status  |
| DELETE | `/cache`                                        | Clear FastF1 cache (requires auth)  |

### Fantasy F1 — `/api/fantasy`

| Method | Path                   | Description                              |
| ------ | ---------------------- | ---------------------------------------- |
| GET    | `/points/:year/:round` | Fantasy points for all drivers in a race |

### YouTube — `/api/youtube`

| Method | Path                      | Description                  |
| ------ | ------------------------- | ---------------------------- |
| GET    | `/recent?channel_id=<id>` | Recent videos from a channel |

### Gallery — `/api/gallery`

| Method | Path   | Auth     | Description             |
| ------ | ------ | -------- | ----------------------- |
| GET    | `/`    | —        | Paginated gallery items |
| POST   | `/`    | Required | Upload an image         |
| DELETE | `/:id` | Required | Delete an image         |

### Medical Journal — `/api/med-journal` _(Auth Required)_

| Method | Path                | Description                                    |
| ------ | ------------------- | ---------------------------------------------- |
| GET    | `/entries`          | Paginated journal entries (with search/filter) |
| GET    | `/edit-entry/:id`   | Fetch a single entry                           |
| POST   | `/save-entry`       | Create or update an entry                      |
| DELETE | `/delete-entry/:id` | Delete an entry                                |

### Feedback — `/api/feedback` _(Auth Required)_

| Method | Path   | Description                                      |
| ------ | ------ | ------------------------------------------------ |
| GET    | `/`    | Paginated feedback (with search/rotation filter) |
| POST   | `/`    | Add feedback                                     |
| PUT    | `/:id` | Update feedback                                  |
| DELETE | `/:id` | Delete feedback                                  |

### ChatGPT — `/api/chatgpt` _(Auth Required)_

| Method | Path         | Description                     |
| ------ | ------------ | ------------------------------- |
| POST   | `/`          | Chat completion                 |
| POST   | `/summarize` | Reword text for medical journal |

### Calendar — `/api/calendar` _(Auth Required)_

| Method | Path                                  | Description                                                                                         |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/events`                             | List events for the authenticated user (supports `?start=`, `?end=`, `?cardId=`, `?cardName=`)      |
| GET    | `/events/:id`                         | Get a single event                                                                                  |
| POST   | `/events`                             | Create an event                                                                                     |
| PUT    | `/events/:id`                         | Update an event                                                                                     |
| DELETE | `/events/:id`                         | Delete an event                                                                                     |
| GET    | `/events/:id/cards`                   | List all TCG cards linked to an event                                                               |
| POST   | `/events/:id/cards`                   | Add a card to an event (`cardId`, `cardName` required; metadata denormalized from TCGdex at insert) |
| PUT    | `/events/:id/cards/:entryId`          | Update `quantity` or `notes` on a card entry                                                        |
| DELETE | `/events/:id/cards/:entryId`          | Remove a card from an event                                                                         |
| GET    | `/countdowns`                         | List all countdowns for the authenticated user, sorted by target date ascending                     |
| GET    | `/countdowns/:id`                     | Get a single countdown                                                                              |
| POST   | `/countdowns`                         | Create a countdown (`title` and `targetDate` required, `targetDate` as `"YYYY-MM-DD"`)             |
| PUT    | `/countdowns/:id`                     | Partial update — send only the fields to change                                                     |
| DELETE | `/countdowns/:id`                     | Delete a countdown                                                                                  |
| GET    | `/calendars`                          | List all calendars owned by or shared with the user; owned rows include `role: "owner"`, shared rows include `role`, `ownerSub`, `ownerEmail` |
| POST   | `/calendars`                          | Create a calendar (`name`, `color`, `syncMode` required)                                            |
| PUT    | `/calendars/:id`                      | Update calendar name/color/syncMode — owner only                                                    |
| DELETE | `/calendars/:id`                      | Delete a calendar and all its events — owner only; removes Google ACL entries via `Promise.allSettled` before DB delete |
| POST   | `/calendars/:id/connect-google`       | Create a Google Calendar and register a push watch channel — owner only                             |
| DELETE | `/calendars/:id/google`               | Disconnect Google Calendar, stop watch channel — owner only                                         |
| GET    | `/calendars/:id/members`             | List members (owner entry synthesized at top); accessible by owner or any member                    |
| POST   | `/calendars/:id/members`             | Invite by email — owner only; rate-limited 20/min; generic 404 if email not found                  |
| PUT    | `/calendars/:id/members/:memberSub`  | Update member role (`editor`\|`viewer`) — owner only                                               |
| DELETE | `/calendars/:id/members/:memberSub`  | Remove member — owner only, or `"me"` for self-removal; awaits Google ACL revocation and returns `{ googleAclRemoved }` |

### Web Vitals — `/api/vitals`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/` | — | Ingest a Core Web Vitals metric (LCP, CLS, FCP, INP, TTFB); accepts optional `app_version` |
| GET | `/summary` | Required | P75 + good/needs-improvement/poor counts per metric; supports `?v=X.Y.Z` to filter by version |
| GET | `/by-page` | Required | Same aggregation grouped by pathname (min 5 samples); supports `?v=X.Y.Z` |
| GET | `/by-version` | Required | P75 per metric for the last 5 versions, sorted oldest→newest (for trend charts) |
| GET | `/versions` | Required | Distinct `app_version` values sorted by semver descending |

### General — `/api`

| Method | Path                | Auth     | Description           |
| ------ | ------------------- | -------- | --------------------- |
| GET    | `/postforum`        | —        | Fetch all forum posts |
| POST   | `/postforum`        | Required | Create a forum post   |
| GET    | `/markers`          | —        | Fetch all map markers |
| POST   | `/markers`          | —        | Add a map marker      |
| DELETE | `/markers/:id`      | —        | Delete a marker       |
| GET    | `/tables`           | Required | List database tables  |
| GET    | `/table/:tableName` | Required | Inspect table schema  |

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
