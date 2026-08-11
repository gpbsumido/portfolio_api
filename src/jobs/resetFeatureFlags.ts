// ---------------------------------------------------------------------------
// Cron job: reset the feature-flags demo to its canonical state.
//
// The console is public and anyone signed-in can toggle flags, so every 6 hours
// we restore the demo: the canonical demo flags and the seed audit log. This
// reuses the SAME seed the migration used (modules/feature-flags/seed), so the
// two can never drift.
//
// The admin-tier flags are deliberately NOT part of that. They gate real pages
// on paul-explore, and sweeping them into a periodic reset would turn a
// deliberate kill switch back on within six hours, at whatever hour the cron
// runs. The reset now deletes only the resettable rows and leaves the live
// gates exactly as they were found.
//
// Wired into the existing cron entrypoint (start.js) via CRON_JOB=reset-feature-flags,
// scheduled `0 */6 * * *` (00/06/12/18 UTC — a plain interval, no timezone to pin).
// ---------------------------------------------------------------------------

import { notInArray } from 'drizzle-orm';
import { pool } from '../config/database.js';
import { db } from '../config/drizzle/index.js';
import { featureFlagAudit, featureFlags } from '../config/drizzle/schema.js';
import { PROTECTED_FLAG_KEYS } from '../modules/feature-flags/access.js';
import {
  CANONICAL_AUDIT,
  PROTECTED_FLAGS,
  RESETTABLE_FLAGS,
} from '../modules/feature-flags/seed.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('reset-feature-flags');

export async function resetFeatureFlags(): Promise<void> {
  log.info('resetting feature flags to the canonical seed');

  await db.transaction(async (tx) => {
    // Clear the audit log and the resettable flags, then re-seed those. The
    // protected rows are skipped by both the delete and the insert, so their
    // current state survives untouched.
    await tx.delete(featureFlagAudit);
    await tx.delete(featureFlags).where(notInArray(featureFlags.key, [...PROTECTED_FLAG_KEYS]));

    await tx.insert(featureFlags).values(
      RESETTABLE_FLAGS.map((flag) => ({
        key: flag.key,
        access: flag.access,
        name: flag.name,
        description: flag.description,
        kind: flag.kind,
        tags: flag.tags,
        variations: flag.variations,
        environments: flag.environments,
        createdAt: new Date(flag.createdAt),
      })),
    );

    // Existence only. onConflictDoNothing means a gate that is already there
    // keeps whatever state it is in, including deliberately off.
    await tx
      .insert(featureFlags)
      .values(
        PROTECTED_FLAGS.map((flag) => ({
          key: flag.key,
          access: flag.access,
          name: flag.name,
          description: flag.description,
          kind: flag.kind,
          tags: flag.tags,
          variations: flag.variations,
          environments: flag.environments,
          createdAt: new Date(flag.createdAt),
        })),
      )
      .onConflictDoNothing({ target: featureFlags.key });

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
    {
      flags: RESETTABLE_FLAGS.length,
      preserved: PROTECTED_FLAGS.length,
      audit: CANONICAL_AUDIT.length,
    },
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
