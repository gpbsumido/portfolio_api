import type { Server } from 'http';
import { pool } from '../../config/database.js';
import { db as knexDb } from '../../modules/calendar/repository.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'shutdown' });

let isShuttingDown = false;

/** Returns true once a shutdown signal has been received. */
export function isShutdown(): boolean {
  return isShuttingDown;
}

/**
 * Gracefully shut down the process.
 *
 * 1. Stop accepting new connections
 * 2. Wait for in-flight requests (30 s timeout)
 * 3. Close database pools (pg, Knex)
 * 4. Flush the logger
 * 5. Exit
 */
export function setupGracefulShutdown(server: Server): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info({ signal }, 'shutdown signal received — draining connections');

    // 1. Stop accepting new connections
    server.close(() => {
      log.info('HTTP server closed');
    });

    // 2. Force-close after 30 s
    const forceTimer = setTimeout(() => {
      log.error('graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 30_000);
    forceTimer.unref();

    try {
      // 3. Close database pools
      await Promise.allSettled([
        pool.end().then(() => log.info('pg pool closed')),
        knexDb.destroy().then(() => log.info('knex pool closed')),
      ]);
    } catch (err) {
      log.error({ err }, 'error closing database pools');
    }

    // 4. Flush logger
    logger.flush();

    log.info('shutdown complete');
    clearTimeout(forceTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
