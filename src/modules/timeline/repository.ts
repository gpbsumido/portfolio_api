// ---------------------------------------------------------------------------
// Timeline module — repository (raw SQL for JSON_AGG)
// ---------------------------------------------------------------------------

import { pool } from '../../config/database.js';

const TIMELINE_QUERY = `
  SELECT
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
  WHERE p.created_at < $2
    AND (
      p.user_sub = $1
      OR p.user_sub IN (
        SELECT following_sub
        FROM follows
        WHERE follower_sub = $1 AND status = 'accepted'
      )
    )
  GROUP BY p.id, up.username, up.display_name, up.avatar_url
  ORDER BY p.created_at DESC
  LIMIT $3
`;

export async function getTimeline(
  sub: string,
  cursorDate: string,
  limit: number,
) {
  const { rows } = await pool.query(TIMELINE_QUERY, [
    sub,
    cursorDate,
    limit + 1,
  ]);
  return rows;
}
