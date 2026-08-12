import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env.js';
import { createModuleLogger } from '../shared/utils/logger.js';
import { dbSslConfig, verifiesServer } from '../../utils/dbSsl.js';

const log = createModuleLogger('database');

const connectionString =
  env.DATABASE_URL ||
  `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

const ssl = dbSslConfig({
  nodeEnv: env.NODE_ENV,
  caCert: env.DB_CA_CERT,
  rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
});

if (env.NODE_ENV === 'production' && !verifiesServer(ssl)) {
  log.warn(
    'database TLS is not verifying the server certificate; set DB_CA_CERT to the provider root cert to enable verification',
  );
}

export const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  log.error({ err }, 'unexpected idle client error');
});

pool.on('connect', () => {
  log.debug('new client connected');
});

pool.on('remove', () => {
  log.debug('client removed from pool');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (duration > 100) {
    log.warn({ duration, text }, 'slow query detected');
  }
  return result;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
