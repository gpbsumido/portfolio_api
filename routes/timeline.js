const express = require('express');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const upsertUser = require('../middleware/upsertUser');
const { makeUserRateLimiter } = require('../utils/rateLimiter');

const timelineLimiter = makeUserRateLimiter(120, 60 * 1000); // 120/min

const router = express.Router();

const LIMIT = 20;

/*
 * EXPLAIN ANALYZE — run this against your DB to verify index usage:
 *
 * EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
 * SELECT
 *   p.id, p.type, p.caption, p.content, p.created_at, p.updated_at,
 *   up.username, up.display_name, up.avatar_url,
 *   COALESCE(
 *     JSON_AGG(
 *       JSON_BUILD_OBJECT(
 *         'id', pm.id, 's3_key', pm.s3_key, 'url', pm.url,
 *         'width', pm.width, 'height', pm.height, 'position', pm.position,
 *         'blur_data_url', pm.blur_data_url, 'created_at', pm.created_at
 *       ) ORDER BY pm.position ASC
 *     ) FILTER (WHERE pm.id IS NOT NULL),
 *     '[]'
 *   ) AS media
 * FROM posts p
 * JOIN user_profiles up ON up.user_sub = p.user_sub
 * LEFT JOIN post_media pm ON pm.post_id = p.id
 * WHERE p.created_at < NOW()
 *   AND (
 *     p.user_sub = '<your-sub>'
 *     OR p.user_sub IN (
 *       SELECT following_sub FROM follows
 *       WHERE follower_sub = '<your-sub>' AND status = 'accepted'
 *     )
 *   )
 * GROUP BY p.id, up.username, up.display_name, up.avatar_url
 * ORDER BY p.created_at DESC
 * LIMIT 21;
 *
 * Expected index hits:
 *   - idx_posts_user_sub_created_at    on posts(user_sub, created_at DESC)
 *   - idx_follows_follower_sub_status  on follows(follower_sub, status)
 *   - idx_post_media_post_id           on post_media(post_id)
 */
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

// ── GET /api/timeline ─────────────────────────────────────────────────────────
router.get('/', checkJwt, timelineLimiter, upsertUser, async (req, res) => {
  const sub = req.auth.payload.sub;
  const { cursor } = req.query;

  let cursorDate;
  if (cursor) {
    cursorDate = new Date(cursor);
    if (isNaN(cursorDate.getTime())) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }
  } else {
    cursorDate = new Date();
  }

  try {
    const { rows } = await pool.query(TIMELINE_QUERY, [
      sub,
      cursorDate.toISOString(),
      LIMIT + 1,
    ]);

    const hasMore = rows.length > LIMIT;
    const rawPosts = hasMore ? rows.slice(0, LIMIT) : rows;
    const nextCursor = hasMore ? rawPosts[rawPosts.length - 1].created_at.toISOString() : null;
    const posts = rawPosts.map(({ sub, username, display_name, avatar_url, ...post }) => ({
      ...post,
      author: { sub, username, display_name, avatar_url },
    }));

    return res.json({ posts, nextCursor });
  } catch (err) {
    console.error('[timeline] GET / error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

module.exports = router;
