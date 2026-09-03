// ---------------------------------------------------------------------------
// Cron job: settle finished ZeroProof events.
//
// Pulls results from the configured provider (fixtures by default, or
// the-odds-api /scores — quota-free — when a key is set), grades open bets,
// stamps the closing line + CLV, pays the ledger, and marks events final. The
// settle itself is idempotent, so re-running is safe.
//
// Wired into start.js via CRON_JOB=zeroproof-settle.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { resolveResultsProvider, resolveSportKeys, settle } from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-settle');

export async function zeroproofSettle(): Promise<void> {
  const provider = resolveResultsProvider();
  const sportKeys = resolveSportKeys();
  log.info({ provider: provider.name, sportKeys }, 'settling ZeroProof events');

  const summary = await settle(provider, sportKeys);

  log.info(summary, 'ZeroProof settle complete');
}

// Allow `node dist/jobs/zeroproofSettle.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofSettle()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ZeroProof settle failed');
      process.exit(1);
    });
}
