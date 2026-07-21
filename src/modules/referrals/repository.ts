// ---------------------------------------------------------------------------
// Referrals module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { type Referral, referralClicks, referrals } from '../../config/drizzle/schema.js';

export async function findBySlug(slug: string): Promise<Referral | null> {
  const rows = await db.select().from(referrals).where(eq(referrals.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function insertReferral(values: {
  slug: string;
  targetPath: string;
  label: string | null;
}): Promise<Referral> {
  const [row] = await db.insert(referrals).values(values).returning();
  return row;
}

export async function recordClick(referralId: string, uaHash: string | null): Promise<void> {
  await db.insert(referralClicks).values({ referralId, uaHash });
}

export async function countClicks(referralId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(referralClicks)
    .where(eq(referralClicks.referralId, referralId));
  return rows[0]?.n ?? 0;
}

export async function recentClicks(referralId: string, limit = 20): Promise<{ createdAt: Date }[]> {
  return db
    .select({ createdAt: referralClicks.createdAt })
    .from(referralClicks)
    .where(eq(referralClicks.referralId, referralId))
    .orderBy(desc(referralClicks.createdAt))
    .limit(limit);
}
