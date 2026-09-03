# Changelog

## 2026-09-02 - version 5.1.0

- **ZeroProof pulls real lines behind a swappable provider.** The Odds API v4 client normalizes h2h/spread/total to american prices; a fixtures provider replays a captured MLB/EPL/NFL slate with zero vendor credits, so dev, test, and seeding never spend quota. The vendor hides behind one `OddsProvider` interface, so it's swappable — and a dead vendor or exhausted quota surfaces as an error, not a silently empty slate that reads as "no games today".
- **Odds are snapshotted on every pull, never overwritten.** `syncOdds` upserts each event by `provider_key` and appends one `zeroproof_odds_snapshots` row per market, so the latest line and (later) the closing line are both readable from history. A `zeroproof-odds-sync` cron runs it; the provider is chosen explicitly by env — fixtures by default so no key is needed — and logs which one actually ran.
- **`GET /api/zeroproof/events` serves the lobby from the DB only.** Upcoming games with their latest lines, public so the slate renders for signed-out visitors, and user traffic never touches the vendor — quota stays a worker concern, not a scaling one.

## 2026-09-02 - version 5.0.0

- **ZeroProof gets its money foundation: a double-entry ledger and wallets.** A major bump because this opens a whole new product surface, not because anything broke — every existing route is untouched. This is the base of a stacked build for a no-loss betting product where the ledger is real but the dollars are simulated. Every movement is a set of lines that nets to zero across `user`/`escrow`/`house` accounts, and a wallet's bettable balance is never stored — it's derived from its `user`-account lines. I built it this way on purpose: it's the one decision that's expensive to reverse, and doing it double-entry from row one is what lets the fake-money MVP become real money later without a rewrite.
- **`/api/zeroproof/wallets` opens a Season or Challenge wallet and lists them.** Season takes any deposit at a $20 floor; Challenge is forced to $100 no matter what the body asks for. Opening a wallet writes its deposit pair in one transaction. A partial unique index enforces one active wallet per mode per user, so a Challenge retry can't run beside a live one and a race can't slip two past the app check — a second open returns 409.
- **Namespaced under `zeroproof_*` and `/api/zeroproof/*`** rather than the plan's bare `/api/wallets`, since this API is shared across many features and the bare names would collide. Tables are keyed by `user_sub` with no FK to `users`, matching the card-economy convention; the ledger's `bet_id` is a nullable column with no FK yet, waiting on the bets table in the next slice.

## 2026-09-02 - version 4.16.3

- **A vitals cell now needs enough samples before it's shown as a score.** The by-page table computes a P75 per metric, but the only floor on how much data backs a cell was a per-*page* one that counted every metric together. A page could clear it while one metric had three samples — and a P75 over three samples is two slow phones and a guess, shown on the dashboard as a real Poor-band score. That's what `/research` hit: a CLS of 0.716 off a sample count too small to trust, while the same page's LCP/FCP/INP read fine. `getByPage` now applies a per-metric floor (`MIN_METRIC_SAMPLES = 10`) as a `HAVING COUNT(*)` on the grouped metric, so the cells with real data stay and only the thin ones drop — rendered as `--`, the same as any absent metric. The page floor rose from 5 to 10 to match. Summary and by-version are untouched: summary aggregates across every page so it's never sample-starved, and by-version compares releases on purpose. The floor is a pure, unit-tested `metricSampleFloor` builder, with the drop exercised against real Postgres. This is the next layer of the 4.12.2 de-noising — small-N cells rather than impossible values.

## 2026-08-31 - version 4.16.2

- **The ingest stops re-learning the same outage twenty-two times.** The first successful run took 2m34s: with TCGdex's North America node dead, every one of the 22 requests spent three attempts and two backoffs on the published address before falling back to a node that answered. The run now remembers the node that worked and goes straight there for the rest of it, so only the first request pays that cost — roughly seven seconds instead of two and a half minutes of waiting to fail the same way.
- **It is remembered per run, not persisted.** Every run re-checks the published address, so the day TCGdex fixes its GeoDNS we notice and go back to using it. If a remembered node stops answering mid-run the job says so and starts over from the published address rather than quietly giving up on the request.

## 2026-08-31 - version 4.16.1

- **The fallback I shipped yesterday never worked.** Its first production run logged `fallback node failed too ... error: Invalid IP address: undefined` against both nodes. Node calls a custom `lookup` two different ways: with `all: true` it wants an array of `{address, family}`, otherwise `(err, address, family)`. Since Node 20 `autoSelectFamily` is on and `net.connect` asks for `all`, so answering only the second way puts `undefined` into the socket. `fixedLookup` now handles both shapes and is exported so the shape — the entire difficulty — is pinned by tests rather than by hope.
- **I had explicitly declined to test that path**, on the grounds that mocking `node:https` would only assert the mock works. That was true and it was still the wrong call: the bug landed in the one piece of novel code with no coverage. The lookup's call shapes are pure logic and testable without a socket, and the whole path was verifiable by running it against a real node — which now returns 200 and 21 series, and which reproduces `Invalid IP address: undefined` exactly when reverted.
- **The existing failure-path tests were passing because the fallback was broken.** With it fixed they began making real network calls to TCGdex, so the suite now clears `TCGDEX_FALLBACK_IPS` in `beforeEach` and the fallback tests opt in. A test that reaches the internet to prove a failure is not testing the failure.

## 2026-08-31 - version 4.16.0

