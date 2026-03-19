const express = require('express');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const upsertUser = require('../middleware/upsertUser');
const { makeUserRateLimiter } = require('../utils/rateLimiter');
const { validateParams } = require('../middleware/validateBody');
const { usernameParam } = require('../schemas');

const followsLimiter = makeUserRateLimiter(50, 60 * 60 * 1000); // 50/hr

const router = express.Router();

// All routes require auth + user upsert
router.use(checkJwt, upsertUser);

// ── POST /api/follows/:username ───────────────────────────────────────────────
// Send a follow request (inserts with status 'pending')
router.post('/:username', followsLimiter, validateParams(usernameParam), async (req, res) => {
  const followerSub = req.auth.payload.sub;
  const { username } = req.params;

  try {
    // Look up the target user's sub by username
    const { rows: targetRows } = await pool.query(
      `SELECT user_sub FROM user_profiles WHERE username = $1`,
      [username],
    );
    if (!targetRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const followingSub = targetRows[0].user_sub;

    if (followerSub === followingSub) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const { rows } = await pool.query(
      `INSERT INTO follows (follower_sub, following_sub)
       VALUES ($1, $2)
       RETURNING id, follower_sub, following_sub, status, created_at, updated_at`,
      [followerSub, followingSub],
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Follow request already exists' });
    }
    console.error('[follows] POST /:username error:', err.message);
    return res.status(500).json({ error: 'Failed to send follow request' });
  }
});

// ── PUT /api/follows/:id/accept ───────────────────────────────────────────────
// Accept a follow request (only the target user can accept)
router.put('/:id/accept', async (req, res) => {
  const followingSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE follows
       SET status = 'accepted'
       WHERE id = $1 AND following_sub = $2 AND status = 'pending'
       RETURNING id, follower_sub, following_sub, status, created_at, updated_at`,
      [id, followingSub],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Follow request not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('[follows] PUT /:id/accept error:', err.message);
    return res.status(500).json({ error: 'Failed to accept follow request' });
  }
});

// ── PUT /api/follows/:id/reject ───────────────────────────────────────────────
// Reject a follow request (only the target user can reject)
router.put('/:id/reject', async (req, res) => {
  const followingSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE follows
       SET status = 'rejected'
       WHERE id = $1 AND following_sub = $2 AND status = 'pending'
       RETURNING id, follower_sub, following_sub, status, created_at, updated_at`,
      [id, followingSub],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Follow request not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('[follows] PUT /:id/reject error:', err.message);
    return res.status(500).json({ error: 'Failed to reject follow request' });
  }
});

// ── DELETE /api/follows/:username ─────────────────────────────────────────────
// Unfollow a user (delete the row where I am the follower)
router.delete('/:username', async (req, res) => {
  const followerSub = req.auth.payload.sub;
  const { username } = req.params;

  try {
    const { rows: targetRows } = await pool.query(
      `SELECT user_sub FROM user_profiles WHERE username = $1`,
      [username],
    );
    if (!targetRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const followingSub = targetRows[0].user_sub;

    const { rowCount } = await pool.query(
      `DELETE FROM follows WHERE follower_sub = $1 AND following_sub = $2`,
      [followerSub, followingSub],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Follow relationship not found' });
    }
    return res.status(204).end();
  } catch (err) {
    console.error('[follows] DELETE /:username error:', err.message);
    return res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

// ── GET /api/follows/requests ─────────────────────────────────────────────────
// Pending follow requests sent to me, with requester profile
router.get('/requests', async (req, res) => {
  const followingSub = req.auth.payload.sub;

  try {
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
    return res.json({ requests: rows });
  } catch (err) {
    console.error('[follows] GET /requests error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch follow requests' });
  }
});

// ── GET /api/follows/following ────────────────────────────────────────────────
// Accepted follows where I am the follower, with target profile
router.get('/following', async (req, res) => {
  const followerSub = req.auth.payload.sub;

  try {
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
    return res.json({ following: rows });
  } catch (err) {
    console.error('[follows] GET /following error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch following list' });
  }
});

// ── GET /api/follows/followers ────────────────────────────────────────────────
// Accepted follows where I am the target, with follower profile
router.get('/followers', async (req, res) => {
  const followingSub = req.auth.payload.sub;

  try {
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
    return res.json({ followers: rows });
  } catch (err) {
    console.error('[follows] GET /followers error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch followers list' });
  }
});

module.exports = router;
