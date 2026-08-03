import express, { type Router } from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

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

// Its own file on purpose: the limiters are module-level, so hammering one here
// would eat the budget for every other test in a shared file.
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/operator', operatorRoutes);
  app.use(errorHandler);
  return app;
}

const PROMO_ID = '88888888-8888-8888-8888-888888888888';
const WRITE_LIMIT = 200;

describe('operator rate limiting', () => {
  // These routes are unauthenticated by design (public demo), so the limiter is
  // the only thing bounding abuse of the write endpoints. Worth a real test
  // rather than trusting that the middleware got attached.
  test('a write endpoint starts refusing past the per-minute limit', async () => {
    vi.mocked(repo.endPromotion).mockResolvedValue({
      id: PROMO_ID,
      storeId: '11111111-1111-1111-1111-111111111111',
      productName: null,
      percent: 20,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-02T00:00:00.000Z'),
      actor: null,
      createdAt: new Date('2026-07-31T00:00:00.000Z'),
    } as never);

    const app = makeApp();
    const statuses: number[] = [];
    for (let i = 0; i < WRITE_LIMIT + 1; i++) {
      const res = await request(app).patch(
        `/api/operator/promotions/${PROMO_ID}/end`,
      );
      statuses.push(res.status);
    }

    expect(statuses.slice(0, WRITE_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses[WRITE_LIMIT]).toBe(429);
  });
});
