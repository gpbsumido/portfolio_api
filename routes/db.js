const express = require('express');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const router = express.Router();

router.get("/tables", checkJwt, async (req, res, next) => {
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

router.get("/table/:tableName", checkJwt, async (req, res, next) => {
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

router.get("/postforum", async (req, res, next) => {
  try {
    console.log('POSTFORUM GET: Attempting to fetch posts...');
    const result = await pool.query('SELECT * FROM postforum ORDER BY id DESC');
    console.log('POSTFORUM GET: Successfully fetched', result.rows.length, 'posts');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('POSTFORUM GET ERROR:', error);
    next(error);
  }
});

router.post("/postforum", async (req, res, next) => {
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
    console.error('POSTFORUM POST ERROR:', error);
    next(error);
  }
});

// Markers endpoints
router.post("/markers", async (req, res, next) => {
  try {
    const { latitude, longitude, text } = req.body;

    if (!latitude || !longitude || !text) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["latitude", "longitude", "text"]
      });
    }

    const result = await pool.query(
      'INSERT INTO locations (latitude, longitude, text) VALUES ($1, $2, $3) RETURNING *',
      [latitude, longitude, text]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error saving marker:', error.message);
    next(error);
  }
});

router.get("/markers", async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY id DESC');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching markers:', error.message);
    next(error);
  }
});

router.delete("/markers/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Marker ID is required"
      });
    }

    const result = await pool.query(
      'DELETE FROM locations WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Marker not found"
      });
    }

    res.status(200).json({
      message: "Marker deleted successfully",
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting marker:', error.message);
    next(error);
  }
});

module.exports = router; 