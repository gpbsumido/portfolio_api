// ---------------------------------------------------------------------------
// Likes module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { postLikes } from '../../config/drizzle/schema.js';

/** Add a like. Idempotent: liking an already-liked post is a no-op. */
export async function likePost(userSub: string, postId: string): Promise<void> {
  await db
    .insert(postLikes)
    .values({ userSub, postId })
    .onConflictDoNothing();
}

/** Remove a like. No-op if it wasn't liked. */
export async function unlikePost(userSub: string, postId: string): Promise<void> {
  await db
    .delete(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userSub, userSub)));
}

/** Like counts keyed by post id, for the given posts. */
export async function getLikeCounts(
  postIds: string[],
): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: postLikes.postId,
      count: sql<number>`count(*)::int`,
    })
    .from(postLikes)
    .where(inArray(postLikes.postId, postIds))
    .groupBy(postLikes.postId);
  return new Map(rows.map((r) => [r.postId, Number(r.count)]));
}

/** Set of post ids (from the given list) that the user has liked. */
export async function getLikedByUser(
  userSub: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await db
    .select({ postId: postLikes.postId })
    .from(postLikes)
    .where(
      and(eq(postLikes.userSub, userSub), inArray(postLikes.postId, postIds)),
    );
  return new Set(rows.map((r) => r.postId));
}
