require('dotenv').config();

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
const { NBA_API } = require("./constants/nba");
const { getCachedData } = require("./utils/cache");
const { rateLimit } = require("./utils/rateLimiter");
const { pool } = require("./config/database");
const nbaRoutes = require('./routes/nba');
const dbRoutes = require('./routes/db');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Request logging
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/nba', nbaRoutes);
app.use('/api/db', dbRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// API rate limiting middleware (only for NBA API routes)
const nbaApiLimiter = (req, res, next) => {
    rateLimit()
        .then(() => next())
        .catch(err => {
            console.error('Rate limit error:', err);
            res.status(429).json({ error: "Too many requests" });
        });
};

// NBA API Proxy endpoint (with rate limiting)
app.get("/api/nba/teams", nbaApiLimiter, async (req, res, next) => {
    try {
        const data = await getCachedData("teams", async () => {
            const startTime = Date.now();
            const url = "https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2024-25&SeasonType=Regular+Season";
            const response = await fetch(url, {
                headers: NBA_API.HEADERS
            });
            
            console.log('Parsing NBA API response');
            const parseStartTime = Date.now();
            const data = await response.json();
            const parseDuration = Date.now() - parseStartTime;
            console.log('Response parsed', { duration: `${parseDuration}ms` });

            if (!data.resultSets?.[0]?.rowSet) {
                throw new Error("Invalid response format from NBA API [Teams]");
            }

            console.log('Transforming team data');
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
            console.log('Team data transformed', { 
                teamCount: teams.length,
                duration: `${transformDuration}ms`
            });

            const totalDuration = Date.now() - startTime;
            console.log('Teams fetch process completed', { 
                totalDuration: `${totalDuration}ms`,
                teamCount: teams.length
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

// Team players endpoint (with rate limiting)
app.get("/api/nba/players/:teamId", nbaApiLimiter, async (req, res, next) => {
    try {
        const teamId = parseInt(req.params.teamId);
        
        if (isNaN(teamId)) {
            return res.status(400).json({ error: "Invalid team ID" });
        }

        const data = await getCachedData(`team-players-${teamId}`, async () => {
            const url = new URL(`${NBA_API.BASE_URL}/commonteamroster`);
            url.searchParams.append("LeagueID", "00");
            url.searchParams.append("Season", "2024-25");
            url.searchParams.append("TeamID", teamId.toString());

            const response = await fetch(url.toString(), {
                headers: NBA_API.HEADERS
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch team players: ${response.status} ${response.statusText}`);
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
                            height_inches: height
                                ? parseInt(height.split("-")[1])
                                : null,
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
                .filter(player => player !== null);

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
        console.error("Error fetching team players:", error);
        res.status(500).json({
            error: "Failed to fetch team players",
            details: error.message
        });
    }
});

// Player stats endpoint (with rate limiting)
app.get("/api/nba/stats/:playerId", nbaApiLimiter, async (req, res, next) => {
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
                Season: "2024-25",
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
                headers: NBA_API.HEADERS
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch player stats: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.resultSets?.[0]?.rowSet?.[0]) {
                throw new Error("Invalid response format from NBA API [Stats]");
            }

            const seasonStats = data.resultSets[0].rowSet[0];
            const pts = parseFloat(seasonStats[26]) || 0;
            const reb = parseFloat(seasonStats[18]) || 0;
            const ast = parseFloat(seasonStats[19]) || 0;
            const stl = parseFloat(seasonStats[20]) || 0;
            const blk = parseFloat(seasonStats[21]) || 0;
            const fantasyPoints = pts * 1 + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3;

            return {
                data: [
                    {
                        games_played: parseInt(seasonStats[2]) || 0,
                        player_id: playerId,
                        season: 2024,
                        min: seasonStats[6] || "0:00",
                        fgm: parseFloat(seasonStats[7]) || 0,
                        fga: parseFloat(seasonStats[8]) || 0,
                        fg_pct: parseFloat(seasonStats[9]) || 0,
                        fg3m: parseFloat(seasonStats[10]) || 0,
                        fg3a: parseFloat(seasonStats[11]) || 0,
                        fg3_pct: parseFloat(seasonStats[12]) || 0,
                        ftm: parseFloat(seasonStats[13]) || 0,
                        fta: parseFloat(seasonStats[14]) || 0,
                        ft_pct: parseFloat(seasonStats[15]) || 0,
                        oreb: parseFloat(seasonStats[16]) || 0,
                        dreb: parseFloat(seasonStats[17]) || 0,
                        reb,
                        ast,
                        turnover: parseFloat(seasonStats[20]) || 0,
                        stl: parseFloat(seasonStats[21]) || 0,
                        blk: parseFloat(seasonStats[22]) || 0,
                        pf: parseFloat(seasonStats[24]) || 0,
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
        console.error("Error fetching player stats:", error);
        res.status(500).json({
            error: "Failed to fetch player stats",
            details: error.message
        });
    }
});

// Database routes (without rate limiting or caching)
app.post("/api/db/query", async (req, res, next) => {
    try {
        const { query, params } = req.body;
        if (!query) {
            return res.status(400).json({ error: "Query is required" });
        }
        const result = await pool.query(query, params || []);
        res.status(200).json(result.rows);
    } catch (error) {
        next(error);
    }
});

app.get("/api/db/tables", async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        res.status(200).json(result.rows.map(row => row.table_name));
    } catch (error) {
        next(error);
    }
});

app.get("/api/db/table/:tableName", async (req, res, next) => {
    try {
        const { tableName } = req.params;
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = $1
        `, [tableName]);
        res.status(200).json(result.rows);
    } catch (error) {
        next(error);
    }
});

// Postforum routes (without rate limiting or caching)
app.get("/api/postforum", async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM postforum ORDER BY id DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        next(error);
    }
});

app.post("/api/postforum", async (req, res, next) => {
    try {
        const { title, text, username } = req.body;
        if (!title || !text || !username) {
            return res.status(400).json({ 
                error: "Missing required fields",
                required: ["title", "text", "username"]
            });
        }
        const result = await pool.query(
            'INSERT INTO postforum (title, text, username) VALUES ($1, $2, $3) RETURNING *',
            [title, text, username]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});