// ---------------------------------------------------------------------------
// Follows module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { pool } from '../../config/database.js';
import {
  follows,
  userProfiles,
} from '../../config/drizzle/schema.js';
import type { FollowRow, FollowRequestItem, FollowListItem } from './types.js';

// ── Lookup target by username ──────────────────────────────────────────────

export async function getTargetByUsername(
  username: string,
): Promise<{ user_sub: string; is_public: boolean } | null> {
  const rows = await db
    .select({
      user_sub: userProfiles.userSub,
      is_public: userProfiles.isPublic,
    })
    .from(userProfiles)
    .where(eq(userProfiles.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTargetSubByUsername(
  username: string,
): Promise<string | null> {
  const rows = await db
    .select({ user_sub: userProfiles.userSub })
    .from(userProfiles)
    .where(eq(userProfiles.username, username))
    .limit(1);
  return rows[0]?.user_sub ?? null;
}

// ── Follow CRUD ────────────────────────────────────────────────────────────

export async function insertFollow(
  followerSub: string,
  followingSub: string,
  status: string,
): Promise<FollowRow> {
  const [row] = await db
    .insert(follows)
    .values({ followerSub, followingSub, status })
    .returning({
      id: follows.id,
      follower_sub: follows.followerSub,
      following_sub: follows.followingSub,
      status: follows.status,
      created_at: follows.createdAt,
      updated_at: follows.updatedAt,
    });
  return row;
}

export async function acceptFollow(
  followId: string,
  followingSub: string,
): Promise<FollowRow | null> {
  const rows = await db
    .update(follows)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(
      and(
        eq(follows.id, followId),
        eq(follows.followingSub, followingSub),
        eq(follows.status, 'pending'),
      ),
    )
    .returning({
      id: follows.id,
      follower_sub: follows.followerSub,
      following_sub: follows.followingSub,
      status: follows.status,
      created_at: follows.createdAt,
      updated_at: follows.updatedAt,
    });
  return rows[0] ?? null;
}

export async function rejectFollow(
  followId: string,
  followingSub: string,
): Promise<FollowRow | null> {
  const rows = await db
    .update(follows)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(
      and(
        eq(follows.id, followId),
        eq(follows.followingSub, followingSub),
        eq(follows.status, 'pending'),
      ),
    )
    .returning({
      id: follows.id,
      follower_sub: follows.followerSub,
      following_sub: follows.followingSub,
      status: follows.status,
      created_at: follows.createdAt,
      updated_at: follows.updatedAt,
    });
  return rows[0] ?? null;
}

export async function deleteFollow(
  followerSub: string,
  followingSub: string,
): Promise<number> {
  const result = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerSub, followerSub),
        eq(follows.followingSub, followingSub),
      ),
    );
  return result.rowCount ?? 0;
}

// ── Follow queries ─────────────────────────────────────────────────────────

export async function getPendingRequests(
  followingSub: string,
): Promise<FollowRequestItem[]> {
  const { rows } = await pool.query(
    `SELECT
       f.id,
       f.status,
       f.created_at,
       up.username,
       up.display_name,
       up.avatar_url
     FROM follows f
     JOIN user_profiles up ON up.user_sub = f.follower_sub
     WHERE f.following_sub = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [followingSub],
  );
  return rows;
}

export async function getFollowing(
  followerSub: string,
): Promise<FollowListItem[]> {
  const { rows } = await pool.query(
    `SELECT
       f.id,
       f.status,
       f.created_at,
       up.username,
       up.display_name,
       up.avatar_url
     FROM follows f
     JOIN user_profiles up ON up.user_sub = f.following_sub
     WHERE f.follower_sub = $1 AND f.status = 'accepted'
     ORDER BY f.created_at DESC`,
    [followerSub],
  );
  return rows;
}

export async function getFollowers(
  followingSub: string,
): Promise<FollowListItem[]> {
  const { rows } = await pool.query(
    `SELECT
       f.id,
       f.status,
       f.created_at,
       up.username,
       up.display_name,
       up.avatar_url
     FROM follows f
     JOIN user_profiles up ON up.user_sub = f.follower_sub
     WHERE f.following_sub = $1 AND f.status = 'accepted'
     ORDER BY f.created_at DESC`,
    [followingSub],
  );
  return rows;
}
