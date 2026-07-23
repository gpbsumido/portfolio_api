// ---------------------------------------------------------------------------
// Reposts module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { reposts } from '../../config/drizzle/schema.js';

/** Add a repost. Idempotent: reposting again is a no-op. */
export async function repost(userSub: string, postId: string): Promise<void> {
  await db
    .insert(reposts)
    .values({ userSub, postId })
    .onConflictDoNothing();
}

/** Remove a repost. No-op if it wasn't reposted. */
export async function unrepost(userSub: string, postId: string): Promise<void> {
  await db
    .delete(reposts)
    .where(and(eq(reposts.postId, postId), eq(reposts.userSub, userSub)));
}

/** Repost counts keyed by post id. */
export async function getRepostCounts(
  postIds: string[],
): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: reposts.postId,
      count: sql<number>`count(*)::int`,
    })
    .from(reposts)
    .where(inArray(reposts.postId, postIds))
    .groupBy(reposts.postId);
  return new Map(rows.map((r) => [r.postId, Number(r.count)]));
}

/** Set of post ids (from the given list) that the user has reposted. */
export async function getRepostedByUser(
  userSub: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await db
    .select({ postId: reposts.postId })
    .from(reposts)
    .where(and(eq(reposts.userSub, userSub), inArray(reposts.postId, postIds)));
  return new Set(rows.map((r) => r.postId));
}
