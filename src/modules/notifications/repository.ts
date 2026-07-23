// ---------------------------------------------------------------------------
// Notifications module — Drizzle ORM repository
//
// Pull-based: notifications are derived by joining likes/replies/reposts/follows
// to the recipient's content, then merged and sorted in JS. No notifications
// table; read state is a single notifications_seen_at column on the profile.
// ---------------------------------------------------------------------------

import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  follows,
  postLikes,
  postReplies,
  posts,
  reposts,
  userProfiles,
} from '../../config/drizzle/schema.js';
import type { NotificationItem, NotificationType } from './types.js';

interface EventRow {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  post_id: string | null;
  created_at: Date;
}

const actor = {
  username: userProfiles.username,
  display_name: userProfiles.displayName,
  avatar_url: userProfiles.avatarUrl,
};

function toItem(type: NotificationType) {
  return (r: EventRow): NotificationItem => ({
    type,
    actor: {
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
    },
    post_id: r.post_id,
    created_at: r.created_at.toISOString(),
  });
}

/**
 * Recent activity aimed at the recipient: likes, replies, and reposts on their
 * posts (by someone else), plus follows of them. Merged newest-first.
 */
export async function listEvents(
  recipientSub: string,
  limit = 50,
): Promise<NotificationItem[]> {
  const [likeRows, replyRows, repostRows, followRows] = await Promise.all([
    db
      .select({ ...actor, post_id: postLikes.postId, created_at: postLikes.createdAt })
      .from(postLikes)
      .innerJoin(posts, eq(posts.id, postLikes.postId))
      .innerJoin(userProfiles, eq(userProfiles.userSub, postLikes.userSub))
      .where(and(eq(posts.userSub, recipientSub), ne(postLikes.userSub, recipientSub)))
      .orderBy(desc(postLikes.createdAt))
      .limit(limit),
    db
      .select({ ...actor, post_id: postReplies.postId, created_at: postReplies.createdAt })
      .from(postReplies)
      .innerJoin(posts, eq(posts.id, postReplies.postId))
      .innerJoin(userProfiles, eq(userProfiles.userSub, postReplies.userSub))
      .where(and(eq(posts.userSub, recipientSub), ne(postReplies.userSub, recipientSub)))
      .orderBy(desc(postReplies.createdAt))
      .limit(limit),
    db
      .select({ ...actor, post_id: reposts.postId, created_at: reposts.createdAt })
      .from(reposts)
      .innerJoin(posts, eq(posts.id, reposts.postId))
      .innerJoin(userProfiles, eq(userProfiles.userSub, reposts.userSub))
      .where(and(eq(posts.userSub, recipientSub), ne(reposts.userSub, recipientSub)))
      .orderBy(desc(reposts.createdAt))
      .limit(limit),
    db
      .select({ ...actor, created_at: follows.createdAt })
      .from(follows)
      .innerJoin(userProfiles, eq(userProfiles.userSub, follows.followerSub))
      .where(eq(follows.followingSub, recipientSub))
      .orderBy(desc(follows.createdAt))
      .limit(limit),
  ]);

  const merged: NotificationItem[] = [
    ...(likeRows as EventRow[]).map(toItem('like')),
    ...(replyRows as EventRow[]).map(toItem('reply')),
    ...(repostRows as EventRow[]).map(toItem('repost')),
    ...(followRows as EventRow[]).map((r) => toItem('follow')({ ...r, post_id: null })),
  ];

  merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return merged.slice(0, limit);
}

/** When the user last viewed notifications, or null if never. */
export async function getSeenAt(recipientSub: string): Promise<Date | null> {
  const rows = await db
    .select({ seenAt: userProfiles.notificationsSeenAt })
    .from(userProfiles)
    .where(eq(userProfiles.userSub, recipientSub))
    .limit(1);
  return rows[0]?.seenAt ?? null;
}

/** Mark notifications as seen at the given time. */
export async function setSeenAt(
  recipientSub: string,
  at: Date,
): Promise<void> {
  await db
    .update(userProfiles)
    .set({ notificationsSeenAt: at })
    .where(eq(userProfiles.userSub, recipientSub));
}
