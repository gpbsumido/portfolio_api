// ---------------------------------------------------------------------------
// Replies module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { postReplies, userProfiles } from '../../config/drizzle/schema.js';
import type { Reply } from './types.js';

const authorColumns = {
  id: postReplies.id,
  post_id: postReplies.postId,
  content: postReplies.content,
  created_at: postReplies.createdAt,
  username: userProfiles.username,
  display_name: userProfiles.displayName,
  avatar_url: userProfiles.avatarUrl,
};

type ReplyRow = {
  id: string;
  post_id: string;
  content: string;
  created_at: Date;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

function toReply(r: ReplyRow): Reply {
  return {
    id: r.id,
    post_id: r.post_id,
    content: r.content,
    created_at: r.created_at.toISOString(),
    author: {
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
    },
  };
}

/** Insert a reply and return its id. */
export async function insertReply(
  userSub: string,
  postId: string,
  content: string,
): Promise<string> {
  const [row] = await db
    .insert(postReplies)
    .values({ userSub, postId, content })
    .returning({ id: postReplies.id });
  return row.id;
}

/** Fetch one reply with its author, or null. */
export async function getReplyById(id: string): Promise<Reply | null> {
  const rows = await db
    .select(authorColumns)
    .from(postReplies)
    .innerJoin(userProfiles, eq(userProfiles.userSub, postReplies.userSub))
    .where(eq(postReplies.id, id))
    .limit(1);
  return rows[0] ? toReply(rows[0] as ReplyRow) : null;
}

/** All replies for a post, oldest first, each with its author. */
export async function listReplies(postId: string): Promise<Reply[]> {
  const rows = await db
    .select(authorColumns)
    .from(postReplies)
    .innerJoin(userProfiles, eq(userProfiles.userSub, postReplies.userSub))
    .where(eq(postReplies.postId, postId))
    .orderBy(asc(postReplies.createdAt));
  return (rows as ReplyRow[]).map(toReply);
}

/** Reply counts keyed by post id. */
export async function getReplyCounts(
  postIds: string[],
): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: postReplies.postId,
      count: sql<number>`count(*)::int`,
    })
    .from(postReplies)
    .where(inArray(postReplies.postId, postIds))
    .groupBy(postReplies.postId);
  return new Map(rows.map((r) => [r.postId, Number(r.count)]));
}