- **The catalog ingest can reach TCGdex again when their GeoDNS cannot.** Their North America record points at a node that refuses connections, and every environment we deploy on resolves as North America, so the first production run died with `fetch failed`. This is not a blip to wait out: their maintainer closed the report (tcgdex/cards-database#2293) with "na is experiencing outages, we cant just drop a node like that". After the published address fails, the job now retries against nodes that do answer, using `node:https` with a fixed `lookup` — the URL still drives SNI and certificate validation, so this is curl's `--resolve`, not a way of skipping the checks, and it needs no new dependency.
- **It only engages after the normal path has already failed, and says so every time.** If the North America node recovers we go straight back to using it, and a fallback that went unmentioned would quietly turn someone else's outage into our permanent configuration. `TCGDEX_FALLBACK_IPS` overrides the built-in list, or switches it off entirely when set empty — addresses move, and this one should be data rather than something that needs a deploy to correct.

## 2026-08-30 - version 4.15.2

- **The catalog ingest now says what went wrong.** Its first production run failed with `cron job "ingest-tcg-catalog" failed: fetch failed` — Node's word for every network problem, naming neither the URL nor the reason, so a DNS failure and a refused connection log identically. Errors now carry the URL and whatever `cause.code` undici attached, and the top-level failure states plainly that the stored catalog is unchanged, so nobody goes looking for a half-written one.
- **And retries the failures worth retrying.** Three attempts with a short backoff for network errors and 5xx; a 4xx breaks out immediately, since asking again only makes the log longer. This job exists because TCGdex is unreliable, so treating the first blip as final was the wrong default — though it deliberately does not paper over an outage, where a quick clear failure that leaves yesterday's catalog serving is the right outcome.

## 2026-08-30 - version 4.15.1

- **A new Railway service crashed waiting for `host.docker.internal`.** The image's `CMD` wrapped the entrypoint in wait-for-it against `${DB_HOST:-host.docker.internal}`, a local-development address. Any hosted service that doesn't set `DB_HOST` — which is every one of them — waits 15 seconds for a host that cannot exist and then crashes, reporting a Docker address that sends you to look at entirely the wrong thing. Nothing needed the wrapper: docker-compose gates the app on the database's healthcheck, and `scripts/start.sh` already does its own bounded `pg_isready` wait using `DATABASE_URL`, which is the variable that actually says where the database is. The `CMD` is now just the entrypoint.
- **The cron setup docs named the wrong start command.** All three cron sections said `node start.js` "from `railway.json`", but `railway.json` runs `bash scripts/start.sh` — which is the file that skips migrations when `RUN_CRON=true` so a cron container cannot race the web container for the knex lock. Following the README literally would have overridden that and had every cron try to migrate. Corrected in all three.

## 2026-08-30 - version 4.15.0

- **A local mirror of the TCGdex catalog, so the lists stop rendering from a slow third party.** New `tcg_series` / `tcg_sets` tables (migration `028_tcg_catalog.ts`), an `ingest-tcg-catalog` cron job, and a public `GET /api/tcg/catalog`. paul-explore's set lists were fetching every series and then each one individually at render time; that fan-out timed out `next build` (60s per page, three attempts, then the export dies) and at request time produced an empty list that ISR cached for a day — which reads as data nobody has updated rather than as an outage. Doing the fan-out on a schedule moves it somewhere slowness is free.
- **The ingest is built to fail safe.** It assembles the whole catalog before writing any of it and commits in one transaction, so a serie that will not fetch leaves yesterday's catalog serving rather than half of two. It upserts and never deletes, because a set missing from a response is far likelier to be a bad response than a real deletion. An empty series list is refused outright for the same reason. Every field TCGdex fills in late — card counts, logos, symbols — is nullable and stored as null rather than zero, since "0 cards" is a lie a just-announced set does not deserve.
- **The endpoint reports its own freshness.** `updatedAt` rides along so the UI can say how current the catalog is instead of implying it is live, and a never-ingested catalog answers 200 with no series rather than an error — "nothing ingested yet" and "upstream is down" have to stay distinguishable at the other end, since conflating them is exactly how this outage passed for stale data.

## 2026-08-30 - version 4.14.2

- **Wrote down why renaming a migration broke staging.** The duplicate-number guard added in 4.14.1 explains the collision but not the expensive half: knex validates that every recorded migration still exists on disk, so renaming one that has already run makes it refuse to run anything — "the migration directory is corrupt, the following files are missing" — and recovering needs a hand-written `UPDATE knex_migrations SET name = ...`. The 025 → 027 rename was checked against production, where it had not run, and still broke staging on the next deploy, because staging tracks develop and had already run it. The comment now says that the question is not whether a migration has been released but whether any environment has run it.

## 2026-08-30 - version 4.14.1

- **Two migrations were both numbered 025.** `025_check_in` and `025_draft_adjustments` landed from branches cut at the same time and nothing checked, so the order between them was decided by alphabetical chance rather than by the number that is supposed to mean it. The check-in one is renumbered to `027_check_in` — safe only because it has not been released, since knex keys its migrations table on the filename and renaming one that has already run in production makes it run again. A new guard in `migrationSafety.test.ts` fails on any repeated sequence number, which is the part that stops this recurring.

## 2026-08-30 - version 4.14.0

- **Volunteer arrival check-in.** New `check-in` module behind `/api/check-in`: sites owned by an organizer, a rotating six-digit code per site, and the arrivals volunteers record by typing it. The code is derived rather than stored — HMAC over `CHECKIN_CODE_SECRET` and the site's salt for the current 120-second window, truncated the way TOTP does it — so no database dump yields a working code, and an unset secret fails closed instead of deriving one from an empty key. Verification accepts the current and previous window (typing takes time) and nothing older. Three things make the code worth trusting: a unique `(site, volunteer, window)` means a repeat submit returns the first arrival rather than a second, five wrong guesses per volunteer per window is the ceiling and it is checked *before* the code is compared so a throttled caller learns nothing, and ownership lives in the WHERE clause so someone else's site reads as missing rather than forbidden. Migration `025_check_in.ts`; 27 tests covering the window arithmetic, replay, cross-site codes, the ceiling, and ownership.
  - Known limit, stated rather than implied: a code photographed and passed to someone off-site works until it rolls over. The 120-second window narrows that to a live accomplice; closing it properly needs NFC or hardware attestation, not a longer code.

## 2026-08-30 - version 4.13.3

- **Daily adjustment refreshes no longer duplicate a player.** The dedup key was `(player, category, batch_date)`, so re-reporting the same injury under a new date added a row per day — a player piled up duplicates in the approval list. Migration `026` narrows the key to `(player, category)`, collapsing existing duplicates first (keeps the most recently touched row, preserving any approve/reject), and the upsert now updates that one row's fact and date in place while leaving status untouched. Verified against real Postgres, including that an approved/rejected status survives a refresh.

## 2026-08-28 - version 4.13.2

- **Adjustments write preflight now passes CORS.** 4.13.1 added CORS at the router level, but the global allowlist policy runs first and answers the `OPTIONS` preflight itself for a non-allowlisted origin — a 204 with no `Access-Control-Allow-Origin` — so the extension's PATCH/POST (approve/reject/push) were still blocked while GET worked. The permissive policy for `/api/fantasy/adjustments` now runs in `app.ts` *before* the global cors, so it owns the preflight. Regression test reproduces the ordering bug.

## 2026-08-28 - version 4.13.1

- **Draft adjustments API sends CORS for the extension.** The Draft Lab board calls `/api/fantasy/adjustments` from its own `moz-extension://` page, whose per-install UUID origin the global allowlist can't enumerate, so reads were blocked (200, but no `Access-Control-Allow-Origin`). These requests are non-credentialed — public reads, custom-header token for writes, no cookie — so the resource now sends a permissive origin scoped to just these routes, and answers the preflight the token header triggers.

## 2026-08-28 - version 4.13.0

- **Draft Lab valuation adjustments.** New `/api/fantasy/adjustments` resource backing the extension's sourced injury/depth-chart/coaching layer: `GET` (public, status-filtered) for the approval UI, `PATCH :id` and `POST` batch guarded by a shared secret (`DRAFT_ADJ_SERVICE_TOKEN`) with no user-auth fallback. Migration `025_draft_adjustments` adds the table with a `(player_name, category, batch_date)` dedup unique index, so a daily research re-run upserts the fact and never reverts an approval — verified end to end against a throwaway Postgres, including that a conflicting re-insert leaves an `approved` status untouched. A seed script pushes the first batch and is the template the daily refresh reuses. 8 route/controller/write-auth tests.

## 2026-08-24 - version 4.12.2

- **The Web Vitals dashboard kept flagging Poor-band LCP/FCP that no real user sees, and the cause was here, not on the pages.** The P75 was computed over the whole `web_vitals` table, all-time, with no value bound — so one impossible sample (a background-tab load reported as a multi-minute LCP) was a permanent member of the percentile and could never age out. Two fixes: the summary and by-page views (the "current health" the dashboard and the alert read) now aggregate a rolling 28-day window, while by-version keeps full history to compare releases; and every value is bounded to a per-metric plausible range (timings ≤ 60s, CLS ≤ 10) both at ingest (a 400, so garbage never enters) and inside every aggregate (so existing garbage stops dragging the percentile). The window and value fragments are pure, unit-tested builders, with the SQL exercised against real Postgres in CI.

## 2026-08-23 - version 4.12.1

- **Card packs accept NFL cards.** The `tcg` pack-open validator only allowed `nba` and `wnba`, so ripping an NFL pack failed with a 400 ("Invalid enum value … received 'nfl'"). The sport enum now includes `nfl`, matching the three leagues the Card Lab generates. Added a regression test that an NFL card is accepted.

## 2026-08-22 - version 4.12.0

- **Backend for the Fantasy TCG economy.** New `tcg` module at `/api/tcg`, so the Card Lab in paul-explore can finally keep what people own: a coin wallet and the cards they've pulled, both scoped by Auth0 `sub`. Four endpoints, all behind `checkJwt`: `GET /wallet` (balance), `POST /wallet/claim` (a daily coin grant, idempotent per UTC day so a double-tap can't double-grant), `POST /packs/open` (spend coins to record a drawn pack — cost is server-authoritative, and it answers 402 rather than record a pack nobody paid for), and `GET /collection`.
- **Two tables via migration `024_card_economy`.** `card_wallets` (one row per user: balance + last claim date) and `card_pulls` (each pulled card, contents denormalised so the collection renders without regenerating from ESPN). Both keyed by `user_sub` with no FK to `users`, matching the `nba_playoff_brackets` pattern, plus a `(user_sub, pulled_at)` index for the newest-first read. The claim and pack-open both run in a transaction so the balance can't drift.
- The weighted pull odds live in paul-explore's card engine (`RARITY_META.pullWeight`); this side owns the wallet and the collection. Tested with supertest against a mocked repo — auth-scoping, the 402, and body validation.

- **Operator finance read negative on every week, and it was the seed, not the math.** The payout model charges a platform fee per machine per week whether or not the machine sold anything, which is how a real vending contract works. The demo seed did not sell enough to cover it: a flat 60 sales per store spread across 18 months put roughly six transactions a week in front of the whole fleet, against $672 of platform fees over the eight-week window. Every week netted below zero and the headline card sat red. Reproduced it exactly by bucketing the seed the way `weeklyGrossBuckets` does and running `buildFinance` over it: gross $253, fees $686, net -$432. Nothing in the arithmetic was wrong.
- **Sales are modelled per machine per day now, because that is the number a fee per machine per week has to be weighed against.** A flat lifetime count hides the thing that matters, which is how busy a machine is on a given day. The seed runs at ~12 transactions per machine per day, scaled by how busy the location is — a main-lobby fridge and a cafeteria unit outsell a gym or a parking-garage kiosk — and jittered per day so no two weeks come out identical. Over the same eight weeks the fleet now grosses about $32k against the same $672 of platform fees, nets ~$29.7k, and the platform cut lands at ~2% of gross, which is what that line should look like. The 540-day history stays, so the day/week/month/year analytics still have depth behind them.
- **A guard so it cannot quietly go negative again.** `finance-seed.test.ts` builds the seed, buckets it the way the endpoint does, and asserts the fleet nets positive, that platform fees stay a minority of gross, that no recent week is empty, and that all of that still holds as the reseed date moves across the year. This is the check that was missing: the old parity tests pinned the formula, and the formula was never the problem.
- **The sales insert batches now.** A realistic fleet seeds ~43k sales, and Postgres caps a statement at 65,535 bind parameters — eight columns a row put that ceiling near 8k rows, so one `INSERT ... VALUES` would have thrown. The seeder chunks sales into 1,000-row batches inside the same transaction. The daily reseed job re-anchors every timestamp to its run time, so the fix holds as calendar time moves rather than aging back out of the window.

## 2026-08-16 - version 4.11.5

- **sharp and ffmpeg no longer load on every boot.** This service scales to zero, so a cold start sits on a real user's critical path, and it was importing two native media libraries to serve requests that overwhelmingly never touch an image. They are imported at the point of use now: the app's module graph drops from 1,218 modules to 1,149, and importing the built app goes from 266-269ms to 244-251ms across six runs each.
- **The first attempt changed nothing, which is the part worth writing down.** The note I left on the last release named `mediaProcessor` as the eager path, so I made that lazy, rebuilt, and the timings did not move. Checking the module cache rather than the clock showed why: `mediaProcessor` and ffmpeg were gone, and sharp was still there — imported directly by the gallery and profile controllers, which the note never mentioned. A measurement that only watches the total tells you whether you won, not whether you fixed the thing you meant to.
- The MIME allowlists and the processed-media types moved into `mediaTypes.ts`. They are a Set of strings and two interfaces, and leaving them in the processor meant a caller that only wanted to check whether a file was a video pulled a native image library in behind it. The barrel deliberately stops re-exporting the processing functions for the same reason: a barrel export is eager, so one import of it for a logger would have undone the whole change.
- On-demand costs 52ms on the first media request, measured, and nothing after. That is the trade: a cost paid once by uploads, instead of on every cold boot by everyone.

## 2026-08-16 - version 4.11.4

