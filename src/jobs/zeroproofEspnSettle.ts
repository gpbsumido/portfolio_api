// ---------------------------------------------------------------------------
// Cron job: settle finished ESPN fantasy matchups.
//
// Reads each configured ESPN league's completed matchups and grades the open
// bets on them — the same idempotent settler the odds side uses, just fed by the
// ESPN results provider. No-ops when no leagues are configured.
//
// Wired into start.js via CRON_JOB=zeroproof-espn-settle.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { EspnFantasyResultsProvider } from '../modules/zeroproof/providers/espnFantasyResults.js';
import { resolveEspnCookies, resolveEspnLeagues, settle } from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-espn-settle');

export async function zeroproofEspnSettle(): Promise<void> {
  const leagues = resolveEspnLeagues();
  if (leagues.length === 0) {
    log.info('no ESPN_FANTASY_LEAGUES configured, skipping');
    return;
  }
  const provider = new EspnFantasyResultsProvider(resolveEspnCookies());
  log.info({ leagues }, 'settling ESPN fantasy matchups');

  const summary = await settle(provider, leagues);

  log.info(summary, 'ESPN fantasy settle complete');
}

// Allow `node dist/jobs/zeroproofEspnSettle.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofEspnSettle()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ESPN fantasy settle failed');
      process.exit(1);
    });
}
