# Changelog

## 2026-03-12 - version 1.3.7

- updated `registerWatch` in `utils/googleCalendar.js` to set the channel token as `userId:googleCalId` instead of just `userId`; after registering, looks up the corresponding `calendars` row via `getCalendarByGoogleCalId` and stores channel info and bootstrap sync token there; falls back to `google_auth` when no matching calendar row exists (legacy push channels where `googleCalId` is "primary")
- updated `routes/googleWebhook.js` to parse the new `userId:googleCalId` channel token format; new path looks up the `calendars` row by `googleCalId`, uses its `syncToken`, and saves the next token back to the calendar row after fetching; events not yet in our DB are imported via `createCalendarEventFromWebhook` for `two_way` calendars and skipped for all others; old single-userId token format falls back to the original `google_auth`-based flow for backward compatibility
- extracted `processExistingItem` helper to deduplicate the update/delete logic shared by both the new and legacy webhook paths; moved `SYNC_BUFFER_MS` to module scope

## 2026-03-12 - version 1.3.6

- updated OAuth scope in `routes/google.js` from `calendar.events` to `calendar`; the broader scope is required to create and manage dedicated Google Calendars for two_way sync; users who already authorized with the old scope will need to reconnect

## 2026-03-12 - version 1.3.5

- updated `POST /api/calendar/events` to fetch the event's calendar after insert and route the Google sync by `syncMode`: `push` targets `primary`, `two_way` targets `calendar.googleCalId`, `none` skips Google entirely
- updated `PUT /api/calendar/events/:id` with the same calendar-aware sync routing for updates
- updated `DELETE /api/calendar/events/:id` to fetch the event (including `calendarId`) before deletion, then route the Google delete to the correct calendar by `syncMode` after the DB row is gone

## 2026-03-12 - version 1.3.4

- refactored `utils/googleToken.js`: renamed core logic to `getTokenAndCalId(userId)` which now returns `{ token, calId }` where `calId` is `google_auth.google_cal_id`; kept `getValidAccessToken(userId)` as a thin wrapper for callers that only need the token; both are exported
- removed `GCAL_BASE` constant from `utils/googleCalendar.js`; replaced with `calBase(calId)` helper that builds the per-calendar base URL with `encodeURIComponent`
- updated `createGoogleEvent`, `updateGoogleEvent`, `deleteGoogleEvent`, `fetchIncrementalEvents`, and `registerWatch` to each accept an optional `calId` parameter; when omitted the function falls back to the user-level `calId` returned by `getTokenAndCalId`; the recursive full-sync call inside `fetchIncrementalEvents` now threads the original `calId` through
- added `createDedicatedCalendar(token, name)` to `utils/googleCalendar.js`: POSTs to the Google Calendar API to create a new calendar, returns `{ calId, calName }`; takes a token directly to avoid double-fetching

## 2026-03-12 - version 1.3.3

- updated `toCalendarEvent` in `utils/db.js` to include `calendarId` in the returned shape so route handlers and the frontend can read which calendar an event belongs to without a second query
- updated `createCalendarEvent` to accept `calendarId` in the fields object and include it in the INSERT; if no `calendarId` is provided it falls back to the user's oldest calendar (the "Personal" calendar from migration) so existing callers do not break
- updated `getCalendarEvents` to accept an optional `calendarId` filter that adds `AND ce.calendar_id = $N` to the WHERE clause
- updated `GET /api/calendar/events` to read `calendarId` from `req.query` and pass it through; updated `POST /api/calendar/events` to read `calendarId` from `req.body` and pass it through

## 2026-03-12 - version 1.3.2

- added calendar CRUD routes to `routes/calendar.js` under `/api/calendar/calendars`: `GET` (list), `POST` (create, validates name), `PUT /:id` (partial update, strips undefined fields before passing to db helper), `DELETE /:id` (204, cascade via FK); delete calls `stopWatchByCalId` stub before removing the row and logs any failure without aborting the delete; the Google Calendar itself is intentionally not deleted on disconnect

## 2026-03-12 - version 1.3.1

- added calendar DB helpers to `utils/db.js`: `toCalendar` mapper, `getCalendars`, `getCalendarById`, `getCalendarByGoogleCalId`, `createCalendar`, `updateCalendar`, `deleteCalendar`; `updateCalendar` uses the same dynamic SET clause pattern as `updateCalendarEvent` and always bumps `updated_at`
- added `createCalendarEventFromWebhook` helper: inserts a new `calendar_events` row with `sync_source='google'`, defaults title to `''` and color to `#3b82f6` so the webhook handler does not need to sanitize Google event fields before calling it

## 2026-03-12 - version 1.3.0

- added `calendars` table with `id`, `name`, `color`, `user_sub`, `google_cal_id`, `google_cal_name`, `sync_mode`, `channel_id`, `resource_id`, `channel_expiry`, `sync_token`; `sync_mode` is `none | push | two_way` -- this is the foundation for per-calendar Google sync config and eventual two-way dedicated calendar support
- added `calendar_id` FK column on `calendar_events` referencing `calendars(id)` with cascade delete
- migration script `scripts/calendar/migrate_calendars.js` creates a "Personal" calendar (`sync_mode='push'`) for every user that already has events and backfills `calendar_id` on all existing events, preserving current one-way sync behavior