- **Three quarters of the cold-start weight was ffprobe binaries for platforms this service cannot run.** `ffprobe-static` ships a prebuilt ffprobe for six platforms inside one tarball — linux x64 and ia32, darwin x64 and arm64, win32 x64 and ia32 — and this runs on linux/x64 only. It was 335 MiB of a 423 MiB tree. `@ffprobe-installer/ffprobe` is a 10 KB wrapper that resolves one platform package through `optionalDependencies` carrying `os` and `cpu` fields, so pnpm installs only the platform being installed on. CI goes from 443,101,142 bytes across 331 packages to `170,541,700` across `332`, a 61% cut; the arm64 Mac reading goes from 463,447,543 to `190,888,101`. Both platforms shed exactly 272,559,442 bytes, which is the sort of agreement that suggests the measurement is measuring what I think it is. I checked that on real linux in a `linux/amd64` container rather than inferring it from a Mac: `node_modules/.pnpm` holds `@ffprobe-installer+linux-x64` and nothing else. It also ships its own types, so the hand-written shim in `src/types/vendor.d.ts` went with it.
- **Finding that out meant finding that video uploads have been broken.** pnpm 10 will not run a dependency's build script unless the package is named in `pnpm.onlyBuiltDependencies`. Nothing was. `ffmpeg-static` downloads its binary in a postinstall hook, so `require('ffmpeg-static')` returned a path with no file at it, on my laptop and in the Docker image alike — and `node:22-bullseye` never installs ffmpeg either. Every upload that hit `processVideo` would have failed at the thumbnail step. The same rule would have broken the ffprobe swap on its way in, because `@ffprobe-installer/linux-x64` chmods its binary executable in a postinstall and without the allowlist it lands mode 644 and spawns as permission denied. Both platforms this actually runs on are listed now, plus `ffmpeg-static`; adding a deploy target means adding its entry.
- **The reason nobody noticed is that no test had ever run either binary.** `processVideo` is the only code here that shells out to a native executable and it had no test at all — every suite that touches the media pipeline mocks the module away, and a mock cannot catch a missing binary. There is now a real one: a 1.8 KB, 64x48, one second clip committed as a fixture, probed and thumbnailed for real. Non-square on purpose, so a transposed width and height fails rather than passing by symmetry. It failed with `spawn ffmpeg ENOENT` before the allowlist, which is the whole reason it is worth having.
- **Budgets in `ci/dependency-weight.json` come down from 500 MB to 210 MB.** A budget left at its old ceiling after a 260 MiB win has stopped measuring anything. `packageCount` deliberately stays at 360, because it is the one number this work pushed the wrong way: one fat package became a wrapper plus one platform package, so the count went up by one while the bytes fell by 260 MiB. That is the trade behaving as intended, and it is the argument for gating two proxies rather than one. I also corrected a claim in that file that turned out to be aspirational. It said the real image was larger than the measured number by roughly the ffmpeg binary; in fact the download had never run, so the understatement was zero and the binary was simply absent. Now that it downloads, the gap is real and about 80 MB, and the file says so.

## 2026-08-15 - version 4.11.3

- **A size guard that measures what this service actually makes people wait for.** paul-explore just gained a gzipped first-load-JS budget, and the tempting move was to mirror it here. It would have been worse than nothing: this service ships no browser bundle, so the number would have gone red or green for reasons no user could feel, and a gate nobody believes gets raised rather than fixed. What costs a user here is cold start — `fly.toml` sets `min_machines_running = 0`, so a full boot sits on the critical path of somebody's first request. `pnpm deps:weight` measures the two things that drive that boot and can be measured honestly: the bytes of a production-only install (443,101,142, or 422.57 MiB, on CI) and the number of resolved production packages including transitives (331). Budgets in `ci/dependency-weight.json` at 500 MB and 360, with the reasoning and the caveats written next to the numbers.
- **It is a proxy, and the file says so rather than implying otherwise.** Dependency weight correlates with cold start; it is not cold start. The distinction matters because paul-explore's budget measures the bytes a browser genuinely waits on and this one does not, so pretending they are the same check would quietly overstate what this one proves.
- **Reproducible on purpose, which ruled two things out.** The measurement pins `supportedArchitectures` to linux/x64 and runs with `--ignore-scripts`, so ffmpeg-static's network download is excluded and the figure is a known understatement of the deployed image rather than a number that moves with whoever ran it. Boot wall-clock is not gated at all: importing the built app takes 268-294 ms on an idle laptop, and that spread is far wider on a shared runner. A guard that flakes gets ignored, so that one stays a hand measurement.
- **The pin narrows the platform gap rather than closing it, which I only found by running it on CI.** I had assumed pinning made the figure identical everywhere and wrote that down; CI then measured 443,101,142 bytes across 331 packages against my Mac's 463,447,543 across 333. pnpm can only filter by libc when it is running on that libc, so off linux it keeps both the glibc and musl sharp builds. Each host is byte-identical run to run, the two are about 20 MiB apart, and the local reading is the higher one — so a laptop run that passes cannot be a CI run that fails. The budget file states that instead of the tidier thing I first believed.
- **The arithmetic is unit-tested, the install is not.** Compare-and-format live in `src/shared/deploy/dependencyWeight.ts` and are fed fixtures; the script is the IO shell around them. A budget with no matching measurement throws rather than being skipped, because a check that silently drops an input keeps reporting green after it stopped watching anything. Runs as its own CI job instead of a step on build — it reads the lockfile, not `dist/`, so a broken `tsc` has no business hiding that the dependency tree got heavier.
- **The one number worth staring at**: `ffprobe-static` is 335 MiB of the 423, because it ships prebuilt binaries for every platform in its tarball. Three quarters of this budget is a single dependency, and replacing it is the only change that would meaningfully move the figure.

## 2026-08-15 - version 4.11.2

- **One junk `app_version` row can no longer 500 the vitals dashboard.** The major and minor filters cast `split_part(app_version, '.', 1)` to int guarded only by `!= 'unknown'`, and the version sorts cast the whole string to `int[]` with no guard at all — so a single `"dev"` row turned `/versions` and `/by-version` into 500s for every caller, and any major/minor query with it. Both paths now share a `SORTABLE_VERSION` regex gate, and a non-numeric `?v` matches nothing and returns 200 empty, which is what this module already did for a junk `?v` without a mode.
- **The changelog is a gate again.** This file sat at 4.2.1 while the service shipped 4.11.1 — nine releases recorded only as version bumps in diffs. A test now fails any bump that lands without a matching entry here, the same guard paul-explore carries for the same reason. The gap between 4.2.1 and this entry stays a gap on purpose: back-filling nine releases from git archaeology would present reconstruction as record.

## 2026-08-05 - version 4.2.1

- **Documented the operator demo re-seed cron.** The job has existed since the operator work landed, but nothing wrote down how to run it, and it needs its own Railway cron service — a service carries one schedule and one `CRON_JOB`, so it can't share the feature-flags reset's. The README now covers the source and start command, the `0 4 * * *` schedule, the four variables, and the two things that bite: setting those vars project-wide boots the *web* service into cron mode, and `NODE_ENV=production` is required for SSL against the Railway Postgres. Also spells out that the job wipes and re-inserts the `operator_*` tables, so anything a visitor changed is reset — paul-explore says as much on the dashboard.

## 2026-08-04 - version 4.2.0

- **Five fleet aggregation endpoints for the operator dashboard.** `GET /api/operator/planner/benchmarks`, `/product-performance`, `/shrink-summary`, `/search-index` and `/finance` — the SQL behind five features that paul-explore had only ever computed from its in-memory seed. Each is a read, open like the other operator reads, aggregated in the database rather than by pulling rows into Node: benchmarks and finance sum sales in one grouped query, product performance groups by product within a day window, shrink joins completed restock lines to their store and item price, and search returns stores plus distinct products. The response shapes match paul-explore's Zod schemas exactly, so the BFF's live path validates without drift and falls back to the seed only when this service is unreachable.
- **The fee model is duplicated on purpose.** Finance nets each week after the same transaction and platform fees the location planner projects with (`4% + $0.10` per transaction, `$60`/unit/month), defined here rather than shared across a package boundary — the same tradeoff the promotion arithmetic already makes across the two repos. The number the planner quotes and the number finance pays out are the same by construction.
- **Pure helpers, mocked-repo tests, and SQL smoke.** The aggregation math lives in a pure `aggregations.ts` mirroring paul-explore's models, unit-tested with hand-checkable numbers; the endpoints are tested through the controller with a mocked repository; and the five new SELECTs are added to the SQL-smoke tier that runs against a real Postgres when a `DATABASE_URL` is present.
- **The seed now ships completed restock history, so shrink isn't blank in production.** The shrink endpoint reads completed restock counts, and the demo seed had none — only stores, inventory, sales and alerts — so `/shrink-summary` returned an honest but empty page against the real backend while the app's own seed showed rich data. The seed builder now generates a couple of completed sessions per store, mirroring paul-explore's `buildRestockHistory` (a shortfall, a reasoned removal, a skipped count, a clean count, scaled per store), and the seeder inserts them in FK order. Two tests pin that the seed carries completed sessions and real unexplained shrink to reconcile.
- **A cross-repo parity guard against the duplicated math.** The aggregation formulas exist in both repos, and only the heavy live-backend E2E would have caught a drift. A new `parity.test` asserts the fee model and the four formulas (benchmarks, product-performance category index, shrink split, weekly net) against canonical scenarios whose expected outputs are identical to paul-explore's twin test — so a formula change in either repo fails fast against the shared expectation.

- **Web Vitals reads are public now.** `/api/vitals/summary`, `/by-page`, `/by-version`, and `/versions` drop `checkJwt`. They return site-wide, non-personal P75 aggregates — there was never anything account-specific in them — and paul-explore is making its Web Vitals dashboard public, so an anonymous visitor's request has to reach the real numbers instead of a 401. Ingestion (`POST /api/vitals`) is unchanged: still open, still rate-limited. Same reads-public, writes-gated shape the feature-flags module already uses.

## 2026-08-03 - version 4.0.0

**Major, because deploying this needs more than a pull.** Writes to every operator endpoint now require `OPERATOR_SERVICE_TOKEN` to match the value paul-explore holds, and migrations 016-018 must be applied. Neither fails loudly on its own — a mismatched token presents as a baffling partial outage where reads work and nothing saves, and a missing migration 500s the aggregate endpoints — so this is flagged as major to make the deploy checklist unmissable rather than because a route signature changed.

