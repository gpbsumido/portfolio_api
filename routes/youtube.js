const express = require('express');
const { parseStringPromise } = require("xml2js");

const router = express.Router();

router.get("/recent", async (req, res, next) => {
    try {
        const channel_id = req.query.channel_id;
        if (!channel_id) {
            return res.status(400).json({ error: "channel_id query parameter is required" });
        }

        const response = await fetch(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${channel_id}`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch data from YouTube: ${response.statusText}`);
        }

        const data = await response.text();

        const parsed = await parseStringPromise(data);

        // Map the parsed XML into a JSON array of video data
        const videos = parsed.feed.entry ? parsed.feed.entry.map((entry) => ({
            id: entry["yt:videoId"][0],
            title: entry.title[0],
            published: entry.published[0],
            link: entry.link[0].$.href,
            thumbnail: entry["media:group"][0]["media:thumbnail"][0].$.url,
        })) : [];

        res.status(200).send(videos);
    } catch (error) {
        console.error('YouTube API Error:', error);
        next(error);
    }
});

module.exports = router; 