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
| NBA             | Live standings, team rosters, and player stats via NBA Stats API                |
| F1              | Race schedules, results, telemetry, weather, and championship points via FastF1 |
| Fantasy F1      | Custom fantasy scoring engine based on qualifying, race results, and overtakes  |
| YouTube         | Recent videos from a YouTube channel via RSS feed                               |
| Gallery         | Authenticated image upload/delete with S3 storage and Sharp optimization        |
| Medical Journal | Protected CRUD journal for medical rotations (Auth0-gated)                      |
| Feedback        | Rotation feedback linked to journal entries (Auth0-gated)                       |
| ChatGPT         | OpenAI-powered chat and journal entry summarization (Auth0-gated)               |
| Calendar        | Personal calendar events stored in PostgreSQL (Auth0-gated) — _in progress_     |
| Forum / Markers | Post forum and geolocation markers stored in PostgreSQL                         |

## API Endpoints

### NBA — `/api/nba`

| Method | Path               | Description                         |
| ------ | ------------------ | ----------------------------------- |
| GET    | `/teams`           | Current season standings            |
| GET    | `/players/:teamId` | Roster for a team                   |
| GET    | `/stats/:playerId` | Player stats for the current season |

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

### Calendar — `/api/calendar` _(Auth Required, in progress)_

| Method | Path                         | Description                                                                                         |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/events`                    | List events for the authenticated user (supports `?start=`, `?end=`, `?cardId=`, `?cardName=`)      |
| GET    | `/events/:id`                | Get a single event                                                                                  |
| POST   | `/events`                    | Create an event                                                                                     |
| PUT    | `/events/:id`                | Update an event                                                                                     |
| DELETE | `/events/:id`                | Delete an event                                                                                     |
| GET    | `/events/:id/cards`          | List all TCG cards linked to an event                                                               |
| POST   | `/events/:id/cards`          | Add a card to an event (`cardId`, `cardName` required; metadata denormalized from TCGdex at insert) |
| PUT    | `/events/:id/cards/:entryId` | Update `quantity` or `notes` on a card entry                                                        |
| DELETE | `/events/:id/cards/:entryId` | Remove a card from an event                                                                         |

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
```

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
```

### Tests

```bash
npm test
```

Covers the fantasy scoring engine (`calculateQualifyingPoints`, `calculateRacePoints`) — DNF variants, disqualification, fastest lap, driver of the day, positions gained/lost, overtakes, and combined scenarios.

## Deployment

Deployed on [Railway](https://railway.app) using the included `Dockerfile`. Environment variables are configured in the Railway dashboard. FastF1 cache is persisted at `./cache/fastf1` via a Railway volume.
