# Changelog

## 2026-03-12 - version 1.2.3

- added `routes/googleWebhook.js` with `POST /api/google/webhook`; receives Google Calendar push notifications (body is always empty, all info is in headers); responds 200 immediately before any async work so Google never times out waiting
- webhook handler skips events not in our DB (identified by `google_event_id`) so Gmail events and anything created directly in Google Calendar are ignored entirely
- conflict resolution via `updated_at`: if Google's `item.updated` timestamp is newer than our `updated_at`, we apply the change; if ours is newer we skip (our version wins)
- cancelled events (`item.status === "cancelled"`) are deleted from our DB
- sync token is saved before processing items so a mid-batch crash doesn't re-apply the same changes on the next notification
- added `getEventByGoogleId(googleEventId, userSub)` to `utils/db.js`; returns the raw row including `updated_at` for conflict comparison
- added `updateCalendarEventFromWebhook(id, fields, userSub)` to `utils/db.js`; sets `sync_source='google'` instead of `'local'` so the push sync knows to fire on the next user-driven edit
- registered `googleWebhook` router separately from `google` router in `server.js` to keep the unauthenticated webhook route clearly separated from the JWT-protected OAuth routes

## 2026-03-11 - version 1.2.2

- added `utils/googleCalendar.js` with four helpers: `createGoogleEvent`, `updateGoogleEvent`, `deleteGoogleEvent`, `fetchIncrementalEvents`; all call `getValidAccessToken` internally and return null (or no-op) when the user is not connected
- color mapping table in `googleCalendar.js` maps our 8 EVENT_COLORS hex values to Google Calendar colorIds; defaults to "9" (blueberry) for unknown colors
- all-day events are sent to Google with `{ date: "YYYY-MM-DD" }` start/end; timed events use `{ dateTime, timeZone: "UTC" }`; PATCH uses the same field mapping as POST
- `deleteGoogleEvent` swallows 404s since the event may have already been deleted on the Google side
- wired push sync into `routes/calendar.js` for the three event mutation routes: create calls `createGoogleEvent` then `setEventGoogleId`; update calls `updateGoogleEvent` with the full updated event; delete calls `deleteGoogleEvent` using the `googleEventId` from the deleted row
- Google sync failures in all three routes are caught and logged but never fail the response, the user's data is already saved
- `toCalendarEvent` in `utils/db.js` now includes `googleEventId` so route handlers can read it without a second query
- `updateCalendarEvent` always resets `sync_source = 'local'` on any user-driven update so the outbound push fires even if the event last arrived via webhook

## 2026-03-11 - version 1.2.1

- added `routes/google.js` with four routes under `/api/google/auth`: `GET /status` (connected check), `GET /url` (generates Google OAuth URL), `GET /callback` (exchanges code for tokens, saves to DB, registers watch channel), `DELETE /disconnect` (stops watch channel, deletes tokens)
- OAuth state param is signed with HMAC-SHA256 using `GOOGLE_STATE_SECRET` so the callback can verify which user it belongs to without storing anything server-side; `timingSafeEqual` used for comparison to avoid timing attacks
- `prompt=consent` and `access_type=offline` are set on the authorization URL to ensure a refresh token is always returned, even for returning users
- callback redirects to `FRONTEND_URL/protected/settings?gcal=connected` on success, `?gcal=denied` if the user declined, `?gcal=error` on failure
- `registerWatch` and `stopWatch` are stubbed in this route (implemented in prompt 5); watch failure on connect is non-fatal, user is still connected
- registered router at `/api/google` in `server.js`; added comment explaining why watch channel renewal is a Railway cron job, not a setInterval
- new required env vars: `GOOGLE_STATE_SECRET`, `FRONTEND_URL`

## 2026-03-11 - version 1.2.0

- added `google_auth` table to store per-user Google OAuth tokens (access token, refresh token, expiry, watch channel info, sync token); one row per connected user, primary key on `user_id`
- added `google_event_id` and `sync_source` columns to `calendar_events`; `google_event_id` maps our events to their Google Calendar counterparts, `sync_source` tracks whether the last change came from us or from a Google webhook (prevents push loops); partial index on `google_event_id` where not null
- run `node scripts/calendar/migrate_google_sync.js` to apply the schema changes
- added Google sync helpers to `utils/db.js`: `getGoogleAuth`, `upsertGoogleAuth`, `deleteGoogleAuth`, `updateChannelInfo`, `updateSyncToken`, `setEventGoogleId`, `clearEventGoogleId`
- added `utils/googleToken.js` with `getValidAccessToken(userId)`: returns a cached token if still valid, otherwise hits the Google token endpoint with the refresh token and stores the new one; throws if the user is not connected

