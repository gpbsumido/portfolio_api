import { Router } from 'express';
import { checkDatabaseHealth } from '../../config/database.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const dbConnected = await checkDatabaseHealth();
  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    uptime: process.uptime(),
    dbConnected,
    version: '2.3.0',
  });
});

export default router;
