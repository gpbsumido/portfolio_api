// ---------------------------------------------------------------------------
// Cron job: pull ESPN fantasy matchups and snapshot them as bettable events.
//
// Reads the configured ESPN leagues (ESPN_FANTASY_LEAGUES = game:leagueId:season
// keys) and, for each, ingests the current week's head-to-head matchups as
// pick'em events. Private leagues use ESPN_SWID + ESPN_S2 cookies. No-ops when
// no leagues are configured. Served-from-DB reads, like the odds-sync worker.
//
// Wired into start.js via CRON_JOB=zeroproof-espn-sync.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { EspnFantasyProvider } from '../modules/zeroproof/providers/espnFantasy.js';
import { resolveEspnCookies, resolveEspnLeagues, syncOdds } from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-espn-sync');

export async function zeroproofEspnSync(): Promise<void> {
  const leagues = resolveEspnLeagues();
  if (leagues.length === 0) {
    log.info('no ESPN_FANTASY_LEAGUES configured, skipping');
    return;
  }
  const provider = new EspnFantasyProvider(resolveEspnCookies());
  log.info({ leagues }, 'syncing ESPN fantasy matchups');

  const summary = await syncOdds(provider, leagues);

  log.info(summary, 'ESPN fantasy sync complete');
}

// Allow `node dist/jobs/zeroproofEspnSync.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofEspnSync()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ESPN fantasy sync failed');
      process.exit(1);
    });
}
