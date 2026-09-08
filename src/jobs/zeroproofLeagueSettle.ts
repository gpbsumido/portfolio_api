// ---------------------------------------------------------------------------
// Cron job: ZeroProof league settlement.
//
// Closes every league that's finished — a threshold league once a member's
// bankroll reaches the target, a timeline league once its deadline passes —
// stamping the winner, freezing final standings, and archiving the league
// wallets. Idempotent: only open leagues are scanned.
//
// Wired into start.js via CRON_JOB=zeroproof-league-settle.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { settleFinishedLeagues } from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-league-settle');

export async function zeroproofLeagueSettle(): Promise<void> {
  const settled = await settleFinishedLeagues(new Date());
  log.info({ settled }, 'ZeroProof league settlement complete');
}

// Allow `node dist/jobs/zeroproofLeagueSettle.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofLeagueSettle()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ZeroProof league settlement failed');
      process.exit(1);
    });
}
