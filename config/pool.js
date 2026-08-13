require('dotenv').config();

const { Pool } = require('pg');
const { dbSslConfig } = require('../utils/dbSsl');

/**
 * The one Postgres pool.
 *
 * There used to be two: this file's predecessor built one for the CommonJS
 * layer, and src/config/database.ts built another for everything in TypeScript.
 * Two pools means two sets of connections against the same database, and — the
 * part that actually bit — two places to configure TLS, which had already drifted
 * apart once.
 *
 * It lives here, in plain CommonJS, because both worlds can reach it. The TS
 * side imports it and the older utils/ files require it, so there is exactly one
 * Pool object in the process regardless of which door you came through.
 *
 * Deliberately free of side effects. Its predecessor ran a connect-and-select
 * probe at import time and logged the result, which meant importing the module
 * opened a connection whether or not the importer wanted one, and printed two
 * lines on every boot that said nothing the health endpoint does not.
 */
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const ssl = dbSslConfig({
  nodeEnv: process.env.NODE_ENV,
  caCert: process.env.DB_CA_CERT,
  rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED,
});

const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

module.exports = { pool, connectionString, ssl };
