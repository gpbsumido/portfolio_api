import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  listStores: vi.fn(),
  getStore: vi.fn(),
  listInventory: vi.fn(),
  listSales: vi.fn(),
  listAlerts: vi.fn(),
  dismissAlert: vi.fn(),
  listActivity: vi.fn(),
  insertActivity: vi.fn(),
  getPlanogram: vi.fn(),
  setPlanogram: vi.fn(),
  alertStatsByStore: vi.fn(),
  inventoryStatsByStore: vi.fn(),
  alertHourlyTrend: vi.fn(),
  salesByPeriod: vi.fn(),
  salesByStore: vi.fn(),
  openSession: vi.fn(),
  getSession: vi.fn(),
  listSessionLines: vi.fn(),
  listSessions: vi.fn(),
  upsertLine: vi.fn(),
  completeSession: vi.fn(),
  listPromotions: vi.fn(),
  getPromotion: vi.fn(),
  insertPromotion: vi.fn(),
  endPromotion: vi.fn(),
  salesInWindow: vi.fn(),
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
const PROMO_ID = '88888888-8888-8888-8888-888888888888';

const store = () => ({
  id: STORE_ID,
  name: 'Lobby Fridge',
  location: 'Building A',
  province: 'ON',
  timezone: null,
  status: 'online',
  temperature: 4.2,
  uptime: 99.1,
  revenue24h: 142.5,
  lastPing: new Date('2026-08-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
});

const promo = (over: Partial<Record<string, unknown>> = {}) => ({
  id: PROMO_ID,
  storeId: STORE_ID,
  productName: 'Energy Bar',
  percent: 20,
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: new Date('2026-08-11T00:00:00.000Z'),
  actor: 'operator@smartstore.example',
  createdAt: new Date('2026-07-31T00:00:00.000Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('creating a promotion', () => {
  test('creates one and emits the previously-unused price-update activity', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(store() as never);
    vi.mocked(repo.insertPromotion).mockResolvedValue(promo() as never);
    vi.mocked(repo.insertActivity).mockResolvedValue({} as never);

    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/promotions`)
      .send({
        productName: 'Energy Bar',
        percent: 20,
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-08-11T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.promotion).toMatchObject({
      percent: 20,
      productName: 'Energy Bar',
    });

    const activity = vi.mocked(repo.insertActivity).mock.calls[0][0];
    expect(activity.type).toBe('price-update');
    expect(activity.description).toMatch(/20% off Energy Bar/);
  });

  test('describes a store-wide promotion as covering every product', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(store() as never);
    vi.mocked(repo.insertPromotion).mockResolvedValue(
      promo({ productName: null }) as never,
    );
    vi.mocked(repo.insertActivity).mockResolvedValue({} as never);

    await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/promotions`)
      .send({
        productName: null,
        percent: 15,
        startsAt: '2026-08-01T00:00:00.000Z',
      });

    const activity = vi.mocked(repo.insertActivity).mock.calls[0][0];
    expect(activity.description).toMatch(/every product/);
  });

  test('rejects a percent outside 1-90', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(store() as never);

    for (const percent of [0, 95]) {
      const res = await request(makeApp())
        .post(`/api/operator/stores/${STORE_ID}/promotions`)
        .send({ percent, startsAt: '2026-08-01T00:00:00.000Z' });
      expect(res.status).toBe(400);
    }
    expect(vi.mocked(repo.insertPromotion)).not.toHaveBeenCalled();
  });

  test('rejects an end before its start', async () => {
    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/promotions`)
      .send({
        percent: 20,
        startsAt: '2026-08-10T00:00:00.000Z',
        endsAt: '2026-08-01T00:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(vi.mocked(repo.insertPromotion)).not.toHaveBeenCalled();
  });

  test('404s for an unknown store', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(null);

    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/promotions`)
      .send({ percent: 20, startsAt: '2026-08-01T00:00:00.000Z' });
    expect(res.status).toBe(404);
  });
});

describe('reading promotions', () => {
  test('returns them with a status derived at read time', async () => {
    vi.mocked(repo.listPromotions).mockResolvedValue([
      promo({
        startsAt: new Date('2030-01-01T00:00:00.000Z'),
        endsAt: null,
      }),
    ] as never);

    const res = await request(makeApp()).get(
      `/api/operator/stores/${STORE_ID}/promotions`,
    );

    expect(res.status).toBe(200);
    expect(res.body.promotions[0].status).toBe('scheduled');
  });
});

describe('ending a promotion', () => {
  test('closes it rather than deleting it', async () => {
    vi.mocked(repo.endPromotion).mockResolvedValue(
      promo({ endsAt: new Date() }) as never,
    );

    const res = await request(makeApp()).patch(
      `/api/operator/promotions/${PROMO_ID}/end`,
    );

    expect(res.status).toBe(200);
    expect(res.body.promotion.endsAt).not.toBeNull();
    expect(res.body.promotion.status).toBe('ended');
  });

  test('404s for an unknown promotion', async () => {
    vi.mocked(repo.endPromotion).mockResolvedValue(null);
    const res = await request(makeApp()).patch(
      `/api/operator/promotions/${PROMO_ID}/end`,
    );
    expect(res.status).toBe(404);
  });
});

describe('promotion performance', () => {
  test('compares the window against the equal-length period before it', async () => {
    vi.mocked(repo.getPromotion).mockResolvedValue(promo() as never);
    vi.mocked(repo.salesInWindow).mockResolvedValue([
      // In the promo window
      { productName: 'Energy Bar', quantity: 8, total: 20, occurredAt: new Date('2026-08-02T10:00:00.000Z') },
      // In the baseline before it
      { productName: 'Energy Bar', quantity: 5, total: 25, occurredAt: new Date('2026-07-24T10:00:00.000Z') },
      // A different product, ignored for a targeted promotion
      { productName: 'Coca-Cola 355ml', quantity: 40, total: 99, occurredAt: new Date('2026-08-03T10:00:00.000Z') },
    ] as never);

    const res = await request(makeApp()).get(
      `/api/operator/promotions/${PROMO_ID}/performance`,
    );

    expect(res.status).toBe(200);
    expect(res.body.window).toEqual({ units: 8, revenue: 20 });
    expect(res.body.baseline).toEqual({ units: 5, revenue: 25 });
    expect(res.body.unitsChangePercent).toBe(60);
    expect(res.body.revenueChangePercent).toBe(-20);
  });

  test('says out loud that it is a comparison, not attribution', async () => {
    vi.mocked(repo.getPromotion).mockResolvedValue(promo() as never);
    vi.mocked(repo.salesInWindow).mockResolvedValue([]);

    const res = await request(makeApp()).get(
      `/api/operator/promotions/${PROMO_ID}/performance`,
    );

    expect(res.body.note).toMatch(/not a claim that the promotion caused/i);
  });

  test('fetches a baseline as long as the window itself', async () => {
    vi.mocked(repo.getPromotion).mockResolvedValue(promo() as never);
    vi.mocked(repo.salesInWindow).mockResolvedValue([]);

    await request(makeApp()).get(
      `/api/operator/promotions/${PROMO_ID}/performance`,
    );

    const [, from, to] = vi.mocked(repo.salesInWindow).mock.calls[0];
    // Window is Aug 1 -> Aug 11, so the fetch starts 10 days earlier.
    expect(from.toISOString()).toBe('2026-07-22T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  test('404s for an unknown promotion', async () => {
    vi.mocked(repo.getPromotion).mockResolvedValue(null);
    const res = await request(makeApp()).get(
      `/api/operator/promotions/${PROMO_ID}/performance`,
    );
    expect(res.status).toBe(404);
  });
});