- **Rate limits are keyed per visitor, not per egress IP.** Every operator request arrives from paul-explore's server, so limiting by IP put the entire internet in one bucket and one caller in a loop could have started returning 429s to everyone else. `createKeyedLimiter` now prefers the forwarded visitor id, falls back to the authenticated subject, and only then to IP. That order matters: a self-asserted header is fine to key fairness on precisely because `requireServiceToken` already decides who may write at all, so this never has to resist an attacker — it has to tell honest callers apart.
- **The audit trail records who acted instead of a constant.** All four hardcoded `operator@smartstore.example` actors are gone, replaced by `actorOf(req)`: a real subject when the caller signed in, `anonymous:<visitor>` when they did not, deliberately prefixed so nobody mistakes it for a username, and `unidentified caller` when there is nothing at all. Two restock sessions sharing an actor are the same browser, which is a genuinely useful fact about a shift; the old constant looked like an answer and was not one.
- **Fixed an IPv6 rate-limit bypass in the new key generator.** express-rate-limit rejected it at boot: the last-resort branch used `req.ip` directly, and an IPv6 user is typically handed a whole /64, so varying the low bits would have minted a fresh budget every request — the exact bypass the limiter exists to prevent. It now goes through `ipKeyGenerator`; IPv4 is unchanged, and a forwarded visitor id or authenticated subject never reaches the address branch at all. Worth noting how it surfaced: not from a test, but from starting the server. Every test either mocks the limiter or never constructs it, so a boot-time validation error was invisible to all 271 of them.
- **`optionalCheckJwt` on the operator router.** A signed-in caller is identified, an anonymous one passes through, and the public demo keeps working without an account. The plumbing that carries identity now exists end to end, which turns "add real operator logins" from a redesign into a small change.

## 2026-08-02 - version 3.10.0

- **Added the per-store sales endpoint, which never existed.** `GET /stores/:storeId/sales` was called by the frontend's Sales and Tax tabs and had no implementation here, so those calls 404'd, the BFF fell through to its in-memory seed, and the seed is keyed by seed ids so it had nothing to say about a real store UUID. Both tabs rendered empty against the live backend while looking perfectly healthy against fixtures, which is why it went unnoticed for so long: the fallback that makes the demo resilient is the same thing that hid a missing endpoint. `occurred_at` is called `timestamp` on the wire, matching alerts and activity.

## 2026-08-02 - version 3.9.1

- **Fixed two aggregate queries that no database would accept.** Making the time buckets timezone-aware left `salesByPeriod` and `alertHourlyTrend` repeating an interpolated expression in their `GROUP BY`. Drizzle re-emits a `sql` fragment with fresh parameter numbers each time it is used, so the GROUP BY copy read `$5/$6` where the SELECT read `$1/$2`, Postgres compared the two parse trees, decided they were different expressions and rejected both queries for selecting an ungrouped column. Both now group and order by ordinal, which sidesteps the comparison entirely. The symptom in the app was `/fleet-summary` returning 500, the frontend silently falling back to its seed, and every store card showing 0% inventory health because the seeded summaries were keyed by seed ids while the store list came back with real UUIDs.
- **Added SQL smoke tests that run against a real database.** Every other test in this module mocks the repository, which is why the broken queries were invisible: a mocked repository will happily return rows for SQL Postgres would reject. These execute the real statements across several timezones and granularities when `DATABASE_URL` is set, and skip when it is not, so CI is unchanged. All of them are SELECTs, because a developer's `DATABASE_URL` often points at the deployed database.
- **Alerts are derived from each store's own data instead of a fixed list.** Every store was stamped with the same four alerts, so a store with a full shelf still reported "Turkey Club Sandwich out of stock" and a store sitting at 4C still warned it had reached 8.2C. Low-stock and out-of-stock alerts now name products that genuinely are low or empty in that store, the temperature warning is only raised when the store is actually above threshold and quotes its own reading, and door-ajar stays because it describes an event rather than a claim about current state. Five tests assert an alert can never contradict the row it describes.

## 2026-08-02 - version 3.9.0

- **Operator writes now require a shared secret only paul-explore's BFF holds.** Reads stay open because the dashboard is a public demo and anyone should be able to click around it. Writes were open too, which meant anyone could point curl at the API and mutate the data directly, going around the app. User auth via `checkJwt` was the wrong tool for that: it would 401 every restock coming from the demo and the frontend would fall back to its in-memory seed, which is the fiction the last three releases removed. A service credential closes the direct-write hole without touching visitors, because the BFF calls these endpoints server-side on their behalf. `requireServiceToken` compares in constant time after a length check, and is a deliberate no-op when `OPERATOR_SERVICE_TOKEN` is unset so a fresh clone and local dev keep working — with no secret configured there is nothing to forge. What this does **not** do is identify anyone: it authenticates the service, so the restock audit trail's actor is still a constant, per-user rate limiting is still impossible, and anyone who obtains the secret has full write access. Those limits and the rotation story are written up in the operator-dashboard notes rather than left implied. 8 new tests, 240 pass.
- **Made the suite hermetic against a developer's own `.env`.** The write guard reads `OPERATOR_SERVICE_TOKEN` at import time, so the moment a real one existed locally every write-route test started returning 401 while CI, which has no `.env`, stayed green. A suite whose result depends on whose laptop it runs on is worse than no suite, so the shared test setup blanks the variable and the one test that cares about the guard sets it deliberately. That test lives in its own file and re-imports the router, because the rate limiters are module-level and would otherwise fight over the same budget. It covers the wiring rather than the middleware: a write without the header is rejected, with it goes through, and reads stay open.

## 2026-08-02 - version 3.8.1

- **Rate limiting, bounded promotion measurement, OpenAPI docs and a dead-code removal on the operator module.** The operator routes had grown to twenty, nine of which write, and none of them were rate limited or authenticated. They stay unauthenticated on purpose for now: the dashboard is a public demo whose whole point is that the writes are real, and putting `checkJwt` on them would 401 every restock from the demo and send the frontend quietly back to its in-memory seed, which is the exact fiction the last three releases removed. What actually bounds the exposure is a limiter, so every route now sits behind one, plus `trust proxy` at one hop so the limiter keys on the real caller rather than Railway's edge. The limits are deliberately far higher than the feature-flags module's (1000 reads and 200 writes per IP per minute) because this traffic does not arrive the same way: every legitimate operator request reaches the API server-side from paul-explore's BFF, so it shares a handful of Vercel egress IPs instead of one bucket per visitor. A single open dashboard polls roughly eight times a minute, so a flags-sized 120/min ceiling would have started 429ing real users at about fifteen concurrent tabs while doing nothing about distributed abuse. This is a runaway backstop rather than per-user fairness, and a behavioural test in its own file confirms the 201st write gets a 429. Auth belongs here the moment there is a real tenant to protect. `salesInWindow` was unbounded: an open-ended promotion left running for a year meant a year-long window, and the baseline doubles the fetch, so measuring it would pull two years of sales to answer one question. `measurementWindow` now clamps to the most recent 180 days and the response reports `measuredFrom`/`measuredTo` plus a note when the clamp applied, since a number quietly measured over a different period than the reader assumes is worse than a smaller one. `repo.restockItems` is gone — nothing had called it since restocking moved to sessions. And the operator module finally has OpenAPI registrations (43 to 55 paths), including a test that the document generates at all, because `zod-to-openapi` throws on some schema shapes and the only symptom is `/api/docs` going down at runtime long after CI went green. 233 tests, lint, typecheck and build clean.

## 2026-08-02 - version 3.8.0

- **Promotions are scheduled objects that measure themselves.** The Pricing tab could model a discount but never run one, so it could predict and never be wrong out loud. Migration `018` adds `operator_promotions`: a row with a window, targeting one product or the whole store. Two deliberate absences — there is **no status column**, because a stored status needs a job to flip it and is wrong in between runs, so `promotionStatus(promo, now)` derives it from the window and the clock; and nothing mutates `operator_inventory.price`, because the discount is applied at read time and the list price survives, which is the number every margin calculation needs. `store_id` is NOT NULL, so a fleet campaign is N rows for now — widening it later is one migration, whereas guessing the grouping semantics today is not. Percent is bounded 1–90: zero is not a promotion and anything near 100 is far likelier to be a typo than an intention. `GET /promotions/:id/performance` compares units and revenue inside the window against an **equal-length baseline immediately before it** (equal length matters — comparing a two-week promotion against the previous month would flatter or punish it purely on duration), filtered in SQL so measuring a fortnight does not drag eighteen months of history into Node. The response carries both raw totals plus a `note` saying in words that it is a before-and-after and **not** a claim the promotion caused the difference; seasonality, a new product on the next shelf and a fridge that was warm for a week all move the same number, and a dashboard that quietly implies causation is worse than one that admits what it is showing. Zero baselines return a null percentage rather than dividing by zero. Creating a promotion finally emits the `price-update` activity type, which has had a label, a colour and an icon since the beginning and had never once been written. Ending a promotion closes it rather than deleting it, since the history is the point. 19 new tests, 226 pass. `pnpm migrate` still owes 016, 017 and now 018.

## 2026-08-02 - version 3.7.0

- **Restocking is an auditable session instead of a single UPDATE.** It used to be `update operator_inventory set current_stock = capacity` plus one activity row reading "Restocked N item(s) to full capacity". That is not a simplification, it is a fiction: it cannot express six yogurts binned because they expired, a sensor reading eight where the shelf held five, or a case damaged in the van — and shrinkage and miscounts are exactly where an unattended-retail operator's margin goes. Migration `017` adds `operator_restock_sessions` and `operator_restock_lines`, one line per product touched, carrying expected, counted, added, removed and a removal reason. `counted_qty` is nullable on purpose: null means the restocker chose to skip counting that slot, which is a recorded decision rather than missing data, and it is what lets a line be classified `matches-expected`, `correction` or `not-counted` — the same distinction Micromart's audit log draws. Inventory is never written directly any more; lines accumulate while the restocker works the shelf and `completeSession` is the one place that touches `operator_inventory`, in a single transaction, deriving `clamp(counted ?? expected + added - removed, 0, capacity)` per item and freezing it on the line. Completing twice is a **409** rather than a no-op, because a double submit from a phone with a flaky connection is the likeliest failure here and applying the adds and removes twice would silently corrupt the shelf. Removal reasons are a constrained enum (`expired`/`damaged`/`other`) rather than free text, since "how much did we lose to expiry last month" is the question the feature exists to answer and free text cannot be aggregated. The legacy one-tap `POST /stores/:id/restock` is **kept but rewritten** to open-and-complete a session internally — deleting it would turn a useful bulk action into a six-step wizard, keeping it un-audited would leave a hole straight through the feature — so its response shape is unchanged for existing clients while quick-fill now leaves the same audit trail. Five new endpoints, 31 new tests, 200 pass. Run `pnpm migrate` (016 and 017 are both still pending).

## 2026-08-02 - version 3.6.0

