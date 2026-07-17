/**
 * Knex configuration for database migrations.
 *
 * Usage:
 *   npm run migrate            — run all pending migrations
 *   npm run migrate:rollback   — roll back the last batch
 *   npm run migrate:make <name> — create a new migration file
 *
 * Workflow:
 *   1. Create: npx knex migrate:make add_some_column --knexfile knexfile.ts
 *   2. Edit the generated file in src/migrations/
 *   3. Run:    npm run migrate
 *   4. To undo: npm run migrate:rollback
 *
 * The baseline migration (000_baseline) captures the full schema as of v2.7.0.
 * Existing databases should mark it as already-run:
 *   INSERT INTO knex_migrations (name, batch, migration_time)
 *   VALUES ('000_baseline.ts', 1, NOW());
 */

import 'dotenv/config';
import type { Knex } from 'knex';

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER ?? 'postgres'}:${process.env.DB_PASSWORD ?? 'postgres'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'portfolio'}`;

const config: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  },
  migrations: {
    directory: './src/migrations',
    extension: 'ts',
  },
};

export default config;
