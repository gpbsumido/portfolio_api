import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock database
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    end: vi.fn(),
  },
  checkDatabaseHealth: vi.fn(),
}));

// Mock auth — allow all requests through with a fake sub
vi.mock('../../config/auth.js', () => ({
  checkJwt: (_req: any, _res: any, next: any) => {
    _req.auth = { payload: { sub: 'auth0|test-user' } };
    next();
  },
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));

// Mock pino to avoid log noise
vi.mock('../../shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { pool } from '../../config/database.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import vitalsRoutes from './routes.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vitals', vitalsRoutes);
  app.use(errorHandler);
  return app;
}

describe('Vitals endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/vitals', () => {
    test('ingests a valid vital and returns 201', async () => {
      const mockRow = {
        id: 1,
        metric: 'LCP',
        value: 1200,
        rating: 'good',
        page: '/home',
        nav_type: null,
        app_version: '2.0.0',
      };
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app)
        .post('/api/vitals')
        .send({
          metric: 'LCP',
          value: 1200,
          rating: 'good',
          page: '/home',
          app_version: '2.0.0',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ metric: 'LCP', value: 1200 });
    });

    test('rejects missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/vitals')
        .send({ metric: 'LCP' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
    });

    test('rejects invalid metric name', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/vitals')
        .send({
          metric: 'INVALID',
          value: 100,
          rating: 'good',
          page: '/home',
        });

      expect(res.status).toBe(400);
    });

    test('rejects non-numeric value', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/vitals')
        .send({
          metric: 'LCP',
          value: 'not-a-number',
          rating: 'good',
          page: '/home',
        });

      expect(res.status).toBe(400);
    });

    test('defaults app_version to unknown', async () => {
      const mockRow = {
        id: 2,
        metric: 'FCP',
        value: 800,
        rating: 'good',
        page: '/about',
        nav_type: null,
        app_version: 'unknown',
      };
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app)
        .post('/api/vitals')
        .send({
          metric: 'FCP',
          value: 800,
          rating: 'good',
          page: '/about',
        });

      expect(res.status).toBe(201);
      // Verify the query was called with 'unknown' as the app_version
      expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO web_vitals'),
        expect.arrayContaining(['unknown']),
      );
    });
  });

  describe('GET /api/vitals/summary', () => {
    test('returns summary data with auth', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          { metric: 'LCP', p75: '1200', good: '80', needs_improvement: '15', poor: '5', total: '100' },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app).get('/api/vitals/summary');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary.LCP).toMatchObject({
        p75: 1200,
        good: 80,
        needsImprovement: 15,
        poor: 5,
        total: 100,
      });
    });
  });

  describe('GET /api/vitals/versions', () => {
    test('returns version list', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          { app_version: '2.0.0' },
          { app_version: '1.5.0' },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app).get('/api/vitals/versions');

      expect(res.status).toBe(200);
      expect(res.body.versions).toEqual(['2.0.0', '1.5.0']);
    });
  });
});
