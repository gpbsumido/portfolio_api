/**
 * Seeds the operator tables with the demo dataset.
 *
 *   pnpm seed:operator
 *
 * Wipes and re-inserts the operator_* tables, so it is safe to re-run. This is a
 * thin CLI wrapper around the shared seedOperator() the cron re-seed job also
 * uses, so the two can never drift.
 */

import 'dotenv/config';
import { pool } from '../../src/config/database.js';
import { seedOperator } from '../../src/modules/operator/seed.js';

seedOperator()
  .then((counts) => {
    console.log(
      `Seeded operator: ${counts.stores} stores, ${counts.inventory} items, ${counts.alerts} alerts, ${counts.activity} activity, ${counts.sales} sales, ${counts.planograms} planograms.`,
    );
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    pool.end();
    process.exit(1);
  });
