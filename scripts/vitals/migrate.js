require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running web_vitals migration...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS web_vitals (
        id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
        metric      TEXT             NOT NULL,
        value       DOUBLE PRECISION NOT NULL,
        rating      TEXT             NOT NULL,
        page        TEXT             NOT NULL,
        nav_type    TEXT,
        created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
      );
    `);
    console.log("Created table: web_vitals");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_vitals_metric
        ON web_vitals(metric);
    `);
    console.log("Created index: idx_web_vitals_metric");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_vitals_page
        ON web_vitals(page);
    `);
    console.log("Created index: idx_web_vitals_page");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_vitals_created_at
        ON web_vitals(created_at);
    `);
    console.log("Created index: idx_web_vitals_created_at");

    // v0.3.1 — add app_version for version-based filtering
    await client.query(`
      ALTER TABLE web_vitals
        ADD COLUMN IF NOT EXISTS app_version VARCHAR(20) NOT NULL DEFAULT 'unknown';
    `);
    console.log("Added column: app_version");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_vitals_app_version
        ON web_vitals(app_version);
    `);
    console.log("Created index: idx_web_vitals_app_version");

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
