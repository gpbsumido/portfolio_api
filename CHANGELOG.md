# Changelog

## 2026-02-23

- `scripts/calendar/migrate.js` — migration script that creates the `calendar_events` table
- `routes/calendar.js` — new auth-gated CRUD route (`GET /events`, `GET /events/:id`, `POST /events`, `PUT /events/:id`, `DELETE /events/:id`) mounted at `/api/calendar`;
- `utils/db.js` — utils for calendar API, note that dates are in UTC
- `server.js` — mounted `calendarRoutes` at `/api/calendar`. fix auth error handler to catch `express-oauth2-jwt-bearer` errors (`err.status === 401`) which were previously falling through to the 500 handler

## 2026-02-21 (pt. 2)

- `server.js` — fix wrong param name `_req`
- `routes/gallery.js` + `utils/db.js` — gallery delete was calling delete before checking ownership. added `getGalleryItemById`, fetch the record first, check owner, then delete
- `routes/db.js` — add auth check to marker delete; postforum POST now requires JWT and derives username from `req.auth.payload.sub` instead of trusting the request body
- `init.sql` — added missing `gallery`, `med_journal`, and `feedback` table definitions; deploys were hitting runtime errors on those routes
- extracted `runPythonScriptQueued` into `utils/pythonQueue.js`; fantasy route was spawning Python directly with no queue or timeout — now goes through the same queue as all other F1 routes
- `routes/nba.js` — removed leftover `require('node-fetch')`; Node 18 has fetch built in and the package was removed
- `routes/f1.js` — removed `installPythonDeps()` startup call; Dockerfile already runs pip at build time so its uneccessary on boot
- `routes/nba.js` — fixed bug in `/stats/:playerId`: swapped all hardcoded indices in that endpoint to use `getColumnIndex` by header name, same as the players endpoint
- `docker-compose.yml` — added `db` service (postgres:15) with `init.sql` mounted so `docker compose up` works locally without an external DB; app now waits on the healthcheck before starting
- extracted fantasy scoring functions into `utils/fantasyScoring.js` and added `tests/fantasy.test.js` with 19 jest tests covering DNF, DSQ, fastest lap, DOTD, positions gained/lost, etc
- `utils/db.js` — wrapped `deleteMedJournalEntry` and `saveOrUpdateMedJournalEntry` in transactions; previously a failure mid-way could leave orphaned feedback rows or a journal entry with no matching feedback
- `routes/gallery.js` — migrated from `aws-sdk` v2 to `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` v3; v2 is in maintenance mode
- `routes/db.js` — added pagination to `GET /postforum` (`page` + `limit` query params, defaults 1/20); was returning every row
- `utils/rateLimiter.js` — replaced 1-second unconditional delay with `express-rate-limit` (60 req / 5 min per IP) for inbound requests and `p-throttle` (1 req/s) for outbound calls to the NBA Stats API
- apply improved CORS to only my websites
- `routes/chat-gpt.js` added length check

## 2026-02-21

- removed duplicate `medJournalRoutes` mount in `server.js` — it was registered twice and the second one skipped auth
- cleaned logs in `server.js`
- `routes/nba.js` — `/teams` and `/players` were still using a hardcoded season string, swapped to `getCurrentSeason()`
- fixed wrong arg order in `constructor-points/:year/:round`
- standardised all F1 routes to go through `runPythonScriptQueued`, pulled repeated timeout handling into `handleQueuedRoute`
- removed the `/debug-python` enpoint from f1 routes, shouldn't be exposed in prod
- renamed `GET /clear-cache` to `DELETE /cache` and added `checkJwt`
- added `checkJwt` to the schema inspection routes in `db.js` (`/tables`, `/table/:tableName`)
- removed deprecated `calculateSprintPoints` function in `fantasy.js`, also moved the inline python script to its own file
- added `.venv/` to `.gitignore`
- updated readme and this changelog
