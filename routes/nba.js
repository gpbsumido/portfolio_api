const express = require("express");
const { NBA_API } = require("../constants/nba");
const { getCachedData } = require("../utils/cache");
const { rateLimit } = require("../utils/rateLimiter");

const router = express.Router();

// Get current NBA season
function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();

  // If Oct or later → new season
  const seasonStartYear = now.getMonth() >= 9 ? year : year - 1;
  const seasonEndYear = seasonStartYear + 1;

  return `${seasonStartYear}-${seasonEndYear.toString().slice(-2)}`;
}
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
    .catch((err) => {
      console.error("Rate limit error:", err);
      res.status(429).json({ error: "Too many requests" });
    });
};

// NBA API Proxy endpoint
router.get("/teams", nbaApiLimiter, async (req, res, next) => {
  try {
    const data = await getCachedData("teams", async () => {
      const startTime = Date.now();
      const season = getCurrentSeason();
      const url =
        `https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=${season}&SeasonType=Regular+Season`;
      const response = await fetch(url, {
        headers: NBA_API.HEADERS,
      });

      console.log("Parsing NBA API response");
      const parseStartTime = Date.now();
      const data = await response.json();
      const parseDuration = Date.now() - parseStartTime;
      console.log("Response parsed", { duration: `${parseDuration}ms` });

      if (!data.resultSets?.[0]?.rowSet) {
        throw new Error("Invalid response format from NBA API [Teams]");
      }

      console.log("Transforming team data");
      const transformStartTime = Date.now();
      const teams = data.resultSets[0].rowSet.map((row) => ({
        id: parseInt(row[2]),
        name: row[4],
        full_name: `${row[3]} ${row[4]}`,
        abbreviation: row[5],
        city: row[3],
        conference: row[6],
        division: row[10],
      }));
      const transformDuration = Date.now() - transformStartTime;
      console.log("Team data transformed", {
        teamCount: teams.length,
        duration: `${transformDuration}ms`,
      });

      const totalDuration = Date.now() - startTime;
      console.log("Teams fetch process completed", {
        totalDuration: `${totalDuration}ms`,
        teamCount: teams.length,
      });

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
    next(error);
  }
});

// Team players endpoint
router.get("/players/:teamId", nbaApiLimiter, async (req, res, next) => {
  try {
    const teamId = parseInt(req.params.teamId);

    if (isNaN(teamId)) {
      return res.status(400).json({ error: "Invalid team ID" });
    }

    const data = await getCachedData(`team-players-${teamId}`, async () => {
      const url = new URL(`${NBA_API.BASE_URL}/commonteamroster`);
      url.searchParams.append("LeagueID", "00");
      url.searchParams.append("Season", getCurrentSeason());
      url.searchParams.append("TeamID", teamId.toString());

      const response = await fetch(url.toString(), {
        headers: NBA_API.HEADERS,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch team players: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.resultSets?.[0]?.rowSet || !data.resultSets[0].headers) {
        throw new Error("Invalid response format from NBA API [Players]");
      }

      const headers = data.resultSets[0].headers;
      const getColumnIndex = (name) => {
        const index = headers.indexOf(name);
        if (index === -1) {
          throw new Error(`Column '${name}' not found in API response`);
        }
        return index;
      };

      const players = data.resultSets[0].rowSet
        .map((row) => {
          try {
            const playerId = row[getColumnIndex("PLAYER_ID")];
            const playerName = row[getColumnIndex("PLAYER")];
            const position = row[getColumnIndex("POSITION")];
            const height = row[getColumnIndex("HEIGHT")];
            const teamId = row[getColumnIndex("TeamID")];

            if (!playerName) {
              throw new Error("Player name is missing");
            }

            return {
              id: playerId,
              first_name: playerName.split(" ")[0],
              last_name: playerName.split(" ").slice(1).join(" "),
              position: position || "N/A",
              height_feet: height ? parseInt(height.split("-")[0]) : null,
              height_inches: height ? parseInt(height.split("-")[1]) : null,
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
          } catch (error) {
            console.error("Error processing player row:", error);
            return null;
          }
        })
        .filter((player) => player !== null);

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
    next(error);
  }
});

// Player stats endpoint
router.get("/stats/:playerId", nbaApiLimiter, async (req, res, next) => {
  try {
    const playerId = parseInt(req.params.playerId);

    if (isNaN(playerId)) {
      return res.status(400).json({ error: "Invalid player ID" });
    }

    const data = await getCachedData(`player-stats-${playerId}`, async () => {
      await rateLimit();

      const url = new URL(`${NBA_API.BASE_URL}/playerdashboardbygeneralsplits`);
      const queryParams = {
        DateFrom: "",
        DateTo: "",
        GameSegment: "",
        LastNGames: "0",
        LeagueID: "00",
        Location: "",
        MeasureType: "Base",
        Month: "0",
        OpponentTeamID: "0",
        Outcome: "",
        PORound: "0",
        PaceAdjust: "N",
        PerMode: "PerGame",
        Period: "0",
        PlayerID: playerId.toString(),
        PlusMinus: "N",
        Rank: "N",
        Season: getCurrentSeason(),
        SeasonSegment: "",
        SeasonType: "Regular Season",
        ShotClockRange: "",
        Split: "general",
        VsConference: "",
        VsDivision: "",
      };

      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      const response = await fetch(url.toString(), {
        headers: NBA_API.HEADERS,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch player stats: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.resultSets?.[0]?.rowSet?.[0] || !data.resultSets[0].headers) {
        throw new Error("Invalid response format from NBA API [Stats]");
      }

      const headers = data.resultSets[0].headers;
      const getColumnIndex = (name) => {
        const index = headers.indexOf(name);
        if (index === -1) {
          throw new Error(`Column '${name}' not found in API response`);
        }
        return index;
      };

      const seasonStats = data.resultSets[0].rowSet[0];
      const get = (name) => seasonStats[getColumnIndex(name)];

      const pts = parseFloat(get("PTS")) || 0;
      const reb = parseFloat(get("REB")) || 0;
      const ast = parseFloat(get("AST")) || 0;
      const stl = parseFloat(get("STL")) || 0;
      const blk = parseFloat(get("BLK")) || 0;
      const fantasyPoints = pts * 1 + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3;

      return {
        data: [
          {
            games_played: parseInt(get("GP")) || 0,
            player_id: playerId,
            season: getCurrentSeasonYear(),
            min: get("MIN") || "0:00",
            fgm: parseFloat(get("FGM")) || 0,
            fga: parseFloat(get("FGA")) || 0,
            fg_pct: parseFloat(get("FG_PCT")) || 0,
            fg3m: parseFloat(get("FG3M")) || 0,
            fg3a: parseFloat(get("FG3A")) || 0,
            fg3_pct: parseFloat(get("FG3_PCT")) || 0,
            ftm: parseFloat(get("FTM")) || 0,
            fta: parseFloat(get("FTA")) || 0,
            ft_pct: parseFloat(get("FT_PCT")) || 0,
            oreb: parseFloat(get("OREB")) || 0,
            dreb: parseFloat(get("DREB")) || 0,
            reb,
            ast,
            turnover: parseFloat(get("TOV")) || 0,
            stl,
            blk,
            pf: parseFloat(get("PF")) || 0,
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
    next(error);
  }
});

module.exports = router;