## 2026-03-11 - version 1.1.6

- `GET /api/calendar/countdowns` now supports cursor-based pagination; pass `?cursor=YYYY-MM-DD__<uuid>` to get the next page; the cursor is a composite of `target_date` and `id` (double-underscore separator) which makes page boundaries stable — an insert or delete between fetches doesn't shift items the way OFFSET would
- `getCountdowns(userSub, cursor)` in `utils/db.js` uses the LIMIT n+1 trick to detect `hasNextPage` without a COUNT query; `COUNTDOWN_PAGE_SIZE = 50`; response shape is `{ countdowns: Countdown[], nextCursor: string | null }` — `null` when there is no next page

## 2026-03-11 - version 1.1.5

- added `countdowns` table to the database — stores a title, optional description, target date (plain `DATE`, no time component to avoid timezone confusion), color, and `user_sub` for ownership scoping; same auth pattern as `calendar_events`
- added five new routes under `/api/calendar/countdowns`: list all sorted by target date, get by id, create, partial update, and delete; all require a valid Auth0 JWT and are scoped to the requesting user via `req.auth.payload.sub`
- added `getCountdowns`, `getCountdownById`, `createCountdown`, `updateCountdown`, and `deleteCountdown` to `utils/db.js`; the partial update uses the same `colMap` pattern as `updateCalendarEvent` so only the fields you pass actually change
- `target_date` is stored as `DATE` and returned as a `"YYYY-MM-DD"` string; pg returns `DATE` columns as strings (unlike `TIMESTAMP` which becomes a `Date` object), so `toCountdown` can use it directly with no conversion

## 2026-02-28

- `GET /api/vitals/by-version` — new endpoint returning P75 per metric for the last 5 distinct versions, sorted oldest→newest so charts render chronologically left to right; fetches top-5 versions first, then a single aggregation query using `ANY($1)` to avoid N queries
- `GET /api/vitals/versions` — fixed bug where endpoint always returned an empty array; `SELECT DISTINCT ... ORDER BY string_to_array(...)` fails in PostgreSQL because the ORDER BY expression must appear in the SELECT list when using DISTINCT; switched to `GROUP BY` which deduplicates the same way and allows arbitrary ORDER BY expressions

## 2026-02-27

- added `app_version` column (`VARCHAR(20) NOT NULL DEFAULT 'unknown'`) to `web_vitals` table — run `node scripts/vitals/migrate.js` to apply
- `POST /api/vitals` now stores `app_version` from the request body (defaults to `'unknown'` if omitted, so old clients continue to work)
- `GET /api/vitals/summary` accepts `?v=X.Y.Z` and filters to rows from that version onwards; uses `string_to_array(app_version, '.')::int[]` for correct semver ordering (`0.10.0 > 0.9.0`)
- `GET /api/vitals/by-page` same version filter applied to both the CTE and the outer join
- `GET /api/vitals/versions` — new endpoint returning distinct `app_version` values sorted newest-first (excludes `'unknown'` rows); auth required

## 2026-02-26

- added `web_vitals` table to track real-user Core Web Vitals (LCP, CLS, FCP, INP, TTFB) from the frontend
- `POST /api/vitals` is open (no auth) — vitals aren't sensitive, anonymous collection is standard; validates metric name against a whitelist and rejects unknown values
- `GET /api/vitals/summary` returns P75 + good/needs-improvement/poor counts per metric using `PERCENTILE_CONT(0.75)` — Postgres handles the percentile math natively, no application-layer sorting needed
- `GET /api/vitals/by-page` same aggregation grouped by pathname first, min 5 samples per page to keep single-visit noise out of the numbers; results sorted by total page traffic descending
- both GET routes require `checkJwt` — the aggregate view is only meaningful to the site owner
- `scripts/vitals/migrate.js` creates the table and three indexes (metric, page, created_at) — same pattern as the calendar migration

## 2026-02-23

- added calendar feature — create and manage personal events, Auth0-gated with dates stored and returned in UTC
- added ability to attach TCG cards to calendar events — card metadata is saved to the DB at the time you pick it so it doesn't need to hit TCGdex on every read
- card endpoints under `/api/calendar/events/:id/cards` — list, add, update quantity/notes, and remove cards from an event
- `GET /events` now accepts `?cardId=` and `?cardName=` to filter events by card
- fixed a bug where auth failures were returning 500 instead of 401 due to a wrong error name check in the global error handler

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
