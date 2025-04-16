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
        const response = await fetch(url);
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