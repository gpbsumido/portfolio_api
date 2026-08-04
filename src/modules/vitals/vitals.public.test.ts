import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock database — every read resolves to an empty result set, which is enough
// to prove the endpoint ran without auth (a 200, not a 401).
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }),
    end: vi.fn(),
  },
  checkDatabaseHealth: vi.fn(),
}));

// Mock auth as a HARD REJECT. If a route still ran through checkJwt, the
// request would 401 here. The vitals read endpoints are public, so they must
// never touch this middleware — a 200 proves they don't.
vi.mock('../../config/auth.js', () => ({
  checkJwt: (_req: any, res: any, _next: any) =>
    res.status(401).json({ error: 'Unauthorized' }),
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import vitalsRoutes from './routes.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vitals', vitalsRoutes);
  app.use(errorHandler);
  return app;
}

describe('Web Vitals read endpoints are public', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const readEndpoints = [
    '/api/vitals/summary',
    '/api/vitals/by-page',
    '/api/vitals/by-version',
    '/api/vitals/versions',
  ];

  test.each(readEndpoints)('GET %s returns 200 with no auth', async (path) => {
    const res = await request(createApp()).get(path);
    expect(res.status).toBe(200);
  });
});
