// routes/chatgpt.js
require('dotenv').config();
const express = require("express");
const { OpenAI } = require("openai");
const { checkJwt } = require('../middleware/auth');


const router = express.Router();

// Apply authentication middleware to all routes in this router
router.use(checkJwt);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

router.post("/", async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        const chatResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // or "gpt-4"
            messages: [
                { role: "user", content: prompt }
            ],
        });

        res.json({ reply: chatResponse.choices[0].message.content });
    } catch (error) {
        console.error("ChatGPT error:", error);
        res.status(500).json({ error: "ChatGPT request failed" });
    }
});

router.post("/summarize", async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Text for summarization is required" });
    }

    const prompt = `Reword this for a personal reflection in a medical journal so it's clear:\n\n${text}`;

    try {
        const chatResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // or "gpt-4"
            messages: [
                { role: "user", content: prompt }
            ],
        });

        res.json({ reply: chatResponse.choices[0].message.content });
    } catch (error) {
        console.error("ChatGPT error:", error);
        res.status(500).json({ error: "ChatGPT request failed" });
    }
});

module.exports = router;