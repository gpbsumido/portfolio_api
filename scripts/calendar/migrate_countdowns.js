require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running countdowns migration...');

        // target_date is DATE, not TIMESTAMPTZ, because countdowns track days not moments.
        // Storing a plain date avoids timezone math entirely on the server side.
        await client.query(`
            CREATE TABLE IF NOT EXISTS countdowns (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_sub TEXT NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              target_date DATE NOT NULL,
              color TEXT NOT NULL DEFAULT '#6366f1',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created table: countdowns');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_countdowns_user_sub ON countdowns(user_sub);
        `);
        console.log('Created index: idx_countdowns_user_sub');

        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
