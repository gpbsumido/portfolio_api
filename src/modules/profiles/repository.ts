// ---------------------------------------------------------------------------
// Profiles module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { pool } from '../../config/database.js';
import {
  userProfiles,
  follows,
} from '../../config/drizzle/schema.js';

// ── Own profile ────────────────────────────────────────────────────────────

export async function getOwnProfile(sub: string) {
  const rows = await db
    .select({
      user_sub: userProfiles.userSub,
      username: userProfiles.username,
      display_name: userProfiles.displayName,
      bio: userProfiles.bio,
      avatar_url: userProfiles.avatarUrl,
      is_public: userProfiles.isPublic,
      created_at: userProfiles.createdAt,
      updated_at: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userSub, sub))
    .limit(1);
  return rows[0] ?? null;
}

// ── Update profile ─────────────────────────────────────────────────────────

export async function updateProfile(
  sub: string,
  fields: {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    is_public?: boolean;
  },
) {
  // Use raw SQL for COALESCE pattern to only update provided fields
  const { rows } = await pool.query(
    `UPDATE user_profiles
     SET display_name = COALESCE($2, display_name),
         bio          = COALESCE($3, bio),
         avatar_url   = COALESCE($4, avatar_url),
         is_public    = COALESCE($5, is_public)
     WHERE user_sub = $1
     RETURNING user_sub, username, display_name, bio, avatar_url, is_public, created_at, updated_at`,
    [
      sub,
      fields.display_name ?? null,
      fields.bio ?? null,
      fields.avatar_url ?? null,
      fields.is_public ?? null,
    ],
  );
  return rows[0] ?? null;
}

export async function getIsPublic(sub: string): Promise<boolean | null> {
  const rows = await db
    .select({ is_public: userProfiles.isPublic })
    .from(userProfiles)
    .where(eq(userProfiles.userSub, sub))
    .limit(1);
  return rows[0]?.is_public ?? null;
}

export async function autoAcceptPendingFollows(sub: string): Promise<void> {
  await db
    .update(follows)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(
      and(eq(follows.followingSub, sub), eq(follows.status, 'pending')),
    );
}

// ── Avatar ─────────────────────────────────────────────────────────────────

export async function updateAvatarUrl(sub: string, avatarUrl: string) {
  const rows = await db
    .update(userProfiles)
    .set({ avatarUrl })
    .where(eq(userProfiles.userSub, sub))
    .returning({
      user_sub: userProfiles.userSub,
      username: userProfiles.username,
      display_name: userProfiles.displayName,
      bio: userProfiles.bio,
      avatar_url: userProfiles.avatarUrl,
    });
  return rows[0] ?? null;
}

// ── Setup ──────────────────────────────────────────────────────────────────

export async function createProfile(
  sub: string,
  data: {
    username: string;
    display_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
  },
) {
  const rows = await db
    .insert(userProfiles)
    .values({
      userSub: sub,
      username: data.username,
      displayName: data.display_name ?? null,
      bio: data.bio ?? null,
      avatarUrl: data.avatar_url ?? null,
    })
    .returning({
      user_sub: userProfiles.userSub,
      username: userProfiles.username,
      display_name: userProfiles.displayName,
      bio: userProfiles.bio,
      avatar_url: userProfiles.avatarUrl,
      created_at: userProfiles.createdAt,
      updated_at: userProfiles.updatedAt,
    });
  return rows[0];
}

// ── Discover ───────────────────────────────────────────────────────────────

export async function discoverProfiles(limit: number, offset: number) {
  const { rows } = await pool.query(
    `SELECT p.username, p.display_name, p.avatar_url,
            (SELECT COUNT(*) FROM posts WHERE user_sub = p.user_sub)::int AS post_count,
            (SELECT COUNT(*) FROM follows WHERE following_sub = p.user_sub AND status = 'accepted')::int AS follower_count
     FROM user_profiles p
     WHERE p.is_public = true
     ORDER BY p.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

// ── Public profile ─────────────────────────────────────────────────────────

export async function getPublicProfile(
  username: string,
  viewerSub: string | null,
) {
  const { rows } = await pool.query(
    `SELECT
       p.user_sub,
       p.username,
       p.display_name,
       p.bio,
       p.avatar_url,
       p.is_public,
       p.created_at,
       (SELECT COUNT(*) FROM posts WHERE user_sub = p.user_sub)::int AS post_count,
       (SELECT COUNT(*) FROM follows WHERE following_sub = p.user_sub AND status = 'accepted')::int AS follower_count,
       (SELECT COUNT(*) FROM follows WHERE follower_sub = p.user_sub AND status = 'accepted')::int AS following_count,
       (
         SELECT status FROM follows
         WHERE follower_sub = $2 AND following_sub = p.user_sub
       ) AS follow_status
     FROM user_profiles p
     WHERE p.username = $1`,
    [username, viewerSub],
  );
  return rows[0] ?? null;
}