## 2026-03-12 - version 1.2.10

- fixed `FRONTEND_URL` being a single static env var in `routes/google.js`: the single API deployment at `api.paulsumido.com` serves both `paulsumido.com` and `develop.paulsumido.com`, so the OAuth callback always redirected to the same frontend regardless of which one initiated the flow; frontend now passes `?origin=` to `GET /api/google/auth/url`, the origin is embedded (signed) in the OAuth state param alongside the userId, and the callback reads it back to redirect to the correct frontend; unknown origins are rejected with 400; `FRONTEND_URL` kept as fallback for any in-flight old-format state params

## 2026-03-12 - version 1.2.9

- fixed all-day event end date in `utils/googleCalendar.js`: Google Calendar treats all-day end dates as exclusive (the day after the last day), but our DB stores them as inclusive; added `exclusiveEndDate` helper in `toGoogleEvent` that adds one UTC day before sending to Google, so a single-day event no longer appears to end the day before in Google Calendar

## 2026-03-12 - version 1.2.8

- fixed `fetchIncrementalEvents` in `utils/googleCalendar.js` not handling pagination: full syncs on calendars with many events return multiple pages via `nextPageToken`; only the final page carries `nextSyncToken`, so without pagination the stored sync token was always `null`/`undefined`, causing every subsequent webhook to trigger another full re-sync — deletions and updates from Google Calendar were never seen; now follows `nextPageToken` in a loop until `nextSyncToken` is returned, accumulating all items across pages

## 2026-03-12 - version 1.2.7

- fixed concurrent webhook processing race condition in `routes/googleWebhook.js`: when Google fires multiple push notifications in rapid succession (e.g. during initial sync flood), two handlers for the same user would both read the same `sync_token`, the second fetch would get a 410 Gone (token already consumed), trigger a full re-sync, and any deletions in the batch would be lost; added `enqueueForUser` — a per-user promise chain that ensures only one webhook handler runs at a time per user while different users still process concurrently

## 2026-03-12 - version 1.2.6

- fixed Railway cron job conflicting with main server: both services share the same `railway.json`, so setting `startCommand` to `node utils/renewWatchChannels.js` broke the main server (502 on all routes); replaced with a `start.js` entry point that checks `RUN_CRON=true` env var — cron service gets that variable set in Railway dashboard, main server runs `server.js` as before
- added 30-second `AbortSignal.timeout` to all `fetch` calls in `utils/googleCalendar.js` so a hung Google API response no longer causes the cron job to run indefinitely
- added `console.log("[renewWatchChannels] starting")` and a 10-second `query_timeout` on the DB query in `utils/renewWatchChannels.js` to surface hangs earlier

## 2026-03-12 - version 1.2.5

- fixed `COLOR_MAP` in `utils/googleCalendar.js`: previous hex values did not match the actual `EVENT_COLORS` used in the frontend, so almost every event fell back to blueberry "9"; map now keyed by the real event color hex values (`#3b82f6`, `#10b981`, `#f59e0b`, `#ef4444`, `#8b5cf6`, `#ec4899`, `#14b8a6`, `#f97316`)
- fixed `GOOGLE_COLOR_TO_HEX` reverse map in `routes/googleWebhook.js` to match, so colors round-trip correctly when Google-side changes are pulled back in
- fixed timestamp race in webhook handler: when we push an edit to Google, Google fires a webhook back almost immediately with `item.updated` slightly after our `updated_at`; the old `<=` comparison treated this echo as a real inbound change and wrote Google's version back, flipping `sync_source` to `'google'`; now uses a 10-second buffer (`SYNC_BUFFER_MS = 10_000`) so only genuine Google-side changes (made more than 10s after our last write) are applied

## 2026-03-12 - version 1.2.4

- added `registerWatch(userId)` and `stopWatch(userId)` to `utils/googleCalendar.js`; `registerWatch` POSTs to the Google watch endpoint with a 6.5-day expiry, stores the channel info via `updateChannelInfo`, then runs a full initial sync to bootstrap the sync token; `stopWatch` swallows all errors since a 404 from Google just means the channel already expired
- replaced the stubs in `routes/google.js` with real imports from `utils/googleCalendar.js`
- added `utils/renewWatchChannels.js`: queries `google_auth` for rows with `channel_expiry` within 24 hours, stops each old channel then re-registers; failures per user are logged and skipped so one bad token doesn't block the rest; has a `require.main` block so it can be run directly with `node utils/renewWatchChannels.js`
- no `setInterval` added to `server.js` -- renewal runs as a Railway cron job (`0 6 * * *`) to survive deploys; the comment in `server.js` already documents this
- added Google Calendar env vars to README (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_STATE_SECRET`, `GOOGLE_WEBHOOK_URL`, `FRONTEND_URL`) with notes on the webhook URL needing to be publicly reachable and ngrok for local testing
- documented the Railway cron job setup in README (command, schedule, shared env vars)

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
