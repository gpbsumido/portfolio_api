import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the repository so we exercise routing + controller + analytics without a DB.
vi.mock('./repository.js', () => ({
  listStores: vi.fn(),
  getStore: vi.fn(),
  listInventory: vi.fn(),
  restockItems: vi.fn(),
  listAlerts: vi.fn(),
  dismissAlert: vi.fn(),
  listActivity: vi.fn(),
  insertActivity: vi.fn(),
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

const STORE_ID = '11111111-1111-1111-1111-111111111111';
const ALERT_ID = '22222222-2222-2222-2222-222222222222';
const ITEM_ID = '33333333-3333-3333-3333-333333333333';

const store = (over: Partial<Record<string, unknown>> = {}) => ({
  id: STORE_ID,
  name: 'Lobby Fridge',
  location: 'Building A',
  province: 'ON',
  status: 'online',
  temperature: 4.2,
  uptime: 99.1,
  revenue24h: 142.5,
  lastPing: new Date('2026-07-20T00:00:00.000Z'),
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  ...over,
});

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ITEM_ID,
  storeId: STORE_ID,
  productName: 'Cola',
  category: 'beverages',
  currentStock: 3,
  capacity: 12,
  price: 2.5,
  lastRestocked: new Date('2026-07-20T00:00:00.000Z'),
  ...over,
});

const alert = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ALERT_ID,
  storeId: STORE_ID,
  severity: 'critical',
  category: 'low-stock',
  message: 'Cola stock below 20%',
  occurredAt: new Date('2026-07-20T00:00:00.000Z'),
  acknowledged: false,
  ...over,
});

const activity = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '44444444-4444-4444-4444-444444444444',
  storeId: STORE_ID,
  type: 'restock',
  description: 'Restocked 1 item(s) to full capacity',
  occurredAt: new Date('2026-07-20T00:00:00.000Z'),
  actor: 'operator@smartstore.example',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('operator routes', () => {
  test('GET /stores returns the fleet as DTOs', async () => {
    vi.mocked(repo.listStores).mockResolvedValue([store()] as never);

    const res = await request(makeApp()).get('/api/operator/stores');
    expect(res.status).toBe(200);
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0]).toMatchObject({
      id: STORE_ID,
      name: 'Lobby Fridge',
      province: 'ON',
      status: 'online',
      temperature: 4.2,
      uptime: 99.1,
      revenue24h: 142.5,
      lastPing: '2026-07-20T00:00:00.000Z',
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

describe('operator entity routes', () => {
  test('GET /stores/:id returns a store, 404 when unknown', async () => {
    vi.mocked(repo.getStore).mockResolvedValueOnce(store() as never);
    const ok = await request(makeApp()).get(`/api/operator/stores/${STORE_ID}`);
    expect(ok.status).toBe(200);
    expect(ok.body.store.id).toBe(STORE_ID);
    expect(ok.body.store.lastPing).toBe('2026-07-20T00:00:00.000Z');

    vi.mocked(repo.getStore).mockResolvedValueOnce(null);
    const missing = await request(makeApp()).get(
      `/api/operator/stores/${STORE_ID}`,
    );
    expect(missing.status).toBe(404);
  });

  test('GET /stores/:id validates the id is a uuid', async () => {
    const res = await request(makeApp()).get('/api/operator/stores/not-a-uuid');
    expect(res.status).toBe(400);
  });

  test('GET /stores/:id/inventory returns items as DTOs', async () => {
    vi.mocked(repo.listInventory).mockResolvedValue([item()] as never);
    const res = await request(makeApp()).get(
      `/api/operator/stores/${STORE_ID}/inventory`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: ITEM_ID,
      productName: 'Cola',
      currentStock: 3,
      capacity: 12,
      lastRestocked: '2026-07-20T00:00:00.000Z',
    });
  });

  test('POST /stores/:id/restock restocks and logs an activity event', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(store() as never);
    vi.mocked(repo.restockItems).mockResolvedValue([
      item({ currentStock: 12 }),
    ] as never);
    vi.mocked(repo.insertActivity).mockResolvedValue(activity() as never);

    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/restock`)
      .send({ itemIds: [ITEM_ID] });

    expect(res.status).toBe(200);
    expect(res.body.items[0].currentStock).toBe(12);
    expect(res.body.activity.type).toBe('restock');
    expect(vi.mocked(repo.insertActivity)).toHaveBeenCalledOnce();
  });

  test('POST /stores/:id/restock 404s for an unknown store', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(null);
    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/restock`)
      .send({ itemIds: [ITEM_ID] });
    expect(res.status).toBe(404);
  });

  test('POST /stores/:id/restock rejects an empty itemIds list', async () => {
    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/restock`)
      .send({ itemIds: [] });
    expect(res.status).toBe(400);
  });

  test('GET /stores/:id/alerts returns alerts with a timestamp field', async () => {
    vi.mocked(repo.listAlerts).mockResolvedValue([alert()] as never);
    const res = await request(makeApp()).get(
      `/api/operator/stores/${STORE_ID}/alerts`,
    );
    expect(res.status).toBe(200);
    expect(res.body.alerts[0]).toMatchObject({
      id: ALERT_ID,
      severity: 'critical',
      timestamp: '2026-07-20T00:00:00.000Z',
      acknowledged: false,
    });
  });

  test('PATCH /alerts/:id/dismiss acknowledges, 404 when unknown', async () => {
    vi.mocked(repo.dismissAlert).mockResolvedValueOnce(
      alert({ acknowledged: true }) as never,
    );
    const ok = await request(makeApp()).patch(
      `/api/operator/alerts/${ALERT_ID}/dismiss`,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.alert.acknowledged).toBe(true);

    vi.mocked(repo.dismissAlert).mockResolvedValueOnce(null);
    const missing = await request(makeApp()).patch(
      `/api/operator/alerts/${ALERT_ID}/dismiss`,
    );
    expect(missing.status).toBe(404);
  });

  test('GET /stores/:id/activity returns events under an events key', async () => {
    vi.mocked(repo.listActivity).mockResolvedValue([activity()] as never);
    const res = await request(makeApp()).get(
      `/api/operator/stores/${STORE_ID}/activity`,
    );
    expect(res.status).toBe(200);
    expect(res.body.events[0]).toMatchObject({
      type: 'restock',
      timestamp: '2026-07-20T00:00:00.000Z',
      actor: 'operator@smartstore.example',
    });
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
