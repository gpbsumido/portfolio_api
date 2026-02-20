const express = require("express");
const fetch = require("node-fetch");
const { getCachedData } = require("../utils/cache");
const { rateLimit } = require("../utils/rateLimiter");

const router = express.Router();

// Get current NBA season year
function getCurrentSeasonYear() {
  const now = new Date();
  const year = now.getFullYear();

  return now.getMonth() >= 9 ? year : year - 1;
}

// API rate limiting middleware
const nbaApiLimiter = (req, res, next) => {
    rateLimit()
        .then(() => next())
        .catch(err => {
            console.error('Rate limit error:', err);
            res.status(429).json({ error: "Too many requests" });
        });
};

// NBA API Proxy endpoint
router.get("/teams", nbaApiLimiter, async (req, res, next) => {
  try {
    const data = await getCachedData("teams", async () => {
      const year = getCurrentSeasonYear() + 1;
      const url = `https://nba-api-free-data.p.rapidapi.com/nba-league-standings?year=${year}`;

      console.log("[teams] Calling RapidAPI", { url });
      const fetchStart = Date.now();

      const response = await fetch(url, {
        headers: {
          "x-rapidapi-host": "nba-api-free-data.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        },
      });

      console.log("[teams] RapidAPI responded", {
        status: response.status,
        statusText: response.statusText,
        duration: `${Date.now() - fetchStart}ms`,
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("[teams] Non-OK response body:", body.slice(0, 500));
        throw new Error(`RapidAPI request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "success") {
        console.error("[teams] RapidAPI returned non-success status:", data.status, JSON.stringify(data).slice(0, 300));
        throw new Error(`RapidAPI error: ${data.status}`);
      }

      const entries = data.response?.standings?.entries;
      if (!Array.isArray(entries)) {
        console.error("[teams] Unexpected response shape:", JSON.stringify(data).slice(0, 500));
        throw new Error("Invalid response format from RapidAPI [Teams]");
      }

      console.log("[teams] Raw entry count:", entries.length);

      const teams = entries.map((entry) => ({
        id: entry.team.id,
        name: entry.team.name,
        full_name: entry.team.displayName,
        abbreviation: entry.team.abbreviation,
        city: entry.team.location,
        conference: "Unknown",
        division: "Unknown",
        logo: entry.team.logos?.[0]?.href ?? null,
      }));

      console.log("[teams] Teams mapped", { count: teams.length });

      return {
        data: teams,
        meta: {
          total_pages: 1,
          current_page: 1,
          next_page: null,
          per_page: teams.length,
          total_count: teams.length,
        },
      };
    });

    res.status(200).json({ data: data });
  } catch (error) {
    console.error("[teams] Route error:", {
      message: error.message,
      stack: error.stack,
    });
    next(error);
  }
});

// Team players endpoint
router.get("/players/:teamId", nbaApiLimiter, async (req, res, next) => {
  try {
    const { teamId } = req.params;

    if (!teamId) {
      console.warn("[players] Missing teamId param");
      return res.status(400).json({ error: "Invalid team ID" });
    }

    console.log("[players] Fetching roster", { teamId });

    const data = await getCachedData(`team-players-${teamId}`, async () => {
      const url = `https://nba-api-free-data.p.rapidapi.com/nba-player-list?teamid=${teamId}`;

      console.log("[players] Calling RapidAPI", { url });
      const fetchStart = Date.now();

      const response = await fetch(url, {
        headers: {
          "x-rapidapi-host": "nba-api-free-data.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        },
      });

      console.log("[players] RapidAPI responded", {
        status: response.status,
        statusText: response.statusText,
        duration: `${Date.now() - fetchStart}ms`,
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("[players] Non-OK response body:", body.slice(0, 500));
        throw new Error(`RapidAPI request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "success") {
        console.error("[players] RapidAPI returned non-success status:", data.status, JSON.stringify(data).slice(0, 300));
        throw new Error(`RapidAPI error: ${data.status}`);
      }

      const playerList = data.response?.PlayerList;
      if (!Array.isArray(playerList)) {
        console.error("[players] Unexpected response shape:", JSON.stringify(data).slice(0, 500));
        throw new Error("Invalid response format from RapidAPI [Players]");
      }

      console.log("[players] Raw player count:", playerList.length);

      const players = playerList.map((p) => {
        // Parse "7' 0\"" → feet=7, inches=0
        const heightParts = p.displayHeight?.split("'") ?? [];
        const height_feet = heightParts[0] ? parseInt(heightParts[0]) : null;
        const height_inches = heightParts[1] ? parseInt(heightParts[1]) : null;

        return {
          id: p.id,
          first_name: p.firstName,
          last_name: p.lastName,
          position: "N/A",
          height_feet,
          height_inches,
          age: p.age ?? null,
          salary: p.salary ?? null,
          image: p.image ?? null,
          team: {
            id: teamId,
            name: "Unknown",
            full_name: "Unknown",
            abbreviation: "Unknown",
            city: "Unknown",
            conference: "Unknown",
            division: "Unknown",
          },
        };
      });

      console.log("[players] Players mapped", { count: players.length });

      return {
        data: players,
        meta: {
          total_pages: 1,
          current_page: 1,
          next_page: null,
          per_page: players.length,
          total_count: players.length,
        },
      };
    });

    res.status(200).json(data);
  } catch (error) {
    console.error("[players] Route error:", {
      teamId: req.params.teamId,
      message: error.message,
      stack: error.stack,
    });
    next(error);
  }
});

// Player stats endpoint
router.get("/stats/:playerId", nbaApiLimiter, async (req, res, next) => {
  try {
    const { playerId } = req.params;

    if (!playerId) {
      console.warn("[stats] Missing playerId param");
      return res.status(400).json({ error: "Invalid player ID" });
    }

    console.log("[stats] Fetching stats", { playerId });

    const data = await getCachedData(`player-stats-${playerId}`, async () => {
      const url = `https://nba-api-free-data.p.rapidapi.com/nba-player-splits?playerid=${playerId}`;

      console.log("[stats] Calling RapidAPI", { url });
      const fetchStart = Date.now();

      const response = await fetch(url, {
        headers: {
          "x-rapidapi-host": "nba-api-free-data.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        },
      });

      console.log("[stats] RapidAPI responded", {
        status: response.status,
        statusText: response.statusText,
        duration: `${Date.now() - fetchStart}ms`,
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("[stats] Non-OK response body:", body.slice(0, 500));
        throw new Error(`RapidAPI request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "success") {
        console.error("[stats] RapidAPI returned non-success status:", data.status, JSON.stringify(data).slice(0, 300));
        throw new Error(`RapidAPI error: ${data.status}`);
      }

      const allSplits = data.response?.splits?.splitCategories
        ?.find((c) => c.name === "split")
        ?.splits?.find((s) => s.abbreviation === "Total");

      if (!allSplits) {
        console.warn("[stats] No stats found for player", { playerId });
        return {
          data: [],
          meta: {
            total_pages: 1,
            current_page: 1,
            next_page: null,
            per_page: 0,
            total_count: 0,
          },
        };
      }

      const s = allSplits.stats;
      // s indices: 0=GP, 1=MIN, 2=FGM-FGA, 3=FG%, 4=3PM-3PA, 5=3P%,
      //            6=FTM-FTA, 7=FT%, 8=OREB, 9=DREB, 10=REB,
      //            11=AST, 12=BLK, 13=STL, 14=PF, 15=TO, 16=PTS
      const [fgm, fga] = s[2].split("-").map(parseFloat);
      const [fg3m, fg3a] = s[4].split("-").map(parseFloat);
      const [ftm, fta] = s[6].split("-").map(parseFloat);
      const pts = parseFloat(s[16]) || 0;
      const reb = parseFloat(s[10]) || 0;
      const ast = parseFloat(s[11]) || 0;
      const stl = parseFloat(s[13]) || 0;
      const blk = parseFloat(s[12]) || 0;
      const fantasyPoints = pts * 1 + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3;

      const seasonYear = parseInt(
        data.response?.splits?.filters?.find((f) => f.name === "season")?.value,
      ) - 1 || getCurrentSeasonYear();

      console.log("[stats] Computed stats", { playerId, pts, reb, ast, stl, blk, fantasyPoints });

      return {
        data: [
          {
            games_played: parseInt(s[0]) || 0,
            player_id: playerId,
            season: seasonYear,
            min: parseFloat(s[1]) || 0,
            fgm: fgm || 0,
            fga: fga || 0,
            fg_pct: parseFloat(s[3]) / 100 || 0,
            fg3m: fg3m || 0,
            fg3a: fg3a || 0,
            fg3_pct: parseFloat(s[5]) / 100 || 0,
            ftm: ftm || 0,
            fta: fta || 0,
            ft_pct: parseFloat(s[7]) / 100 || 0,
            oreb: parseFloat(s[8]) || 0,
            dreb: parseFloat(s[9]) || 0,
            reb,
            ast,
            turnover: parseFloat(s[15]) || 0,
            stl,
            blk,
            pf: parseFloat(s[14]) || 0,
            pts,
            fantasy_points: fantasyPoints,
          },
        ],
        meta: {
          total_pages: 1,
          current_page: 1,
          next_page: null,
          per_page: 1,
          total_count: 1,
        },
      };
    });

    res.status(200).json(data);
  } catch (error) {
    console.error("[stats] Route error:", {
      playerId: req.params.playerId,
      message: error.message,
      stack: error.stack,
    });
    next(error);
  }
});

module.exports = router; 