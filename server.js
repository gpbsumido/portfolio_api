require('dotenv').config();

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");

// Local imports
const { NBA_API } = require("./constants/nba");
const { getCachedData } = require("./utils/cache");
const { rateLimit } = require("./utils/rateLimiter");
const { pool } = require("./config/database");
const nbaRoutes = require('./routes/nba');
const dbRoutes = require('./routes/db');

const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors());

// Performance middleware
app.use(compression());

// Request parsing middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use(morgan('dev'));

// Log all registered routes
app.use((req, res, next) => {
    console.log(`Route accessed: ${req.method} ${req.path}`);
    next();
});

// Routes
console.log('Mounting NBA routes at /api/nba');
app.use('/api/nba', nbaRoutes);

console.log('Mounting DB routes at /api');
app.use('/api', dbRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('ERROR DETAILS:', {
        message: err.message,
        stack: err.stack,
        code: err.code,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query
    });
    
    res.status(500).json({ 
        error: `Oops! Something went wrong! ${err.message}`,
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    console.log('404 - Route not found:', req.method, req.path);
    res.status(404).json({ error: "Not Found" });
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});