- **Operator time buckets now resolve in a real timezone instead of UTC.** Every boundary in the module was UTC — `periodStarts` and `fillAlertTrend` did their math with `getUTC*`, and the SQL truncated with a bare `date_trunc(granularity, occurred_at)` that resolved in the DB session zone. That put a Toronto store's day boundary at 8pm the previous evening and a Vancouver store's at 5pm, so the busiest part of an operator's afternoon was filed under the next day. It stayed invisible because the seed data is spread evenly and every store was treated identically. A new `timezone.ts` resolves a store's IANA zone (migration `016` adds a nullable override column, backfilled from `province`, because BC, QC and NU each span more than one zone — NU spans three) and does the wall-clock math with `Intl.DateTimeFormat.formatToParts`, deliberately without a date library: the runtime already carries tzdata, and Luxon or date-fns-tz would ship a second copy on a release cadence we don't control. Formatters are cached per zone since constructing one is the expensive part. The SQL does the `AT TIME ZONE` round trip by hand rather than using `date_trunc/3`, which is Postgres 16 while this project runs 15. `StoreDto` gained `timezone`; `/sales-analytics` and `/fleet-summary` take an optional `tz`, defaulting to UTC so an un-updated client sees exactly what it saw before, and rejecting an unknown zone with a 400 rather than falling back silently the way `granularity` does — a wrong zone shifts every boundary in the response, and a chart that is quietly hours out is worse than an error. 40 new tests, including the 23- and 25-hour DST days and Newfoundland's half-hour offset. Run `pnpm migrate` before deploying the read.

## 2026-08-01 - version 3.5.0

- **Added a scheduled re-seed for the operator demo.** The operator dashboard has time-relative views (the 24-hour alert trend, the day/week sales ranges) built on static seed timestamps, so the data thins out as it ages. A new `reseed-operator` cron job wipes and re-inserts the fleet on a schedule (suggested daily, `0 4 * * *`), restoring the canonical demo and refreshing every timestamp — the same approach `reset-feature-flags` uses for the flags console. To keep the CLI seed and the job from drifting, both now call a single `seedOperator()` (one transactional wipe-and-insert from the pure builder); `scripts/operator/seed.ts` became a thin wrapper. Wire it up in the scheduler with `RUN_CRON=true CRON_JOB=reseed-operator`. paul-explore shows a note on the dashboard so the periodic reset isn't a surprise.

## 2026-08-01 - version 3.4.1

- **Fixed operator stores drifting into "offline" once paul-explore read them from the database.** A store's `last_ping` is sensor telemetry — a real device reports it continuously — but the seed writes it once, so as time passed since seeding the value aged past the dashboard's 10-minute offline threshold and every store showed "offline" with no way to recover. The store DTO now synthesizes a recent ping per read from the store's status (online reads as a strong ~30s-old signal, degraded/offline as a stale ~7-minute one), mirroring the freshening the in-memory demo used to do. The rest of the store row is real DB data; only `last_ping`, which can't be static and still be meaningful, is derived.

## 2026-08-01 - version 3.4.0

- **Operator backend, part four: a demo seed.** `pnpm seed:operator` wipes and re-populates the operator tables with a realistic demo fleet — 6 stores (one degraded), 36 inventory items, 24 alerts, 36 activity events, 360 sales spread across ~18 months so every analytics range has data, and a planogram per store (items plus a spare empty shelf). The dataset comes from a pure, deterministic builder (`buildOperatorSeed(uuid, now)`) that's unit-tested for its counts, its foreign-key relationships (every child row points at a real store, every planogram box references that store's own items or is empty), the 18-month sales spread, and reproducibility; the runner in `scripts/operator/seed.ts` just inserts it inside a transaction. With this, the operator backend is complete and demo-runnable end to end.

## 2026-08-01 - version 3.3.0

- **Operator backend, part three: the planogram and the fleet summary.** Migration `015_operator_planogram` adds `operator_planograms` (one JSONB `boxes` row per store), and the module gains `GET /api/operator/stores/:storeId/planogram` and `PATCH …/planogram` — the PATCH takes either the whole new box layout (an upsert) or a `{ resyncItemId }` to clear one slot's sensor mismatch. It also gains `GET /api/operator/fleet-summary`, the dashboard's aggregated view: per-store alert counts and inventory health, fleet-wide totals, and a 24-hour alert trend. The heavy lifting is grouped SQL — alerts-by-store and inventory-by-store use filtered aggregates (`count(*) filter (where …)`, `avg(stock/capacity)`), and the trend is a `date_trunc('hour', …) GROUP BY` — so the summary is a few small queries, not the whole alert and inventory tables pulled into the app. The sparse rows are folded into the dashboard shape by a pure, clock-injectable `assembleFleetSummary`. 130 tests green (mocked repo + supertest for the routes, unit tests for the assembly and the 24-hour trend fill), no live DB. Still to come: a demo seed.

## 2026-08-01 - version 3.2.0

- **Operator backend, part two: the per-store read entities.** Building on the stores + sales foundation, the `operator` module now covers the rest of the store-detail data the paul-explore dashboard needs. Migration `014_operator_entities` completes the store row (temperature, uptime, 24h revenue, last ping) and adds `operator_inventory`, `operator_alerts`, and `operator_activity`, all indexed on `store_id`. New endpoints: `GET /api/operator/stores/:storeId` (one store, 404 when unknown), `GET …/inventory`, `POST …/restock` (sets items to full capacity and logs an activity event), `GET …/alerts`, `PATCH /api/operator/alerts/:alertId/dismiss`, and `GET …/activity`. Params are uuid-validated, so a malformed id is a clean 400. As with part one, the routes are covered with a mocked repository and supertest (DTO shapes, restock-then-log, dismiss, 404s, validation) — 123 tests green, no live DB needed. Still to come: the planogram, the fleet-summary aggregation, and a demo seed.

## 2026-07-31 - version 3.1.0

- **New: the `operator` module** — moves the paul-explore operator dashboard off in-memory demo data and onto real tables. A `013_operator` migration creates `operator_stores` and `operator_sales` (indexed on `store_id` and `occurred_at`), with matching Drizzle schema. `GET /api/operator/stores` returns the fleet, and `GET /api/operator/sales-analytics?granularity=day|week|month|year` returns a fleet-wide sales rollup. The reason it lives in the DB: the analytics are two grouped SQL queries — one `date_trunc(...) … GROUP BY` for the time buckets and one `GROUP BY store` (left join so zero-sales stores still rank) — instead of pulling every sale row into the app and summing there. The controller fills the sparse DB rows into the fixed window (7 days / 8 weeks / 12 months / 5 years) and logs the aggregation time so the efficiency is measurable. Bucket assembly is a pure, clock-injectable helper covered by unit tests; the routes are covered with a mocked repository, so the suite still needs no live database. This is part one (stores + sales); inventory, alerts, activity, and the planogram are follow-ups.

## 2026-07-28 - version 3.0.1

- Ignore the agent harness scratch directories (`.harness/`, `.harness-logs/`). They were untracked but not ignored, so a `git add -A` picked them up -- which nearly put session logs into a PR. paul-explore already ignored them; this brings the API into line

## 2026-07-28 - version 3.0.0

Release to production. Rolls up everything since 2.16.0.

- **Breaking: the ChatGPT endpoints are gone.** `POST /api/chatgpt` and `POST /api/chatgpt/summarize` were removed along with the `chat` module, the `openai` dependency (npm and pip), and `OPENAI_API_KEY`. Nothing called them, and they were authenticated but unmetered. Callers now get a 404. See the Deprecations section in the README
- **New: the `walls` module** backing the paul-explore Gallery Wall save feature, stored entirely in S3 with no database. Each user's walls live under `gallery-walls/{userSegment}/{wallId}/` with a `manifest.json` and an `images/` folder. `GET/POST /api/walls` and `GET/PUT/DELETE /api/walls/:id`, all Auth0-scoped to the caller
- Media URLs fall back to the bucket's own URL when `CDN_BASE_URL` is unset, instead of stringifying `undefined` into every stored image URL
- Fixed the walls test suite importing the whole app, which opened a database pool at import time and failed CI wherever `DATABASE_URL` was absent

## 2026-07-28 - version 2.17.3

- Remove the `chat` module and both ChatGPT endpoints (`POST /api/chatgpt`, `POST /api/chatgpt/summarize`). They wrapped OpenAI `gpt-3.5-turbo` for free-text chat and for rewording medical-journal entries, but nothing called them -- a sweep of every project on disk found no consumer, and the medical-journal module never wired up the summarizer it was written for. They were authenticated but unmetered, so any signed-in user could spend against the key with 4000-character prompts
- Drop the `openai` dependency from both `package.json` and `requirements.txt` (the Python pin was unused -- no script imported it), and remove `OPENAI_API_KEY` from the env schema and `.env.example`
- Document the removal under a new Deprecations section in the README, including how to restore the module from history and the reminder to revoke the key at OpenAI -- deleting the code does not invalidate it

## 2026-07-28 - version 2.17.2

- Fix saved walls reopening with dead `blob:` image URLs. Photos were correlated to their images by multipart field name, and ids are built from filenames, so an id holding a space or non-ASCII character (a screenshot named "... 10.40.57 AM.png" carries U+202F) did not come back as the same string. The upload succeeded, the match silently failed, and the wall kept pointing at a browser blob handle that dies on reload. Photos are now paired to images by position against an explicit `imageIds` field
- Declare `imageIds` in the wall schemas: `validateBody` replaces the body with the parsed result, so a field missing from the schema is stripped before the controller runs
- Flatten image ids to `[a-zA-Z0-9.-_]` when building S3 keys, so keys and CDN URLs need no escaping to be fetchable

## 2026-07-28 - version 2.17.1

- Fall back to the bucket's own URL when `CDN_BASE_URL` is unset instead of stringifying `undefined` into every stored image URL. Uploads were landing in S3 correctly but the saved `image_url` read `undefined/gallery-walls/...`, so nothing could load it back. Affected the gallery module the same way

## 2026-07-28 - version 2.17.0

