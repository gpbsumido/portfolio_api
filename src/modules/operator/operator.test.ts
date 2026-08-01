import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the repository so we exercise routing + controller + analytics without a DB.
vi.mock('./repository.js', () => ({
  listStores: vi.fn(),
  salesByPeriod: vi.fn(),
  salesByStore: vi.fn(),
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
import { buildBuckets, windowStart } from './analytics.js';
import * as repo from './repository.js';
import operatorRoutes from './routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/operator', operatorRoutes);
  app.use(errorHandler);
  return app;
}

const store = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'store-1',
  name: 'Lobby Fridge',
  location: 'Building A',
  province: 'ON',
  status: 'online',
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('operator routes', () => {
  test('GET /stores returns the fleet as DTOs', async () => {
    vi.mocked(repo.listStores).mockResolvedValue([store()] as never);

    const res = await request(makeApp()).get('/api/operator/stores');
    expect(res.status).toBe(200);
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0]).toEqual({
      id: 'store-1',
      name: 'Lobby Fridge',
      location: 'Building A',
      province: 'ON',
      status: 'online',
    });
    // the createdAt column is not leaked to the client
    expect(res.body.stores[0]).not.toHaveProperty('createdAt');
  });

  test('GET /sales-analytics defaults to month with 12 buckets and a ranking', async () => {
    vi.mocked(repo.salesByPeriod).mockResolvedValue([]);
    vi.mocked(repo.salesByStore).mockResolvedValue([
      { storeId: 's1', storeName: 'One', revenue: 100.005, units: 5 },
      { storeId: 's2', storeName: 'Two', revenue: 40, units: 2 },
    ] as never);

    const res = await request(makeApp()).get('/api/operator/sales-analytics');
    expect(res.status).toBe(200);
    expect(res.body.granularity).toBe('month');
    expect(res.body.buckets).toHaveLength(12);
    expect(res.body.byStore[0].totalRevenue).toBe(100.01); // cents-rounded
    expect(res.body.totalRevenue).toBe(140.01);
  });

  test('GET /sales-analytics honours the granularity query param', async () => {
    vi.mocked(repo.salesByPeriod).mockResolvedValue([]);
    vi.mocked(repo.salesByStore).mockResolvedValue([]);

    const res = await request(makeApp()).get(
      '/api/operator/sales-analytics?granularity=year',
    );
    expect(res.body.granularity).toBe('year');
    expect(res.body.buckets).toHaveLength(5);
  });

  test('GET /sales-analytics falls back to month for a bad granularity', async () => {
    vi.mocked(repo.salesByPeriod).mockResolvedValue([]);
    vi.mocked(repo.salesByStore).mockResolvedValue([]);

    const res = await request(makeApp()).get(
      '/api/operator/sales-analytics?granularity=decade',
    );
    expect(res.body.granularity).toBe('month');
    expect(res.body.buckets).toHaveLength(12);
  });
});

describe('buildBuckets', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  test('returns the fixed count of buckets per granularity', () => {
    expect(buildBuckets('day', [], now)).toHaveLength(7);
    expect(buildBuckets('week', [], now)).toHaveLength(8);
    expect(buildBuckets('month', [], now)).toHaveLength(12);
    expect(buildBuckets('year', [], now)).toHaveLength(5);
  });

  test('fills a DB period row into the matching bucket', () => {
    const rows = [
      { period: new Date('2026-07-01T00:00:00.000Z'), revenue: 100, units: 5 },
      { period: new Date('2026-06-01T00:00:00.000Z'), revenue: 50, units: 2 },
    ];
    const buckets = buildBuckets('month', rows, now);
    expect(buckets[11].revenue).toBe(100); // current month, newest
    expect(buckets[10].revenue).toBe(50);
  });

  test('windowStart is the oldest bucket boundary', () => {
    const start = windowStart('month', now);
    // 12 months back from July 2026 → August 2025
    expect(start.toISOString().slice(0, 7)).toBe('2025-08');
  });
});
