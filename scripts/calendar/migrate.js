require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running calendar migration...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS calendar_events (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id TEXT NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              start_date TIMESTAMPTZ NOT NULL,
              end_date TIMESTAMPTZ NOT NULL,
              all_day BOOLEAN NOT NULL DEFAULT false,
              color TEXT NOT NULL DEFAULT '#3b82f6',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created table: calendar_events');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
        `);
        console.log('Created index: idx_calendar_events_user_id');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
        `);
        console.log('Created index: idx_calendar_events_start_date');

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
