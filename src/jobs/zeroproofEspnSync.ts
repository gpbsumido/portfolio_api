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
import {
  EspnFantasyProvider,
  type EspnLeagueOutcome,
} from '../modules/zeroproof/providers/espnFantasy.js';
import {
  recordEspnLeagueHealth,
  resolveEspnCookies,
  resolveEspnLeagueKeys,
  syncOdds,
} from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-espn-sync');

export async function zeroproofEspnSync(): Promise<void> {
  const leagues = await resolveEspnLeagueKeys();
  if (leagues.length === 0) {
    log.info('no ESPN leagues configured (registry or ESPN_FANTASY_LEAGUES), skipping');
    return;
  }
  // Observe each league's resolution as the sync fetches it, then persist the
  // health so a league page can show which of its ESPN leagues can't be reached.
  const outcomes: EspnLeagueOutcome[] = [];
  const provider = new EspnFantasyProvider(resolveEspnCookies(), (o) => outcomes.push(o));
  log.info({ leagues }, 'syncing ESPN fantasy matchups');

  const summary = await syncOdds(provider, leagues);
  await recordEspnLeagueHealth(outcomes, new Date());

  log.info({ ...summary, checked: outcomes.length }, 'ESPN fantasy sync complete');
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
