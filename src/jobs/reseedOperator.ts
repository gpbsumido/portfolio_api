// ---------------------------------------------------------------------------
// Cron job: re-seed the operator demo dataset.
//
// The operator dashboard is a public demo with time-relative views (the 24h
// alert trend, the day/week sales ranges) and static seed timestamps, so the
// data goes stale as it ages. Re-seeding on a schedule keeps it fresh and
// restores the canonical fleet, the same way reset-feature-flags does for the
// flags console. Reuses the single seedOperator() so the two can't drift.
//
// Wired into the cron entrypoint (start.js) via CRON_JOB=reseed-operator.
// Suggested schedule: daily, `0 4 * * *` (04:00 UTC — a plain interval).
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { seedOperator } from '../modules/operator/seed.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('reseed-operator');

export async function reseedOperator(): Promise<void> {
  log.info('re-seeding the operator demo dataset');
  const counts = await seedOperator();
  log.info(counts, 'operator re-seed complete');
}

// Allow `node dist/jobs/reseedOperator.js` as a standalone cron invocation.
if (require.main === module) {
  reseedOperator()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'operator re-seed failed');
      process.exit(1);
    });
}
