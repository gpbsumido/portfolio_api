import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }), end: vi.fn() },
  checkDatabaseHealth: vi.fn(),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import vitalsRoutes from './routes.js';

const sample = { metric: 'LCP', value: 1800, rating: 'good', page: '/', app_version: '9.2.16' };

/**
 * Vitals ingest is anonymous on purpose, so nothing but a limit stops one
 * client from filling the table. A real page session sends a handful of
 * samples; 120 a minute from one IP is far past that.
 */
describe('POST /api/vitals rate limit', () => {
  test('the 121st sample in a minute from one IP gets a 429', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/vitals', vitalsRoutes);
    app.use(errorHandler);

    // One server, bound to 127.0.0.1 and listening before the first request.
    // request(app) binds a fresh server on `::` per call and dials 127.0.0.1, and
    // under a parallel run one of the 121 came back with no RateLimit headers at
    // all: something else on that port answered it, and the count came up short.
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const statuses: number[] = [];
    try {
      for (let sent = 0; sent < 121; sent++) {
        statuses.push((await request(server).post('/api/vitals').send(sample)).status);
      }
    } finally {
      server.close();
    }

    expect(statuses.slice(0, 120)).not.toContain(429);
    expect(statuses[120]).toBe(429);
  });
});
