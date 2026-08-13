import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { checkDatabaseHealth } from '../../config/database.js';
import { isShutdown } from '../../shared/utils/shutdown.js';

/**
 * The running version, read from package.json once at startup.
 *
 * This was a string literal, and it had drifted five releases behind — it said
 * 2.3.2 while the package was on 4.6.x. That is worse than omitting the field:
 * it is the first thing anyone checks to see whether a deploy landed, so it
 * reports failure on every successful deploy. It cost a real detour once,
 * where a correct release looked broken.
 *
 * Read rather than imported so the path does not have to escape rootDir.
 * src/modules/health and dist/modules/health sit at the same depth, so one
 * relative path works in both dev and the build.
 */
function readVersion(): string {
  try {
    const pkg = readFileSync(join(__dirname, '../../../package.json'), 'utf8');
    return (JSON.parse(pkg) as { version?: string }).version ?? 'unknown';
  } catch {
    // A health endpoint that throws is worse than one that cannot name itself.
    return 'unknown';
  }
}

const VERSION = readVersion();

const router = Router();

router.get('/health', async (_req, res) => {
  const dbConnected = await checkDatabaseHealth();
  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    uptime: process.uptime(),
    dbConnected,
    version: VERSION,
  });
});

router.get('/ready', (_req, res) => {
  if (isShutdown()) {
    res.status(503).json({ status: 'shutting_down' });
    return;
  }
  res.json({ status: 'ready' });
});

export default router;
