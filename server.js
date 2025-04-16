const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// NBA API Proxy endpoint
app.get("/api/nba/teams", async (req, res) => {
    try {
        const url = "https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2024-25&SeasonType=Regular+Season";
        const response = await fetch(url, {
            headers: {
                Host: "stats.nba.com",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "x-nba-stats-origin": "stats",
                "x-nba-stats-token": "true",
                Connection: "keep-alive",
                Referer: "https://www.nba.com/",
                Origin: "https://www.nba.com",
                "Cache-Control": "max-age=0",
            }
        });
        const data = await response.json();

        //if (!data.resultSets?.[0]?.rowSet) {
        //    return res.status(500).json({ error: "Failed to fetch teams." });
        //}

        //const teams = data.resultSets[0].rowSet.map((row) => ({
        //    id: parseInt(row[2]),
        //    name: row[4],
        //    full_name: `${row[3]} ${row[4]}`,
        //    abbreviation: row[5],
        //    city: row[3],
        //    conference: row[6],
        //    division: row[10]
        //}));

        return res.status(200).json({ data: data });
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch teams", details: error.message });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});