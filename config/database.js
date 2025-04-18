require('dotenv').config();

const { Pool } = require('pg');

// Debug environment
console.log('Environment:', process.env.NODE_ENV || 'development');

// Use individual connection parameters if available, otherwise use connection string
const poolConfig = process.env.DB_HOST ? {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
} : {
    connectionString: process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL,
    ssl: {
        rejectUnauthorized: false
    }
};

const pool = new Pool(poolConfig);

// Test the connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Database connected successfully');
        release();
    }
});

module.exports = { pool }; 