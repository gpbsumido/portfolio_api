require('dotenv').config();

const { Pool } = require('pg');

// Log the database URL (without password) for debugging
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
console.log('Database URL:', dbUrl ? dbUrl.replace(/\/\/[^@]+@/, '//****:****@') : 'Not set');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test the connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
    } else {
        console.log('Successfully connected to the database');
        release();
    }
});

module.exports = { pool }; 