- Add a `walls` module backing the paul-explore Gallery Wall save feature, stored entirely in S3 with no database. Each user's saved walls live under `gallery-walls/{userSegment}/{wallId}/` with a `manifest.json` (name, serialized wall state, timestamps) and an `images/` folder, so per-user isolation comes from the key prefix and deleting a wall bulk-removes its photos. `GET /api/walls` lists a user's walls, `POST /api/walls` saves a new one (photos arrive as multipart files keyed by image id, are optimized to WebP via the shared media processor, uploaded, and their srcs rewritten to CDN URLs), `GET /api/walls/:id` reads one, `PUT /api/walls/:id` renames and/or replaces it (deleting photos that were removed), and `DELETE /api/walls/:id` removes the whole wall. All routes require an authenticated Auth0 user and are scoped to their `sub`
- Split the logic into a pure `WallsService` (injected repository, image processor, clock, and id generator) behind a thin Express controller, so the domain behaviour is unit tested without S3 or HTTP, and the S3 repository is tested against an injected fake client. Reuses the existing `processImage` pipeline (magic-byte validation, 10 MB cap, WebP output) rather than adding a second image path
## 2026-07-27 - version 2.16.1

- Fix the `reset-feature-flags` Railway cron crashing on every run. It runs as its own cron service with only DB + cron vars set, but importing the DB layer pulled in `config/env.ts`, which hard-required the web service's Auth0 vars (`NEXT_PUBLIC_AUTH0_AUDIENCE`, `NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL`) and called `process.exit(1)` when they were absent — so the job died before doing any work. Those two vars are now optional in the env schema, decoupling DB-only workloads (the cron, migrations, scripts) from web-only config. The web service still fails fast with a clear message: `config/auth.ts` now validates their presence at the point of use

## 2026-07-27 - version 2.16.0

- Add a `feature-flags` module backing the paul-explore feature-flags console with real persistence: `GET /api/feature-flags` returns every flag plus the environment list, `GET /api/feature-flags/audit` returns the change log, and `PATCH /api/feature-flags/:flagKey` toggles a flag's kill switch or rollout for one environment. Reads are public so the console works signed-out; the PATCH write requires an authenticated Auth0 user (like the NBA picks writes) and attributes the audit entry to the real user's email/sub
- Each flag is one row with its per-environment config stored as JSONB, mirroring the console's `Flag` shape 1:1 (the Zod contract is ported so the API and console never drift). New migration `012_feature_flags` creates both tables (`feature_flags`, `feature_flag_audit` with a newest-first index) and seeds the canonical five flags plus the seed audit log
- Add a `reset-feature-flags` cron job that restores the demo to its canonical seed every 6 hours (`0 */6 * * *`), wired into the existing cron entrypoint via `CRON_JOB=reset-feature-flags`. The migration and the reset reuse one shared seed, so the demo can never drift

## 2026-07-25 - version 2.15.0

