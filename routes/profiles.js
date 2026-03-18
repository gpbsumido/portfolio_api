const express = require('express');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const upsertUser = require('../middleware/upsertUser');

const router = express.Router();

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// GET /api/profiles/me — own profile (must come before /:username)
router.get('/me', checkJwt, upsertUser, async (req, res) => {
  const sub = req.auth.payload.sub;
  try {
    const { rows } = await pool.query(
      `SELECT user_sub, username, display_name, bio, avatar_url, created_at, updated_at
       FROM user_profiles
       WHERE user_sub = $1`,
      [sub],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not set up yet' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] GET /me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profiles/me — update own profile fields
router.put('/me', checkJwt, upsertUser, async (req, res) => {
  const sub = req.auth.payload.sub;
  const { display_name, bio, avatar_url } = req.body;

  if (bio !== undefined && bio !== null && bio.length > 160) {
    return res.status(400).json({ error: 'bio must be 160 characters or fewer' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE user_profiles
       SET display_name = COALESCE($2, display_name),
           bio          = COALESCE($3, bio),
           avatar_url   = COALESCE($4, avatar_url)
       WHERE user_sub = $1
       RETURNING user_sub, username, display_name, bio, avatar_url, created_at, updated_at`,
      [sub, display_name ?? null, bio ?? null, avatar_url ?? null],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not set up yet' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] PUT /me error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/profiles/setup — create initial profile
router.post('/setup', checkJwt, upsertUser, async (req, res) => {
  const sub = req.auth.payload.sub;
  const { username, display_name, bio, avatar_url } = req.body;

  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'username must be 3–30 characters and contain only lowercase letters, numbers, and underscores',
    });
  }
  if (bio !== undefined && bio !== null && bio.length > 160) {
    return res.status(400).json({ error: 'bio must be 160 characters or fewer' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_profiles (user_sub, username, display_name, bio, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_sub, username, display_name, bio, avatar_url, created_at, updated_at`,
      [sub, username, display_name ?? null, bio ?? null, avatar_url ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation — could be user_sub (already set up) or username (taken)
      const detail = err.detail ?? '';
      if (detail.includes('user_sub')) {
        return res.status(409).json({ error: 'Profile already set up' });
      }
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('[profiles] POST /setup error:', err.message);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// GET /api/profiles/:username — public profile
router.get('/:username', async (req, res) => {
  const { username } = req.params;
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         p.user_sub,
         p.username,
         p.display_name,
         p.bio,
         p.avatar_url,
         p.created_at,
         0::int AS post_count,
         0::int AS follower_count,
         0::int AS following_count
       FROM user_profiles p
       WHERE p.username = $1`,
      [username],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] GET /:username error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
