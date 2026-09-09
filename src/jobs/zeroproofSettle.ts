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
import type { IngestOutcome } from '../modules/zeroproof/providers/theOddsApi.js';
import {
  recordIngestHealth,
  resolveResultsProvider,
  resolveSportKeys,
  settle,
} from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-settle');

export async function zeroproofSettle(): Promise<void> {
  // Observe each sport's scores fetch so the ops page can show which sports
  // aren't settling. Fixtures never emits; only the-odds-api provider does.
  const outcomes: IngestOutcome[] = [];
  const provider = resolveResultsProvider((o) => outcomes.push(o));
  const sportKeys = resolveSportKeys();
  log.info({ provider: provider.name, sportKeys }, 'settling ZeroProof events');

  const summary = await settle(provider, sportKeys);
  await recordIngestHealth(outcomes, 'results', new Date());

  log.info({ ...summary, checked: outcomes.length }, 'ZeroProof settle complete');
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
