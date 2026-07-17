import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock database health check
vi.mock('../../config/database.js', () => ({
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
  pool: { query: vi.fn(), end: vi.fn() },
}));

vi.mock('../../shared/utils/shutdown.js', () => ({
  isShutdown: vi.fn().mockReturnValue(false),
  setupGracefulShutdown: vi.fn(),
}));

import healthRoutes from './routes.js';
import { checkDatabaseHealth } from '../../config/database.js';
import { isShutdown } from '../../shared/utils/shutdown.js';

function createApp() {
  const app = express();
  app.use('/api', healthRoutes);
  return app;
}

describe('Health endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('GET /api/health returns ok when DB is connected', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      dbConnected: true,
    });
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('version');
  });

  test('GET /api/health returns degraded when DB is down', async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValueOnce(false);
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.dbConnected).toBe(false);
  });

  test('GET /api/ready returns ready', async () => {
    const app = createApp();
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  test('GET /api/ready returns 503 during shutdown', async () => {
    vi.mocked(isShutdown).mockReturnValueOnce(true);
    const app = createApp();
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'shutting_down' });
  });
});
