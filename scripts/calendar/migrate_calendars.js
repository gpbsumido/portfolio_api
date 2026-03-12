require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running calendars migration...');

        // one row per named calendar per user. sync_mode controls whether events
        // stay local, push one-way to Google primary, or sync two-way with a
        // dedicated Google Calendar. channel_id and friends live here (not on
        // google_auth) because each two_way calendar gets its own watch channel.
        await client.query(`
            CREATE TABLE IF NOT EXISTS calendars (
              id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              name            TEXT        NOT NULL,
              color           TEXT        NOT NULL DEFAULT '#3b82f6',
              user_sub        TEXT        NOT NULL,
              google_cal_id   TEXT,
              google_cal_name TEXT,
              sync_mode       TEXT        NOT NULL DEFAULT 'none',
              channel_id      TEXT,
              resource_id     TEXT,
              channel_expiry  TIMESTAMPTZ,
              sync_token      TEXT,
              created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created table: calendars');

        // fast lookup by user -- the most common query pattern
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendars_user
              ON calendars(user_sub);
        `);
        console.log('Created index: idx_calendars_user');

        // partial index for webhook routing -- only rows with a linked Google Calendar
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendars_google_cal
              ON calendars(google_cal_id) WHERE google_cal_id IS NOT NULL;
        `);
        console.log('Created index: idx_calendars_google_cal');

        // events now belong to a calendar; cascading delete keeps things tidy
        await client.query(`
            ALTER TABLE calendar_events
              ADD COLUMN IF NOT EXISTS calendar_id UUID REFERENCES calendars(id) ON DELETE CASCADE;
        `);
        console.log('Added column: calendar_events.calendar_id');

        // create a "Personal" calendar for every user that already has events.
        // sync_mode='push' preserves the existing one-way Google sync they already had.
        await client.query(`
            INSERT INTO calendars (id, name, color, user_sub, sync_mode)
            SELECT gen_random_uuid(), 'Personal', '#3b82f6', user_sub, 'push'
            FROM   calendar_events
            GROUP  BY user_sub
            ON CONFLICT DO NOTHING;
        `);
        console.log('Inserted Personal calendar for each existing user');

        // backfill calendar_id on existing events to point to their user's Personal calendar
        await client.query(`
            UPDATE calendar_events ce
            SET    calendar_id = c.id
            FROM   calendars c
            WHERE  c.user_sub = ce.user_sub
              AND  c.name = 'Personal'
              AND  ce.calendar_id IS NULL;
        `);
        console.log('Backfilled calendar_id on existing events');

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
