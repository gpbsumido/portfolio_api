const express = require('express');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const { scoreBracket, MAX_POSSIBLE } = require('../utils/playoffScoring');

const router = express.Router();

const OFFICIAL_RESULTS_SUB = 'OFFICIAL_RESULTS';
const SEASON_RE = /^\d{4}$/;

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// GET /api/nba/playoffs/picks/:season
// Returns the authenticated user's picks for the season.
router.get('/picks/:season', checkJwt, async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: 'season must be a 4-digit year' });
  }

  const userSub = req.auth.payload.sub;

  try {
    const result = await pool.query(
      'SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2',
      [userSub, Number(season)],
    );
    const picks = result.rows[0]?.picks ?? {};
    res.json({ picks });
  } catch (err) {
    console.error('[nba-playoffs] GET /picks/:season failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch picks' });
  }
});

// PUT /api/nba/playoffs/picks/:season
// Upserts the authenticated user's picks for the season.
router.put('/picks/:season', checkJwt, async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: 'season must be a 4-digit year' });
  }

  const { picks } = req.body;
  if (!isPlainObject(picks)) {
    return res.status(400).json({ error: 'picks must be a plain object' });
  }

  const userSub = req.auth.payload.sub;

  try {
    await pool.query(
      `INSERT INTO nba_playoff_brackets (id, user_sub, season, picks)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_sub, season)
       DO UPDATE SET picks = EXCLUDED.picks, updated_at = now()`,
      [userSub, Number(season), JSON.stringify(picks)],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[nba-playoffs] PUT /picks/:season failed:', err.message);
    res.status(500).json({ error: 'Failed to save picks' });
  }
});

// GET /api/nba/playoffs/leaderboard/:season
// Public — scores all user brackets against the official results row.
router.get('/leaderboard/:season', async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: 'season must be a 4-digit year' });
  }

  try {
    const officialResult = await pool.query(
      'SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2',
      [OFFICIAL_RESULTS_SUB, Number(season)],
    );

    const officialPicks = officialResult.rows[0]?.picks ?? null;

    // No official results yet — return empty leaderboard
    if (!officialPicks) {
      return res.json({ entries: [] });
    }

    const userBrackets = await pool.query(
      'SELECT user_sub, picks FROM nba_playoff_brackets WHERE user_sub != $1 AND season = $2',
      [OFFICIAL_RESULTS_SUB, Number(season)],
    );

    const entries = await Promise.all(
      userBrackets.rows.map(async ({ user_sub, picks }) => {
        const profileResult = await pool.query(
          'SELECT display_name, username FROM user_profiles WHERE user_sub = $1',
          [user_sub],
        );
        const profile = profileResult.rows[0];
        const displayName = profile?.display_name ?? profile?.username ?? 'Anonymous';

        const { total, breakdown } = scoreBracket(picks, officialPicks);

        return { userSub: user_sub, displayName, score: total, maxPossible: MAX_POSSIBLE, breakdown };
      }),
    );

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreak: lower combinedScoreDiff wins; null diff goes last
      const aDiff = a.breakdown.combinedScoreDiff ?? Infinity;
      const bDiff = b.breakdown.combinedScoreDiff ?? Infinity;
      return aDiff - bDiff;
    });

    const ranked = entries.map((entry, i) => ({ rank: i + 1, ...entry }));

    res.json({ entries: ranked });
  } catch (err) {
    console.error('[nba-playoffs] GET /leaderboard/:season failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// PUT /api/nba/playoffs/results/:season
// Admin-only — sets the official results for scoring. Protected by PLAYOFFS_ADMIN_SECRET.
router.put('/results/:season', async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: 'season must be a 4-digit year' });
  }

  const secret = process.env.PLAYOFFS_ADMIN_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { picks } = req.body;
  if (!isPlainObject(picks)) {
    return res.status(400).json({ error: 'picks must be a plain object' });
  }

  try {
    await pool.query(
      `INSERT INTO nba_playoff_brackets (id, user_sub, season, picks)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_sub, season)
       DO UPDATE SET picks = EXCLUDED.picks, updated_at = now()`,
      [OFFICIAL_RESULTS_SUB, Number(season), JSON.stringify(picks)],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[nba-playoffs] PUT /results/:season failed:', err.message);
    res.status(500).json({ error: 'Failed to save results' });
  }
});

module.exports = router;
