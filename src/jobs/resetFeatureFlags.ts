// ---------------------------------------------------------------------------
// Cron job: reset the feature-flags demo to its canonical state.
//
// The console is public and anyone signed-in can toggle flags, so every 6 hours
// we restore the demo: the canonical five flags and the seed audit log. This
// reuses the SAME seed the migration used (modules/feature-flags/seed), so the
// two can never drift.
//
// Wired into the existing cron entrypoint (start.js) via CRON_JOB=reset-feature-flags,
// scheduled `0 */6 * * *` (00/06/12/18 UTC — a plain interval, no timezone to pin).
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { db } from '../config/drizzle/index.js';
import { featureFlagAudit, featureFlags } from '../config/drizzle/schema.js';
import { createModuleLogger } from '../shared/utils/logger.js';
import { CANONICAL_AUDIT, CANONICAL_FLAGS } from '../modules/feature-flags/seed.js';

const log = createModuleLogger('reset-feature-flags');

export async function resetFeatureFlags(): Promise<void> {
  log.info('resetting feature flags to the canonical seed');

  await db.transaction(async (tx) => {
    // Clear both tables, then re-seed from the single canonical source.
    await tx.delete(featureFlagAudit);
    await tx.delete(featureFlags);

    await tx.insert(featureFlags).values(
      CANONICAL_FLAGS.map((flag) => ({
        key: flag.key,
        name: flag.name,
        description: flag.description,
        kind: flag.kind,
        tags: flag.tags,
        variations: flag.variations,
        environments: flag.environments,
        createdAt: new Date(flag.createdAt),
      })),
    );

    await tx.insert(featureFlagAudit).values(
      CANONICAL_AUDIT.map((entry) => ({
        flagKey: entry.flagKey,
        environment: entry.environment,
        action: entry.action,
        summary: entry.summary,
        actor: entry.actor,
        createdAt: new Date(entry.timestamp),
      })),
    );
  });

  log.info(
    { flags: CANONICAL_FLAGS.length, audit: CANONICAL_AUDIT.length },
    'feature flags reset complete',
  );
}

// Allow `node dist/jobs/resetFeatureFlags.js` as a standalone cron invocation.
if (require.main === module) {
  resetFeatureFlags()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'feature flags reset failed');
      process.exit(1);
    });
}
