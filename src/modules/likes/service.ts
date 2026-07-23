// ---------------------------------------------------------------------------
// Likes module — service
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type { LikeSummary } from './types.js';

/** Like a post on behalf of a user. */
export async function like(userSub: string, postId: string): Promise<void> {
  await repo.likePost(userSub, postId);
}

/** Remove a user's like from a post. */
export async function unlike(userSub: string, postId: string): Promise<void> {
  await repo.unlikePost(userSub, postId);
}

/**
 * Build like summaries for a batch of posts. Counts come for everyone; the
 * `liked` flag is only meaningful when a user is authenticated (null → all
 * false). Every requested id gets an entry, defaulting to zero and not liked.
 */
export async function summaries(
  postIds: string[],
  userSub: string | null,
): Promise<LikeSummary[]> {
  const counts = await repo.getLikeCounts(postIds);
  const liked = userSub
    ? await repo.getLikedByUser(userSub, postIds)
    : new Set<string>();

  return postIds.map((id) => ({
    post_id: id,
    count: counts.get(id) ?? 0,
    liked: liked.has(id),
  }));
}
