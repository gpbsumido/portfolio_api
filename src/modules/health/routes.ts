import { Router } from 'express';
import { checkDatabaseHealth } from '../../config/database.js';
import { isShutdown } from '../../shared/utils/shutdown.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const dbConnected = await checkDatabaseHealth();
  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    uptime: process.uptime(),
    dbConnected,
    version: '2.3.2',
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
