# Changelog

## 2026-02-21 (pt. 2)

- `server.js` — fix wrong param name `_req`
- `routes/gallery.js` + `utils/db.js` — gallery delete was calling delete before checking ownership. added `getGalleryItemById`, fetch the record first, check owner, then delete
- `routes/db.js` — add auth check to marker delete
- `init.sql` — added missing `gallery`, `med_journal`, and `feedback` table definitions; deploys were hitting runtime errors on those routes
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
