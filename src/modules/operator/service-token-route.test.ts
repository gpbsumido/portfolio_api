import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  listStores: vi.fn(),
  getStore: vi.fn(),
  listInventory: vi.fn(),
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

const PROMO_ID = '88888888-8888-8888-8888-888888888888';
const STORE_ID = '11111111-1111-1111-1111-111111111111';

// Its own file: the routes module has to be re-imported with the secret set,
// and the rate limiters are module-level, so sharing a file with the limiter
// test would have them fighting over the same budget.
beforeEach(() => vi.resetModules());

describe('the service-token guard on a real route', () => {
  /**
   * The unit tests cover the middleware; this covers the wiring, which is the
   * part that silently rots when someone adds a route and forgets the guard.
   * The shared test setup blanks the secret so a developer's own .env cannot
   * decide whether the suite passes, so this sets it deliberately.
   */
  test('a write without the header is rejected, and with it goes through', async () => {
    process.env.OPERATOR_SERVICE_TOKEN = 'test-secret';

    // Imported dynamically so it picks up the secret set just above; the cast
    // is because a dynamic import widens the Router type past express's overloads.
    const routes = (await import('./routes.js'))
      .default as unknown as express.RequestHandler;
    const repo = await import('./repository.js');
    vi.mocked(repo.endPromotion).mockResolvedValue({
      id: PROMO_ID,
      storeId: STORE_ID,
      productName: null,
      percent: 20,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-02T00:00:00.000Z'),
      actor: null,
      createdAt: new Date('2026-07-31T00:00:00.000Z'),
    } as never);
    vi.mocked(repo.listPromotions).mockResolvedValue([] as never);

    const app = express();
    app.use(express.json());
    app.use('/api/operator', routes);
    app.use(errorHandler);

    const without = await request(app).patch(
      `/api/operator/promotions/${PROMO_ID}/end`,
    );
    expect(without.status).toBe(401);

    const withHeader = await request(app)
      .patch(`/api/operator/promotions/${PROMO_ID}/end`)
      .set('x-operator-token', 'test-secret');
    expect(withHeader.status).toBe(200);

    // Reads stay open. They are the demo.
    const read = await request(app).get(
      `/api/operator/stores/${STORE_ID}/promotions`,
    );
    expect(read.status).toBe(200);

    process.env.OPERATOR_SERVICE_TOKEN = '';
  });
});
