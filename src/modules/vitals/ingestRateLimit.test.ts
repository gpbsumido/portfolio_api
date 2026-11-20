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

    const statuses: number[] = [];
    for (let sent = 0; sent < 121; sent++) {
      statuses.push((await request(app).post('/api/vitals').send(sample)).status);
    }

    expect(statuses.slice(0, 120)).not.toContain(429);
    expect(statuses[120]).toBe(429);
  });
});
