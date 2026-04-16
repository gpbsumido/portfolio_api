require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-migration.js <migration-file>");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");
const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL,
  ssl: { rejectUnauthorized: false },
});

pool
  .query(sql)
  .then(() => {
    console.log(`Applied: ${file}`);
    pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    pool.end();
    process.exit(1);
  });
