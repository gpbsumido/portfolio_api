const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// Database query endpoint
router.post("/query", async (req, res, next) => {
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

// Get all tables endpoint
router.get("/tables", async (req, res, next) => {
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

// Get table schema endpoint
router.get("/table/:tableName", async (req, res, next) => {
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

// Postmedical routes
router.get("/postmedical", async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM postmedical ORDER BY id DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        next(error);
    }
});

router.post("/postmedical", async (req, res, next) => {
    try {
        const { title, text, username } = req.body;
        if (!title || !text || !username) {
            return res.status(400).json({ 
                error: "Missing required fields",
                required: ["title", "text", "username"]
            });
        }
        const result = await pool.query(
            'INSERT INTO postmedical (title, text, username) VALUES ($1, $2, $3) RETURNING *',
            [title, text, username]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 