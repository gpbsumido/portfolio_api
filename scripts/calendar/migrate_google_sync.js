require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running google sync migration...');

        // one row per user, stores the oauth tokens and watch channel info.
        // sync_token is Google's cursor -- we hand it back on the next incremental
        // fetch so Google knows what we've already seen.
        await client.query(`
            CREATE TABLE IF NOT EXISTS google_auth (
              user_id        TEXT PRIMARY KEY,
              access_token   TEXT NOT NULL,
              refresh_token  TEXT NOT NULL,
              token_expiry   TIMESTAMPTZ NOT NULL,
              google_cal_id  TEXT NOT NULL DEFAULT 'primary',
              channel_id     TEXT,
              resource_id    TEXT,
              channel_expiry TIMESTAMPTZ,
              sync_token     TEXT,
              created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created table: google_auth');

        // lets us look up which of our events maps to which Google event id,
        // and lets the webhook handler skip events we didn't create here.
        await client.query(`
            ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_event_id TEXT;
        `);
        console.log('Added column: calendar_events.google_event_id');

        // tracks whether the last change to this event came from us or from
        // a Google webhook, so we can skip the outbound push on webhook-driven updates.
        await client.query(`
            ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'local';
        `);
        console.log('Added column: calendar_events.sync_source');

        // partial index so lookups by google_event_id are fast without bloating
        // rows that have never been synced (the NULL rows are excluded).
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendar_events_google
              ON calendar_events(google_event_id)
              WHERE google_event_id IS NOT NULL;
        `);
        console.log('Created index: idx_calendar_events_google');

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
