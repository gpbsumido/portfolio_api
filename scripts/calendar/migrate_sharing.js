require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running sharing migration...');

        // one row per real user. populated on first API call via upsertUser middleware.
        // sub is the Auth0 JWT sub claim. email comes from the JWT email claim.
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
              sub        TEXT PRIMARY KEY,
              email      TEXT NOT NULL UNIQUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created table: users');

        // fast lookup when resolving an invite email to a sub
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);
        console.log('Created index: idx_users_email');

        // one row per (calendar, member) pair.
        // role is 'editor' or 'viewer'. owner is not stored here; the
        // calendar's user_sub IS the owner. invited_by tracks who sent the invite.
        await client.query(`
            CREATE TABLE IF NOT EXISTS calendar_members (
              id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              calendar_id  UUID        NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
              user_sub     TEXT        NOT NULL REFERENCES users(sub)    ON DELETE CASCADE,
              role         TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
              invited_by   TEXT        REFERENCES users(sub) ON DELETE SET NULL,
              created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE (calendar_id, user_sub)
            );
        `);
        console.log('Created table: calendar_members');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendar_members_user
              ON calendar_members(user_sub);
        `);
        console.log('Created index: idx_calendar_members_user');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_calendar_members_calendar
              ON calendar_members(calendar_id);
        `);
        console.log('Created index: idx_calendar_members_calendar');

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
