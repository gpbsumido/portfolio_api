// ---------------------------------------------------------------------------
// Cron job: accrue a day's simulated yield on the ZeroProof float.
//
// The company holds the locked deposits (escrow) and, in the real product,
// invests them; the return is the revenue. On fake dollars this writes a yield
// ledger row against the house so the "how much did we make" view is real code.
//
// Wired into start.js via CRON_JOB=zeroproof-yield.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { accrueDailyYield } from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-yield');

export async function zeroproofYield(): Promise<void> {
  const accruedCents = await accrueDailyYield();
  log.info({ accruedCents }, 'ZeroProof yield accrued');
}

// Allow `node dist/jobs/zeroproofYield.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofYield()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ZeroProof yield accrual failed');
      process.exit(1);
    });
}
