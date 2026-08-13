import { type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env.js';
import { createModuleLogger } from '../shared/utils/logger.js';
import { verifiesServer, isPrivateConnection } from '../../utils/dbSsl.js';
import { pool, connectionString, ssl } from '../../config/pool.js';

const log = createModuleLogger('database');

// The pool is built in config/pool.js so the CommonJS layer and this one share
// a single object. Re-exported here because everything in src/ imports it from
// this path, and moving that would touch fifty files to no benefit.
export { pool };

// Only worth saying when it is actually true. Over a private network there is
// no public path to intercept, so an unverified certificate is beside the point
// rather than a gap — warning anyway trains you to ignore the warning.
if (
  env.NODE_ENV === 'production' &&
  !verifiesServer(ssl) &&
  !isPrivateConnection(connectionString)
) {
  log.warn(
    'database TLS is not verifying the server certificate, and the connection is not private; set DB_CA_CERT to the provider root cert to enable verification',
  );
}

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
