// ---------------------------------------------------------------------------
// Posts module — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { eq, and, lt, sql, desc } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { pool } from '../../config/database.js';
import {
  posts,
  postMedia,
  userProfiles,
  follows,
} from '../../config/drizzle/schema.js';
import type { PostRow, MediaRow } from './types.js';

// ── Post CRUD ──────────────────────────────────────────────────────────────

export async function insertTextPost(
  userSub: string,
  content: string,
): Promise<PostRow> {
  const [row] = await db
    .insert(posts)
    .values({ userSub, type: 'text', content })
    .returning({
      id: posts.id,
      user_sub: posts.userSub,
      type: posts.type,
      caption: posts.caption,
      content: posts.content,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
    });
  return row;
}

export async function insertPhotoPost(
  userSub: string,
  caption: string | null,
): Promise<PostRow> {
  const [row] = await db
    .insert(posts)
    .values({ userSub, type: 'photo', caption })
    .returning({
      id: posts.id,
      user_sub: posts.userSub,
      type: posts.type,
      caption: posts.caption,
      content: posts.content,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
    });
  return row;
}

export async function insertMediaRow(
  postId: string,
  data: {
    s3Key: string;
    url: string;
    width: number;
    height: number;
    position: number;
    blurDataUrl: string;
    mediaType: string;
    thumbnailUrl: string;
    duration?: number;
  },
): Promise<MediaRow> {
  const [row] = await db
    .insert(postMedia)
    .values({
      postId,
      s3Key: data.s3Key,
      url: data.url,
      width: data.width,
      height: data.height,
      position: data.position,
      blurDataUrl: data.blurDataUrl,
      mediaType: data.mediaType,
      thumbnailUrl: data.thumbnailUrl,
      duration: data.duration ?? null,
    })
    .returning({
      id: postMedia.id,
      s3_key: postMedia.s3Key,
      url: postMedia.url,
      width: postMedia.width,
      height: postMedia.height,
      position: postMedia.position,
      blur_data_url: postMedia.blurDataUrl,
      media_type: postMedia.mediaType,
      thumbnail_url: postMedia.thumbnailUrl,
      duration: postMedia.duration,
      created_at: postMedia.createdAt,
    });
  return row;
}

export async function getMediaS3Keys(
  postId: string,
): Promise<{ s3_key: string }[]> {
  return db
    .select({ s3_key: postMedia.s3Key })
    .from(postMedia)
    .where(eq(postMedia.postId, postId));
}

export async function deletePost(
  postId: string,
  userSub: string,
): Promise<number> {
  const result = await db
    .delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.userSub, userSub)));
  return result.rowCount ?? 0;
}

// ── Single post by ID ──────────────────────────────────────────────────────

export async function getPostById(postId: string) {
  const rows = await db
    .select({
      id: posts.id,
      type: posts.type,
      caption: posts.caption,
      content: posts.content,
      created_at: posts.createdAt,
      updated_at: posts.updatedAt,
      sub: posts.userSub,
      username: userProfiles.username,
      display_name: userProfiles.displayName,
      avatar_url: userProfiles.avatarUrl,
    })
    .from(posts)
    .innerJoin(userProfiles, eq(userProfiles.userSub, posts.userSub))
    .where(eq(posts.id, postId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPostMediaByPostId(postId: string): Promise<MediaRow[]> {
  return db
    .select({
      id: postMedia.id,
      s3_key: postMedia.s3Key,
      url: postMedia.url,
      width: postMedia.width,
      height: postMedia.height,
      position: postMedia.position,
      blur_data_url: postMedia.blurDataUrl,
      media_type: postMedia.mediaType,
      thumbnail_url: postMedia.thumbnailUrl,
      duration: postMedia.duration,
      created_at: postMedia.createdAt,
    })
    .from(postMedia)
    .where(eq(postMedia.postId, postId))
    .orderBy(postMedia.position);
}

// ── Posts by username (with JSON_AGG) ──────────────────────────────────────

export async function getProfileVisibility(
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

export async function isAcceptedFollower(
  followerSub: string,
  followingSub: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: follows.id })
    .from(follows)
    .where(
      and(
        eq(follows.followerSub, followerSub),
        eq(follows.followingSub, followingSub),
        eq(follows.status, 'accepted'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Complex query using raw SQL for JSON_AGG — Drizzle's query builder doesn't
 * support this construct.
 */
export async function getPostsByUsername(
  username: string,
  cursorDate: string | null,
  limit: number,
) {
  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.type,
       p.caption,
       p.content,
       p.created_at,
       p.updated_at,
       p.user_sub AS sub,
       up.username,
       up.display_name,
       up.avatar_url,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',            pm.id,
             's3_key',        pm.s3_key,
             'url',           pm.url,
             'width',         pm.width,
             'height',        pm.height,
             'position',      pm.position,
             'blur_data_url', pm.blur_data_url,
             'media_type',    pm.media_type,
             'thumbnail_url', pm.thumbnail_url,
             'duration',      pm.duration,
             'created_at',    pm.created_at
           ) ORDER BY pm.position ASC
         ) FILTER (WHERE pm.id IS NOT NULL),
         '[]'
       ) AS media
     FROM posts p
     JOIN user_profiles up ON up.user_sub = p.user_sub
     LEFT JOIN post_media pm ON pm.post_id = p.id
     WHERE up.username = $1
       AND ($2::timestamptz IS NULL OR p.created_at < $2)
     GROUP BY p.id, up.username, up.display_name, up.avatar_url
     ORDER BY p.created_at DESC
     LIMIT $3`,
    [username, cursorDate, limit + 1],
  );
  return rows;
}

export async function getDiscoverPosts(limit: number) {
  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.type,
       p.caption,
       p.content,
       p.created_at,
       p.user_sub AS sub,
       up.username,
       up.display_name,
       up.avatar_url,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',            pm.id,
             'url',           pm.url,
             'width',         pm.width,
             'height',        pm.height,
             'position',      pm.position,
             'blur_data_url', pm.blur_data_url,
             'media_type',    pm.media_type,
             'thumbnail_url', pm.thumbnail_url,
             'duration',      pm.duration
           ) ORDER BY pm.position ASC
         ) FILTER (WHERE pm.id IS NOT NULL),
         '[]'
       ) AS media
     FROM posts p
     JOIN user_profiles up ON up.user_sub = p.user_sub
     LEFT JOIN post_media pm ON pm.post_id = p.id
     WHERE up.is_public = true
     GROUP BY p.id, up.username, up.display_name, up.avatar_url
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
