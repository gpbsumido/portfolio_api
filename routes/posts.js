const express = require('express');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const upsertUser = require('../middleware/upsertUser');

const router = express.Router();

// POST /api/posts — create a text post
router.post('/', checkJwt, upsertUser, async (req, res) => {
  const sub = req.auth.payload.sub;
  const { type, content } = req.body;

  if (type !== 'text') {
    return res.status(400).json({ error: 'type must be "text"' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }
  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    return res.status(400).json({ error: 'content must be 1–500 characters' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO posts (user_sub, type, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_sub, type, caption, content, created_at, updated_at`,
      [sub, type, trimmed],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[posts] POST / error:', err.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// GET /api/posts/user/:username — paginated posts for a user (public)
router.get('/user/:username', async (req, res) => {
  const { username } = req.params;
  const { cursor } = req.query;
  const LIMIT = 20;

  let cursorDate = null;
  if (cursor) {
    cursorDate = new Date(cursor);
    if (isNaN(cursorDate.getTime())) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.caption,
         p.content,
         p.created_at,
         p.updated_at,
         up.username,
         up.display_name,
         up.avatar_url
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       WHERE up.username = $1
         AND ($2::timestamptz IS NULL OR p.created_at < $2)
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [username, cursorDate ? cursorDate.toISOString() : null, LIMIT + 1],
    );

    const hasMore = rows.length > LIMIT;
    const posts = hasMore ? rows.slice(0, LIMIT) : rows;
    const nextCursor = hasMore ? posts[posts.length - 1].created_at.toISOString() : null;

    res.json({ posts, nextCursor });
  } catch (err) {
    console.error('[posts] GET /user/:username error:', err.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/posts/:id — single post with media array (public)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: postRows } = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.caption,
         p.content,
         p.created_at,
         p.updated_at,
         up.username,
         up.display_name,
         up.avatar_url
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       WHERE p.id = $1`,
      [id],
    );
    if (!postRows.length) return res.status(404).json({ error: 'Post not found' });

    const { rows: mediaRows } = await pool.query(
      `SELECT id, s3_key, url, width, height, position, blur_data_url, created_at
       FROM post_media
       WHERE post_id = $1
       ORDER BY position ASC`,
      [id],
    );

    res.json({ ...postRows[0], media: mediaRows });
  } catch (err) {
    console.error('[posts] GET /:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// DELETE /api/posts/:id — owner only
router.delete('/:id', checkJwt, async (req, res) => {
  const sub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM posts WHERE id = $1 AND user_sub = $2`,
      [id, sub],
    );
    if (rowCount === 0) {
      // Either not found or not owner — don't leak which
      return res.status(404).json({ error: 'Post not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('[posts] DELETE /:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;
