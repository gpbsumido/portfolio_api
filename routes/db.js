const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// Log route registration
console.log('Registering DB routes:');
console.log('  GET /postforum');
console.log('  POST /postforum');
console.log('  POST /query');
console.log('  GET /tables');
console.log('  GET /table/:tableName');

// Database query endpoints
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

// Postforum endpoints
router.get("/postforum", async (req, res, next) => {
    try {
        console.log('POSTFORUM GET: Attempting to fetch posts...');
        const result = await pool.query('SELECT * FROM postforum ORDER BY id DESC');
        console.log('POSTFORUM GET: Successfully fetched', result.rows.length, 'posts');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('POSTFORUM GET ERROR:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        // Handle specific database errors
        if (error.code === '42P01') { // Table does not exist
            return res.status(500).json({ 
                error: 'Database table not found',
                details: 'The postforum table does not exist in the database'
            });
        }
        
        if (error.code === '28P01') { // Authentication failed
            return res.status(500).json({ 
                error: 'Database authentication failed',
                details: 'Invalid database credentials'
            });
        }
        
        next(error);
    }
});

router.post("/postforum", async (req, res, next) => {
    try {
        console.log('POSTFORUM POST: Received request with body:', req.body);
        const { title, text, username } = req.body;
        
        if (!title || !text || !username) {
            console.log('POSTFORUM POST: Missing required fields');
            return res.status(400).json({ 
                error: "Missing required fields",
                required: ["title", "text", "username"]
            });
        }

        console.log('POSTFORUM POST: Attempting to insert new post');
        const result = await pool.query(
            'INSERT INTO postforum (title, text, username) VALUES ($1, $2, $3) RETURNING *',
            [title, text, username]
        );
        
        console.log('POSTFORUM POST: Successfully created post with ID:', result.rows[0].id);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('POSTFORUM POST ERROR:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        // Handle specific database errors
        if (error.code === '42P01') { // Table does not exist
            return res.status(500).json({ 
                error: 'Database table not found',
                details: 'The postforum table does not exist in the database'
            });
        }
        
        if (error.code === '28P01') { // Authentication failed
            return res.status(500).json({ 
                error: 'Database authentication failed',
                details: 'Invalid database credentials'
            });
        }
        
        next(error);
    }
});

module.exports = router; 