// ---------------------------------------------------------------------------
// Cron job: pull ZeroProof odds and snapshot them.
//
// Runs the configured provider (fixtures by default — zero credits — or
// the-odds-api when a key is set) over the configured sports, upserts each
// event and appends a snapshot per market. Served-from-DB reads mean this is
// the only thing that ever touches the vendor.
//
// Wired into start.js via CRON_JOB=zeroproof-odds-sync. Cadence is a platform
// cron concern; near-commence events want more frequent pulls so the closing
// line (a later slice) is captured.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import {
  resolveOddsProvider,
  resolveSportKeys,
  syncOdds,
} from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-odds-sync');

export async function zeroproofOddsSync(): Promise<void> {
  const provider = resolveOddsProvider();
  const sportKeys = resolveSportKeys();
  log.info({ provider: provider.name, sportKeys }, 'syncing ZeroProof odds');

  const summary = await syncOdds(provider, sportKeys);

  log.info(summary, 'ZeroProof odds sync complete');
}

// Allow `node dist/jobs/zeroproofOddsSync.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofOddsSync()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ZeroProof odds sync failed');
      process.exit(1);
    });
}
