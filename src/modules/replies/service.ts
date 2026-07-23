// ---------------------------------------------------------------------------
// Replies module — service
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type { Reply, ReplyCount } from './types.js';

/** Create a reply and return it fully hydrated with its author. */
export async function createReply(
  userSub: string,
  postId: string,
  content: string,
): Promise<Reply> {
  const id = await repo.insertReply(userSub, postId, content);
  const reply = await repo.getReplyById(id);
  if (!reply) throw new Error('reply vanished after insert');
  return reply;
}

/** List a post's thread, oldest first. */
export async function listReplies(postId: string): Promise<Reply[]> {
  return repo.listReplies(postId);
}

/** Reply counts for a batch of posts; every id gets an entry (default 0). */
export async function counts(postIds: string[]): Promise<ReplyCount[]> {
  const map = await repo.getReplyCounts(postIds);
  return postIds.map((id) => ({ post_id: id, count: map.get(id) ?? 0 }));
}
