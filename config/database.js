require('dotenv').config();

const { Pool } = require('pg');

// Debug environment
console.log('Environment:', process.env.NODE_ENV || 'development');

// Create connection pool using DATABASE_URL or individual params
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test the connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.message);
        console.error('Connection string:', process.env.DATABASE_URL || 'using individual params');
    } else {
        console.log('Database connected successfully');
        // Test query to verify connection
        client.query('SELECT NOW()', (err, result) => {
            if (err) {
                console.error('Test query failed:', err.message);
            } else {
                console.log('Test query successful, database time:', result.rows[0].now);
            }
            release();
        });
    }
});

module.exports = { pool }; 