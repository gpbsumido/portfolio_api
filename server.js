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
        return res.status(200).json({ data: 'Hi' });
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch teams", details: error.message });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});