- Add a per-item `seen` flag to `GET /api/notifications`: each notification now reports whether the recipient has already viewed it (created at or before their last view). Derived from the existing `notifications_seen_at` timestamp, so no migration and no extra query — the read state was already fetched to compute `unread_count`. Lets Ketsup mark new-vs-old exactly instead of by list position (gpbsumido/ketsup#62)

## 2026-07-23 - version 2.14.1

- Add a `fly.toml` so the API can deploy to Fly.io (uses the existing Dockerfile, scale-to-zero, PORT 8080). Secrets (DATABASE_URL, Auth0, R2) are set separately via `fly secrets`. Part of the Ketsup free-stack move

## 2026-07-23 - version 2.14.0

- Add a `notifications` module for Ketsup: `GET /api/notifications` returns the recipient's activity feed (likes, replies, and reposts on their posts by others, plus follows of them), newest first, with an unread count; `PUT /api/notifications/seen` marks all as read
- Pull-based: notifications are derived by joining the existing likes/replies/reposts/follows tables, so there is no notifications table and no writes were added to those modules. Read state is a single `notifications_seen_at` column
- New migration `011_notifications_seen` (adds the column to user_profiles) plus the Drizzle schema change

## 2026-07-23 - version 2.13.0

- Add a `search` module for Ketsup: `GET /api/search?q=...` returns matching public accounts (username or display name) and public posts (text or caption), newest first
- Public (works for guests) and read-only, no schema change or migration. ILIKE-based for now; a pg_trgm GIN index on usernames and a tsvector column on post text are noted as a scale follow-up
- Empty/blank queries return empty results without touching the DB

## 2026-07-23 - version 2.12.0

- Add a `reposts` module for the Ketsup reposts feature: repost (`POST /api/reposts/:postId`), undo (`DELETE /api/reposts/:postId`, both idempotent), and a batch summary (`GET /api/reposts?ids=a,b,c`) returning repost counts and reposted-by-me per post
- Self-contained like likes and replies: no changes to the posts/timeline read path (surfacing reposts in the feed with attribution is a separate follow-up)
- New `reposts` table (migration `010_reposts`, unique on post_id + user_sub, FKs cascade) plus a Drizzle schema definition

## 2026-07-23 - version 2.11.0

- Add a `replies` module for the Ketsup threads feature: add a reply (`POST /api/replies/:postId`, content 1-500 chars), read a post's thread oldest-first with author info (`GET /api/replies/:postId`), and a batch reply-count endpoint (`GET /api/replies?ids=a,b,c`)
- Self-contained like the likes module: no changes to the posts read path
- New `post_replies` table (migration `009_post_replies`, FKs cascade, index on post_id + created_at) plus a Drizzle schema definition

## 2026-07-23 - version 2.10.0

- Add a `likes` module for the Ketsup likes feature: like a post (`POST /api/likes/:postId`), remove a like (`DELETE /api/likes/:postId`, both idempotent), and a batch summary endpoint (`GET /api/likes?ids=a,b,c`) returning like counts and liked-by-me per post, capped at 100 ids and skipping non-uuid ids
- Self-contained by design: it does not touch the posts read path, so the frontend overlays like state per feed page with one extra request
- New `post_likes` table (migration `008_post_likes`, unique on post_id + user_sub, FKs cascade) plus a Drizzle schema definition
- Likes are idempotent via `ON CONFLICT DO NOTHING`

## 2026-07-20 - version 2.9.1

- Add a `referrals` module backing the work-portfolio referral-links demo: create a shareable slug (custom or generated, uniqueness enforced), resolve it, record clicks (UA stored hashed), and read click stats. Public endpoints with basic IP rate limits
- New `referrals` and `referral_clicks` tables (migration `001_referrals`) plus Drizzle schema definitions

## 2026-07-17 - version 2.9.0

- Extract post creation transaction logic (BEGIN/COMMIT/ROLLBACK) from controller to `posts/service.ts`
- Add named service methods for Google auth DB access — controller no longer touches `db` directly
- Move NBA date calculations (`getCurrentSeason`, `getCurrentSeasonYear`) from repository to service layer
- Addresses layer boundary violations identified in the Phase 10 architecture audit

## 2026-07-17 - version 2.8.1

- Reduce logging rate to stay under Railway's 500 logs/sec limit
- Silence health check, readiness probe, and favicon requests from pino-http logging
- Suppress routine 2xx request logs in production (log at debug level, filtered by info base)
- Keep 4xx (warn) and 5xx (error) logs flowing for diagnostics

## 2026-07-17 - version 2.8.0

- Switch package manager from npm to pnpm for strict dependency resolution and faster installs
- Remove `declaration`/`declarationMap` from tsconfig (app, not library — fixes pnpm phantom dependency errors)
- Update Dockerfile: Node 22, corepack enable, `pnpm install --frozen-lockfile`
- Update CI: `pnpm/action-setup`, pnpm store caching, pnpm commands
- Add `packageManager` field pinning pnpm@10.34.5

## 2026-07-17 - version 2.7.2

- Remove unused dependencies left over from the overhaul: `apicache` (replaced by the custom typed cache manager), `jest` (replaced by Vitest), and `ts-node` (replaced by `tsx` for the dev server)

## 2026-07-17 - version 2.7.1

- `knexfile.ts`: Knex migration configuration with pg connection from env vars
- `src/migrations/000_baseline.ts`: baseline migration capturing full schema (15 tables, all indexes, triggers)
- `package.json`: add `migrate`, `migrate:rollback`, `migrate:make` scripts
- Existing databases should mark the baseline as already-run (see knexfile.ts comment)

## 2026-07-17 - version 2.7.0

- Add Biome linter with TypeScript support (replaces ESLint which doesn't support TypeScript 7)
- `.github/workflows/ci.yml`: CI pipeline with parallel lint, type check, test, and build jobs
- Husky pre-commit hook with lint-staged running Biome on staged `.ts` files
- Fix 3 lint errors: implicit `any` variables in posts controller, `forEach` return value in NBA repository
- `package.json`: add `lint`, `lint:fix`, and `typecheck` scripts

## 2026-07-17 - version 2.6.1

- Integration tests for health, vitals, and profiles endpoints using supertest
- Extract `src/app.ts` from `src/index.ts` so the Express app is importable for testing
- Health: verify ok/degraded status, readiness probe, shutdown behavior
- Vitals: POST ingestion, Zod validation rejection, GET summary/versions with mocked auth
- Profiles: GET /me, POST /setup with username validation, discover pagination, public profile lookup

## 2026-07-17 - version 2.6.0

- Replace Jest with Vitest for TypeScript-native testing (`vitest.config.ts`, test scripts)
- `src/shared/testing/setup.ts`: pool cleanup, `src/shared/testing/factories.ts`: test data factories for users, posts, events, vitals, profiles
- Migrate `tests/fantasy.test.js` → `src/modules/f1/fantasyScoring.test.ts` with vitest imports
- `src/middleware/errorHandler.test.ts`: unit tests for AppError, ZodError, auth errors, and unknown error handling

## 2026-07-17 - version 2.5.1

- Remove all legacy JavaScript source files: 19 route files, 3 middleware files, 6 utility files, schemas, constants, and `server.js`
- Keep `start.js` (cron entry point), `config/database.js`, and Google Calendar utils for Railway cron job compatibility
- Update `start.js` to load from `dist/index` instead of `server`

## 2026-07-17 - version 2.5.0

- `src/index.ts`: new TypeScript entry point with all module routers, global middleware (helmet, cors, compression, pino-http), error handler, and graceful shutdown
- Wire `upsertUser` middleware into calendar, follows, posts, timeline, and profiles routes
- Replace `ts-node` with `tsx` for dev server (TypeScript 7 compatibility)
- Update `package.json` scripts: `start` → `node dist/index.js`, `dev` → `tsx`, add `start:legacy`
- Update `Dockerfile` to run `npm run build` before start
- Downgrade `@asteasolutions/zod-to-openapi` to v7 for Zod 3 compatibility

## 2026-07-17 - version 2.4.2

- `src/shared/openapi/`: OpenAPI 3.1 spec generation with `@asteasolutions/zod-to-openapi`, all endpoints registered with schemas
- `src/modules/docs/routes.ts`: Swagger UI at `/api/docs` and raw spec at `/api/docs/openapi.json`

## 2026-07-17 - version 2.4.1

- Per-module Zod schemas for all POST/PUT endpoints across 11 modules (calendar, posts, profiles, follows, feedback, chat, vitals, medical-journal, forum, nba, gallery)
- Wire `validateBody`/`validateParams` middleware into all route files

## 2026-07-17 - version 2.4.0

- `src/shared/utils/response.ts`: typed response helpers — `success()`, `paginated()`, `created()` for future v2 envelope pattern
- Standardize error handling across all 17 controllers to use AppError subclasses and `next(err)` instead of manual `res.status().json()` responses

## 2026-07-17 - version 2.3.2

- `src/shared/utils/shutdown.ts`: graceful shutdown with SIGTERM/SIGINT handling, 30s drain timeout, pg and Knex pool cleanup
- `src/modules/health/routes.ts`: readiness probe (`GET /ready`) returns 503 once shutdown begins

## 2026-07-17 - version 2.3.1

- `src/shared/utils/cache.ts`: tag-based invalidation, updated TTL tiers (SHORT/MEDIUM/LONG/DAY), LRU cleanup on eviction
- `src/middleware/cache.ts`: typed cache options with `varyByUser`, ETag support with 304 responses, `Cache-Control` headers, tag-based response cache invalidation

## 2026-07-17 - version 2.3.0

- `src/config/database.ts`: explicit pool settings (max 20, idle/connection timeouts), pool event logging, slow query warnings (>100ms)
- `src/config/drizzle/index.ts`: centralized Drizzle instance shared by posts, profiles, and follows repositories
- `src/modules/calendar/repository.ts`: Knex pool configuration (min 2, max 10) with exported instance for shutdown
- `src/modules/health/routes.ts`: health check endpoint returning status, uptime, DB connectivity, and version

## 2026-07-17 - version 2.2.1

- `src/shared/utils/logger.ts`: pino-based structured logger with pretty-print in dev, JSON in production
- `src/middleware/requestLogger.ts`: pino-http request/response logging with userId and timing
- Replace all `console.log/error/warn` calls across 17 files with structured pino logging

## 2026-07-17 - version 2.2.0

- `src/middleware/upsertUser.ts`: typed Auth0 user upsert middleware with per-process caching
- `src/middleware/validate.ts`: generic Zod validation middleware — `validateBody<T>()`, `validateParams<T>()`, `validateQuery<T>()` with typed schemas
- `src/middleware/rateLimiter.ts`: typed factory functions `createIpLimiter()` and `createUserLimiter()` with pre-configured NBA limiter
- `src/middleware/cache.ts`: typed response cache middleware with TTL, LRU eviction, prefix invalidation, and X-Cache headers
- `src/shared/types/express.d.ts`: global Express Request type augmentation for `auth`, `validatedBody`, `validatedQuery`

## 2026-07-16 - version 2.1.3

- `src/modules/f1/`: TypeScript migration — service wraps Python queue for FastF1 data, 14 route handlers including cache clear
- `src/modules/fantasy/`: TypeScript migration — typed fantasy scoring functions for F1 qualifying/race/sprint points
- `src/modules/gallery/`: TypeScript migration — raw SQL repository for gallery CRUD with S3 upload and sharp image processing
- `src/modules/medical-journal/`: TypeScript migration — raw SQL repository with transaction support for entries + feedback
- `src/modules/feedback/`: TypeScript migration — raw SQL repository with pagination, rotation filter, and search
- `src/modules/chat/`: TypeScript migration — typed OpenAI SDK service for chat and summarization endpoints
- `src/modules/youtube/`: TypeScript migration — RSS feed fetch service with xml2js parsing
- `src/modules/vitals/`: TypeScript migration — raw SQL repository with PERCENTILE_CONT aggregation and version filtering
- `src/modules/geo/`: TypeScript migration — ip-api.com lookup service with in-memory caching
- `src/modules/google-auth/`: TypeScript migration — OAuth flow with HMAC-signed state, webhook handler with per-user queue
- `src/modules/forum/`: TypeScript migration — raw SQL repository for table introspection, postforum CRUD, markers CRUD

## 2026-07-16 - version 2.1.2

- install `drizzle-orm` and `drizzle-kit`
- `src/config/drizzle/schema.ts`: Drizzle table definitions for users, user_profiles, posts, post_media, follows with proper column types and relations
- `src/modules/posts/`: TypeScript migration with Drizzle ORM for post CRUD, multer file uploads, image/video processing, S3 uploads
- `src/modules/profiles/`: TypeScript migration with Drizzle ORM for profile setup, avatar upload, public/discover endpoints
- `src/modules/follows/`: TypeScript migration with Drizzle ORM for follow/accept/reject/unfollow and follower/following lists
- `src/modules/timeline/`: TypeScript migration with cursor-based pagination and JSON_AGG timeline query
- `src/shared/utils/mediaProcessor.ts`: extracted typed image and video processing utilities (sharp, ffmpeg)
- add `yarn.lock` to `.gitignore` (project uses npm)

## 2026-07-16 - version 2.1.1

- install `knex` as a dependency
- `src/modules/calendar/`: full TypeScript migration of the calendar module (~800 lines of JS → 2200 lines of typed TS) using Knex query builder
  - `types.ts`: interfaces for CalendarEvent, Calendar, CalendarMember, Countdown, EventCard, plus input/filter types
  - `repository.ts`: Knex-based data access replacing 27+ raw SQL functions from `utils/db.js` — fluent `.where()`, `.join()`, `.orderBy()`, transactions for multi-table ops
  - `service.ts`: business logic for permissions (owner/editor/viewer), Google sync orchestration, validation
  - `controller.ts`: HTTP handlers matching exact response shapes from the JS routes
  - `routes.ts`: thin router with all event, calendar, sharing, card, and countdown endpoints

## 2026-07-16 - version 2.1.0

- `src/modules/nba/`: full TypeScript migration of NBA and playoffs modules using raw SQL repository pattern
  - `types.ts`: interfaces for teams, players, stats, shot charts, playoffs brackets, leaderboard
  - `repository.ts`: NBA Stats API proxy with throttled fetch + raw SQL for playoff brackets
  - `service.ts`: business logic layer with fantasy point calculations and bracket scoring
  - `controller.ts`: HTTP handlers with Express 5 param typing
  - `routes.ts`: thin router wiring all NBA + playoff endpoints
- `src/shared/utils/cache.ts`: typed in-memory cache utility with TTL and LRU eviction

## 2026-07-16 - version 2.0.3

- `src/config/env.ts`: Zod schema validating all env vars at startup — crashes fast on missing required vars, typed `env` export
- `src/config/database.ts`: typed pg Pool setup with generic `query<T>()` helper and `checkDatabaseHealth()`
- `src/config/auth.ts`: Auth0 JWT middleware (`checkJwt`, `optionalCheckJwt`, `checkPermissions`) using typed env
- `src/config/s3.ts`: configured S3Client export with typed bucket/CDN constants

## 2026-07-16 - version 2.0.2

- `src/shared/errors/AppError.ts`: base `AppError` class and subclasses — `NotFoundError` (404), `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `ConflictError` (409), `RateLimitError` (429)
- `src/middleware/errorHandler.ts`: global error handler that catches `AppError`, `ZodError`, auth errors, and unknown errors with consistent JSON responses

## 2026-07-16 - version 2.0.1

- scaffold `src/` directory structure: `config/`, `middleware/`, `shared/` (errors, types, utils), and 17 feature modules under `modules/`
- each directory has an empty barrel `index.ts` for future exports
- `src/index.ts` entry point with architecture documentation

## 2026-07-16 - version 2.0.0

- add TypeScript toolchain alongside existing JS: `typescript`, `ts-node`, type definitions for all dependencies
- `tsconfig.json`: strict mode, ES2022 target, NodeNext module resolution, output to `dist/`
- new `dev:ts` and `build` scripts in `package.json`
- `dist/` added to `.gitignore`

## 2026-07-07 - version 1.5.11

- `routes/vitals.js`: added `buildVersionConditions` helper and `mode` query param support (`major`, `minor`, or exact match) to `GET /summary`, `GET /by-page`, and `GET /by-version` endpoints — replaces the old semver "from version onwards" filter with scoped filtering by major version, minor version, or exact version
- `GET /by-version` now returns up to 10 versions by default (was 5), or up to 30 for minor mode to show all patches within a minor version

## 2026-04-20 - version 1.5.10

- `migrations/007_bracket_display_name.sql`: adds `display_name TEXT` column to `nba_playoff_brackets` so users without a `user_profiles` entry can still show a name on the leaderboard instead of falling back to "Anonymous"
- `routes/nba-playoffs.js`: `GET /api/nba/playoffs/picks/:season/public` now accepts `?username=` (profiled users) or `?bracketId=<uuid>` (anonymous users) instead of `?sub=`; `PUT /picks/:season` accepts optional `displayName` in the body and stores it on the bracket row (preserved on conflict via COALESCE); leaderboard entries now include `bracketId`, `username`, and fall back to the stored `display_name` before "Anonymous"

## 2026-04-20 - version 1.5.9

- `routes/nba-playoffs.js`: `GET /api/nba/playoffs/picks/:season/public?sub=<auth0_sub>` — public endpoint to fetch any user's submitted picks by Auth0 sub; returns 404 when the user has no picks or sub is the reserved `OFFICIAL_RESULTS` sentinel

## 2026-04-16 - version 1.5.8

- `routes/nba-playoffs.js`: NBA playoff bracket API — `GET /api/nba/playoffs/picks/:season` and `PUT /api/nba/playoffs/picks/:season` for authenticated users to read/save picks; `GET /api/nba/playoffs/leaderboard/:season` (public) scores all brackets against the official results row and returns ranked entries with max-possible score
- `utils/playoffScoring.js`: playoff bracket scoring engine (`scoreBracket`, `MAX_POSSIBLE`)
- `migrations/006_nba_playoffs.sql`: `nba_playoff_brackets` table with `(user_sub, season)` unique constraint; official results stored as a reserved `OFFICIAL_RESULTS` row
- `scripts/run-migration.js`: generic migration runner — `node scripts/run-migration.js <sql-file>`
- `server.js`: moved `express.json()` before route registration (fixes body parsing for all routes); mounted `/api/nba/playoffs` before the NBA 1-hour cache so picks endpoints are never cached

## 2026-03-30 - version 1.5.7

- endpoint `/api/nba/shots/:playerId` with deterministic mock data per player

## 2026-03-30 - version 1.5.6

- add geo route for getting client ip address and location

## 2026-03-24 - version 1.5.5

- video upload support, photos and videos can be mixed in a single post
- video: thumbnail extracted via ffmpeg, dimensions and duration probed automatically
- post_media queries updated to return media_type, thumbnail_url, and duration across all endpoints

## 2026-03-24 - version 1.5.4

- fix buffer causing server crash

## 2026-03-24 - version 1.5.3

- update for public profiles and discover page

## 2026-03-16 - version 1.5.2

- add migration script for public accounts
- add optionalCheckJwt in middleware (try jwt validation, but allow failire so public routes can have req.auth)
- add is_public to schema and routes (profile, follow, posts)

## 2026-03-16 - version 1.5.1

- actually count follows,following, and posts for ketsup :username endpoint

## 2026-03-16 - version 1.4.9

- `routes/google.js`: updated Google Calendar OAuth callback redirect URLs from `{origin}/protected/settings?gcal=*` to `{origin}/settings?gcal=*` to match the frontend route restructure that eliminated the `/protected` prefix

## 2026-03-13 - version 1.4.8

- `middleware/upsertUser.js`: reads `X-User-Email` header as fallback when `email` is absent from the access token JWT — fixes sharing not working when Auth0 doesn't include email in the access token by default; primary fix is an Auth0 post-login Action that sets `email` as a custom claim, header is belt-and-suspenders
- `GET /calendars/:id/members`: owner entry email now falls back to `req.auth.payload.email` (from the JWT) when `getUserBySub` returns null (e.g. first request after the sharing migration before the users table is populated)

## 2026-03-13 - version 1.4.7

- fixed `ValidationError: ERR_ERL_KEY_GEN_IPV6` in `routes/calendar.js`: custom `keyGenerator` was falling back to `req.ip` directly, which `express-rate-limit` v7+ rejects because raw IPv6 addresses can be used to bypass limits; replaced with `ipKeyGenerator(req)` from `express-rate-limit` which normalizes IPv6 correctly; also switched from `const rateLimit = require(...)` to named import `{ rateLimit, ipKeyGenerator }`
- `DELETE /calendars/:id/members/:memberSub`: added self-removal path — any member can remove themselves using `"me"` or their own sub as `:memberSub`; performs best-effort Google ACL removal using the owner's credentials and returns `{ googleAclRemoved }` consistent with the owner-removal path

## 2026-03-13 - version 1.4.6

- `POST /calendars/:id/members`: fires `addCalendarAclEntry` as fire-and-forget after the DB insert so ACL latency never delays the HTTP response
- `DELETE /calendars/:id/members/:memberSub`: awaits `removeCalendarAclEntry` and returns `{ googleAclRemoved: boolean }` (200) instead of 204 so the frontend can warn the user when Google access was not revoked
- `DELETE /calendars/:id`: before the DB delete, calls `removeCalendarAclEntry` for all members via `Promise.allSettled` so one failure doesn't block the rest; runs before `stopWatchByCalId` so the channel is still alive for any retries

## 2026-03-13 - version 1.4.5

- added `addCalendarAclEntry(ownerUserId, googleCalId, memberEmail, role)` to `utils/googleCalendar.js`: maps 'editor' to 'writer' and 'viewer' to 'reader', POSTs to the Google ACL endpoint using the owner's token, throws on non-2xx
- added `removeCalendarAclEntry(ownerUserId, googleCalId, memberEmail)` to `utils/googleCalendar.js`: DELETEs the user-scoped ACL rule, swallows 404, throws on other non-2xx responses

## 2026-03-13 - version 1.4.4

- added `GET /api/calendar/calendars/:id/members`: accessible by owner or any member; synthesizes an owner entry from the calendars row and prepends it to the member list
- added `POST /api/calendar/calendars/:id/members`: owner-only invite by email; rate-limited to 20 requests per minute per user sub; returns generic 404 when email is not found to avoid enumeration; returns 400 when owner tries to invite themselves
- added `PUT /api/calendar/calendars/:id/members/:memberSub`: owner-only role update ('editor' or 'viewer')
- added `DELETE /api/calendar/calendars/:id/members/:memberSub`: owner-only member removal

## 2026-03-13 - version 1.4.3

- event create/update/delete: replaced `getCalendarById` with `getCalendarForMutation('editor')` for Google sync lookup so editors on shared calendars can write events and credentials always come from the owner's row
- calendar update (`PUT /calendars/:id`): added `getCalendarForMutation('owner')` preflight, returns 403 if not owner
- calendar delete (`DELETE /calendars/:id`): same preflight; also removes `getCalendarById` duplicate lookup
- `POST /calendars/:id/connect-google`: owner preflight, returns 403 if not owner
- `DELETE /calendars/:id/google`: owner preflight, returns 403 if not owner

## 2026-03-13 - version 1.4.2

- added `upsertUser`, `getUserBySub`, `getUserByEmail` to `utils/db.js`
- added `toCalendarMember`, `getCalendarMembers`, `addCalendarMember` (single CTE, no N+1), `updateCalendarMemberRole`, `removeCalendarMember` to `utils/db.js`
- updated `toCalendar` to include `role`, `ownerSub`, `ownerEmail` for the UNION query shape
- replaced `getCalendars` with a UNION query returning owned and shared calendars; each row carries `role` ('owner'|'editor'|'viewer') and `ownerSub`/`ownerEmail` for shared rows
- added `getCalendarForMutation(calendarId, userSub, requiredRole)` — single write-auth chokepoint; 'owner' checks `user_sub` only; 'editor' also accepts `calendar_members` rows with role='editor'
- updated `getCalendarEvents` to use LEFT JOIN on `calendar_members` (replaces correlated subquery) so members see events on shared calendars
- updated `getCalendarEventById` with same LEFT JOIN expansion
- updated `updateCalendarEvent` to allow editors on shared calendars via subquery join
- updated `deleteCalendarEvent` to allow editors on shared calendars

## 2026-03-13 - version 1.4.1

- added `middleware/upsertUser.js`: reads `sub` and `email` from the Auth0 JWT payload and upserts a `users` row; skips the write when the sub+email pair is already cached in a module-level Map (avoids a DB write on every request); guards against missing email claim (logs warning, calls next without upserting); DB errors are non-fatal
- wired `upsertUser` into `routes/calendar.js` immediately after `checkJwt` so all calendar routes populate the user record automatically

## 2026-03-13 - version 1.4.0

- added `scripts/calendar/migrate_sharing.js`: creates `users` table (`sub PK`, `email UNIQUE`) with `idx_users_email`; creates `calendar_members` table (`id PK`, `calendar_id FK → calendars ON DELETE CASCADE`, `user_sub FK → users ON DELETE CASCADE`, `role CHECK('editor'|'viewer')`, `invited_by FK → users ON DELETE SET NULL`) with `idx_calendar_members_user` and `idx_calendar_members_calendar`

## 2026-03-12 - version 1.3.11

Multi-calendar + dedicated Google Calendar two-way sync release. Full breakdown across 1.3.0–1.3.10 below. Summary:

- new `calendars` table with `sync_mode` (`none | push | two_way`), `google_cal_id`, and per-channel columns; `calendar_id` FK on `calendar_events` with cascade delete; migration at `scripts/calendar/migrate_calendars.js` backfills a "Personal" calendar per user and populates `calendar_id` on existing events
- full calendar CRUD API (`GET`/`POST`/`PUT`/`DELETE /api/calendar/calendars`) with `POST /:id/connect-google` and `DELETE /:id/google` for linking and unlinking Google Calendars
- per-calendar Google sync routing: event mutations look up the calendar's `syncMode` and target `primary` for push, the calendar's `google_cal_id` for two_way, or skip Google entirely for none
- `createDedicatedCalendar`, `stopWatchByCalId`, per-calendar `registerWatch` with `userId:calId` channel tokens, and a webhook handler that routes notifications to the right calendar row by splitting the token on the colon
- `renewWatchChannels` now queries `calendars` for `two_way` rows instead of `google_auth`
- OAuth scope updated from `calendar.events` to `calendar` to allow creating and managing calendars

## 2026-03-12 - version 1.3.10

- added `DELETE /api/calendar/calendars/:id/google` to `routes/calendar.js`: stops the Google push channel via `stopWatchByCalId` (called before the update so the google_cal_id is still available for lookup), then sets `google_cal_id=null`, `google_cal_name=null`, `sync_mode='push'`; returns the updated calendar; the Google Calendar itself is not deleted

## 2026-03-12 - version 1.3.9

- added `POST /api/calendar/calendars/:id/connect-google` to `routes/calendar.js`: verifies calendar ownership, returns 200 as-is if already connected (idempotent), calls `createDedicatedCalendar` to create the Google Calendar, saves `googleCalId` and `googleCalName` to the calendar row, calls `registerWatch` to start the push channel (non-fatal on failure), returns the updated calendar

## 2026-03-12 - version 1.3.8

- added `stopWatchByCalId(userId, calId)` to `utils/googleCalendar.js`: looks up the channel info from the `calendars` row via `getCalendarByGoogleCalId`, POSTs to the Google channels/stop endpoint, swallows all errors; exported alongside the existing `stopWatch`
- updated `utils/renewWatchChannels.js` to query `calendars` instead of `google_auth`: selects `two_way` calendars with a `google_cal_id` and a `channel_expiry` within 24 hours; calls `stopWatchByCalId` then `registerWatch` per calendar; imports `stopWatchByCalId` instead of `stopWatch`
- wired up the real `stopWatchByCalId` in `routes/calendar.js`: removed the local stub, imported from `utils/googleCalendar`, fixed the call to pass `calendar.googleCalId` (the Google Calendar ID) instead of the calendar UUID

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
