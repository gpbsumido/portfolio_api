require('dotenv').config();

const { Pool } = require('pg');

// Debug environment variables
console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_DATABASE_PUBLIC_URL: !!process.env.DATABASE_PUBLIC_URL
});

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

console.log('Database configuration:', {
    ...poolConfig,
    password: poolConfig.password ? '****' : undefined
});

const pool = new Pool(poolConfig);

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