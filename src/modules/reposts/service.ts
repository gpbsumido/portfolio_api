// ---------------------------------------------------------------------------
// Reposts module — service
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type { RepostSummary } from './types.js';

export async function repost(userSub: string, postId: string): Promise<void> {
  await repo.repost(userSub, postId);
}

export async function unrepost(userSub: string, postId: string): Promise<void> {
  await repo.unrepost(userSub, postId);
}

/**
 * Repost summaries for a batch of posts. Counts are for everyone; `reposted`
 * is only meaningful when authenticated (null → all false).
 */
export async function summaries(
  postIds: string[],
  userSub: string | null,
): Promise<RepostSummary[]> {
  const counts = await repo.getRepostCounts(postIds);
  const mine = userSub
    ? await repo.getRepostedByUser(userSub, postIds)
    : new Set<string>();

  return postIds.map((id) => ({
    post_id: id,
    count: counts.get(id) ?? 0,
    reposted: mine.has(id),
  }));
}
