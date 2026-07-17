import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('database');

const connectionString =
  env.DATABASE_URL ||
  `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

export const pool = new Pool({
  connectionString,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
