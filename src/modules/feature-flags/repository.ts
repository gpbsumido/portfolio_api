// ---------------------------------------------------------------------------
// Feature-flags module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  type FeatureFlag,
  type FeatureFlagAudit,
  featureFlagAudit,
  featureFlags,
} from '../../config/drizzle/schema.js';
import type { AuditAction, Environment, RolloutWeight } from './types.js';

export async function listFlags(): Promise<FeatureFlag[]> {
  return db.select().from(featureFlags).orderBy(asc(featureFlags.createdAt));
}

export async function getFlag(key: string): Promise<FeatureFlag | null> {
  const rows = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  return rows[0] ?? null;
}

/** Flip the kill switch for one environment. Returns null if the flag or env is missing. */
export async function setEnabled(
  key: string,
  environment: Environment,
  enabled: boolean,
): Promise<FeatureFlag | null> {
  const flag = await getFlag(key);
  const config = flag?.environments[environment];
  if (!flag || !config) return null;

  const environments = {
    ...flag.environments,
    [environment]: { ...config, enabled },
  };
  const [row] = await db
    .update(featureFlags)
    .set({ environments })
    .where(eq(featureFlags.key, key))
    .returning();
  return row ?? null;
}

/** Replace the fallthrough rollout for one environment. Returns null if missing. */
export async function setFallthrough(
  key: string,
  environment: Environment,
  fallthrough: RolloutWeight[],
): Promise<FeatureFlag | null> {
  const flag = await getFlag(key);
  const config = flag?.environments[environment];
  if (!flag || !config) return null;

  const environments = {
    ...flag.environments,
    [environment]: { ...config, fallthrough },
  };
  const [row] = await db
    .update(featureFlags)
    .set({ environments })
    .where(eq(featureFlags.key, key))
    .returning();
  return row ?? null;
}

export async function recordAudit(entry: {
  flagKey: string;
  environment: Environment;
  action: AuditAction;
  summary: string;
  actor: string;
}): Promise<FeatureFlagAudit> {
  const [row] = await db.insert(featureFlagAudit).values(entry).returning();
  return row;
}

export async function listAudit(limit = 50): Promise<FeatureFlagAudit[]> {
  return db
    .select()
    .from(featureFlagAudit)
    .orderBy(desc(featureFlagAudit.createdAt))
    .limit(limit);
}
