require('dotenv').config();

const { Pool } = require('pg');

console.log(process.env.DB_HOST);

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false // This allows self-signed certificates
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