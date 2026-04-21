const express = require("express");
const { pool } = require("../config/database");
const { checkJwt } = require("../middleware/auth");
const { scoreBracket, MAX_POSSIBLE } = require("../utils/playoffScoring");

const router = express.Router();

const OFFICIAL_RESULTS_SUB = "OFFICIAL_RESULTS";
const SEASON_RE = /^\d{4}$/;

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

// GET /api/nba/playoffs/picks/:season
// Returns the authenticated user's picks for the season.
router.get("/picks/:season", checkJwt, async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: "season must be a 4-digit year" });
  }

  const userSub = req.auth.payload.sub;

  try {
    const result = await pool.query(
      "SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2",
      [userSub, Number(season)],
    );
    const picks = result.rows[0]?.picks ?? {};
    res.json({ picks });
  } catch (err) {
    console.error("[nba-playoffs] GET /picks/:season failed:", err.message);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// GET /api/nba/playoffs/picks/:season/public?username=<username>
// GET /api/nba/playoffs/picks/:season/public?bracketId=<uuid>
// Public — returns any user's submitted picks.
// Accepts either a username (profiled users) or a bracket UUID (anonymous users).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/picks/:season/public", async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: "season must be a 4-digit year" });
  }

  const { username, bracketId } = req.query;

  try {
    let result;

    if (bracketId && typeof bracketId === "string" && UUID_RE.test(bracketId)) {
      result = await pool.query(
        "SELECT picks FROM nba_playoff_brackets WHERE id = $1 AND season = $2",
        [bracketId, Number(season)],
      );
    } else if (username && typeof username === "string") {
      const profileResult = await pool.query(
        "SELECT user_sub FROM user_profiles WHERE username = $1",
        [username],
      );
      if (!profileResult.rows[0]) {
        return res.status(404).json({ error: "User not found" });
      }
      result = await pool.query(
        "SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2",
        [profileResult.rows[0].user_sub, Number(season)],
      );
    } else {
      return res
        .status(400)
        .json({ error: "username or bracketId is required" });
    }

    if (!result.rows[0]) {
      return res.status(404).json({ error: "No picks found" });
    }

    res.json({ picks: result.rows[0].picks });
  } catch (err) {
    console.error(
      "[nba-playoffs] GET /picks/:season/public failed:",
      err.message,
    );
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// PUT /api/nba/playoffs/picks/:season
// Upserts the authenticated user's picks for the season.
router.put("/picks/:season", checkJwt, async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: "season must be a 4-digit year" });
  }

  const { picks, displayName } = req.body;
  if (!isPlainObject(picks)) {
    return res.status(400).json({ error: "picks must be a plain object" });
  }

  const userSub = req.auth.payload.sub;
  const storedName =
    typeof displayName === "string" && displayName.trim()
      ? displayName.trim().slice(0, 100)
      : null;

  try {
    await pool.query(
      `INSERT INTO nba_playoff_brackets (id, user_sub, season, picks, display_name)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (user_sub, season)
       DO UPDATE SET picks = EXCLUDED.picks, display_name = COALESCE(EXCLUDED.display_name, nba_playoff_brackets.display_name), updated_at = now()`,
      [userSub, Number(season), JSON.stringify(picks), storedName],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[nba-playoffs] PUT /picks/:season failed:", err.message);
    res.status(500).json({ error: "Failed to save picks" });
  }
});

// GET /api/nba/playoffs/leaderboard/:season
// Public — scores all user brackets against the official results row.
router.get("/leaderboard/:season", async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: "season must be a 4-digit year" });
  }

  try {
    const officialResult = await pool.query(
      "SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2",
      [OFFICIAL_RESULTS_SUB, Number(season)],
    );

    const officialPicks = officialResult.rows[0]?.picks ?? null;

    const userBrackets = await pool.query(
      "SELECT id, user_sub, picks, display_name, updated_at FROM nba_playoff_brackets WHERE user_sub != $1 AND season = $2",
      [OFFICIAL_RESULTS_SUB, Number(season)],
    );

    const entries = await Promise.all(
      userBrackets.rows.map(
        async ({
          id,
          user_sub,
          picks,
          display_name: bracketDisplayName,
          updated_at,
        }) => {
          const profileResult = await pool.query(
            "SELECT display_name, username FROM user_profiles WHERE user_sub = $1",
            [user_sub],
          );
          const profile = profileResult.rows[0];
          const displayName =
            profile?.display_name ??
            profile?.username ??
            bracketDisplayName ??
            "Anonymous";
          const username = profile?.username ?? null;

          if (!officialPicks) {
            return {
              userSub: user_sub,
              bracketId: id,
              username,
              displayName,
              score: 0,
              maxPossible: MAX_POSSIBLE,
              breakdown: {
                r1: 0,
                r2: 0,
                cf: 0,
                finals: 0,
                bonuses: 0,
                mvp: 0,
                combinedScoreDiff: null,
              },
              updatedAt: updated_at,
            };
          }

          const { total, breakdown } = scoreBracket(picks, officialPicks);
          return {
            userSub: user_sub,
            bracketId: id,
            username,
            displayName,
            score: total,
            maxPossible: MAX_POSSIBLE,
            breakdown,
            updatedAt: updated_at,
          };
        },
      ),
    );

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreak: lower combinedScoreDiff wins; null diff goes last
      const aDiff = a.breakdown.combinedScoreDiff ?? Infinity;
      const bDiff = b.breakdown.combinedScoreDiff ?? Infinity;
      if (aDiff !== bDiff) return aDiff - bDiff;
      // Final tiebreak: earliest submission first
      return new Date(a.updatedAt) - new Date(b.updatedAt);
    });

    const ranked = entries.map((entry, i) => ({ rank: i + 1, ...entry }));

    res.json({ entries: ranked });
  } catch (err) {
    console.error(
      "[nba-playoffs] GET /leaderboard/:season failed:",
      err.message,
    );
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// PUT /api/nba/playoffs/results/:season
// Admin-only — sets the official results for scoring. Protected by PLAYOFFS_ADMIN_SECRET.
router.put("/results/:season", async (req, res) => {
  const { season } = req.params;
  if (!SEASON_RE.test(season)) {
    return res.status(400).json({ error: "season must be a 4-digit year" });
  }

  const secret = process.env.PLAYOFFS_ADMIN_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { picks } = req.body;
  if (!isPlainObject(picks)) {
    return res.status(400).json({ error: "picks must be a plain object" });
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
    console.error("[nba-playoffs] PUT /results/:season failed:", err.message);
    res.status(500).json({ error: "Failed to save results" });
  }
});

module.exports = router;
