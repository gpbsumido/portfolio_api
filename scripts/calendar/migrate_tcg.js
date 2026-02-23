require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running TCG card–event migration...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS event_cards (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
              card_id TEXT NOT NULL,
              card_name TEXT NOT NULL,
              card_set_id TEXT,
              card_set_name TEXT,
              card_image_url TEXT,
              quantity INTEGER NOT NULL DEFAULT 1,
              notes TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created table: event_cards');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_event_cards_event_id ON event_cards(event_id);
        `);
        console.log('Created index: idx_event_cards_event_id');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_event_cards_card_id ON event_cards(card_id);
        `);
        console.log('Created index: idx_event_cards_card_id');

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
