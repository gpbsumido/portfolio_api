import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Same convention as operator.test.ts: mock the repository so routing,
// validation and the controller are exercised without a database.
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
const SESSION_ID = '55555555-5555-5555-5555-555555555555';
const ITEM_ID = '33333333-3333-3333-3333-333333333333';

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

const session = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SESSION_ID,
  storeId: STORE_ID,
  startedAt: new Date('2026-08-02T15:00:00.000Z'),
  completedAt: null,
  actor: 'operator@smartstore.example',
  notes: null,
  ...over,
});

const dbLine = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '66666666-6666-6666-6666-666666666666',
  sessionId: SESSION_ID,
  itemId: ITEM_ID,
  expectedQty: 8,
  countedQty: null,
  added: 0,
  removed: 0,
  removalReason: null,
  resultingStock: null,
  updatedAt: new Date('2026-08-02T15:00:00.000Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('opening a session', () => {
  test('POST /stores/:id/restock-sessions opens one for a real store', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(store() as never);
    vi.mocked(repo.openSession).mockResolvedValue(session() as never);

    const res = await request(makeApp()).post(
      `/api/operator/stores/${STORE_ID}/restock-sessions`,
    );

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      id: SESSION_ID,
      storeId: STORE_ID,
      completedAt: null,
    });
  });

  test('404s for a store that does not exist', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(null);

    const res = await request(makeApp()).post(
      `/api/operator/stores/${STORE_ID}/restock-sessions`,
    );
    expect(res.status).toBe(404);
  });

  test('GET /stores/:id/restock-sessions returns history', async () => {
    vi.mocked(repo.listSessions).mockResolvedValue([
      session({ completedAt: new Date('2026-08-02T15:30:00.000Z') }),
    ] as never);

    const res = await request(makeApp()).get(
      `/api/operator/stores/${STORE_ID}/restock-sessions`,
    );
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
  });
});

describe('recording a slot', () => {
  test('PUT a line upserts and echoes the derived resulting stock', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);
    vi.mocked(repo.upsertLine).mockResolvedValue(
      dbLine({ countedQty: 5, added: 4, removed: 2, removalReason: 'expired' }) as never,
    );

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: 5, added: 4, removed: 2, removalReason: 'expired' });

    expect(res.status).toBe(200);
    expect(res.body.line).toMatchObject({
      itemId: ITEM_ID,
      countedQty: 5,
      added: 4,
      removed: 2,
      removalReason: 'expired',
      countStatus: 'correction',
    });
    expect(vi.mocked(repo.upsertLine)).toHaveBeenCalledOnce();
  });

  test('accepts a skipped count as an explicit null', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);
    vi.mocked(repo.upsertLine).mockResolvedValue(dbLine({ added: 3 }) as never);

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: null, added: 3, removed: 0 });

    expect(res.status).toBe(200);
    expect(res.body.line.countStatus).toBe('not-counted');
  });

  test('rejects a removal with no reason', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: 8, added: 0, removed: 3 });

    expect(res.status).toBe(400);
    expect(vi.mocked(repo.upsertLine)).not.toHaveBeenCalled();
  });

  test('rejects a reason outside the enum', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: 8, added: 0, removed: 3, removalReason: 'shrinkage' });

    expect(res.status).toBe(400);
  });

  test('rejects negative quantities', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: 8, added: -1, removed: 0 });

    expect(res.status).toBe(400);
  });

  test('409s when the session is already complete', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(
      session({ completedAt: new Date('2026-08-02T15:30:00.000Z') }) as never,
    );

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: 8, added: 1, removed: 0 });

    expect(res.status).toBe(409);
    expect(vi.mocked(repo.upsertLine)).not.toHaveBeenCalled();
  });

  test('404s for an unknown session', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(null);

    const res = await request(makeApp())
      .put(`/api/operator/restock-sessions/${SESSION_ID}/lines/${ITEM_ID}`)
      .send({ expectedQty: 8, countedQty: 8, added: 1, removed: 0 });

    expect(res.status).toBe(404);
  });
});

describe('reading a session', () => {
  test('GET returns the session with its lines and their count status', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);
    vi.mocked(repo.listSessionLines).mockResolvedValue([
      dbLine({ countedQty: 8 }),
      dbLine({ id: 'other', itemId: 'item-2', countedQty: null }),
    ] as never);

    const res = await request(makeApp()).get(
      `/api/operator/restock-sessions/${SESSION_ID}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0].countStatus).toBe('matches-expected');
    expect(res.body.lines[1].countStatus).toBe('not-counted');
  });
});

describe('completing a session', () => {
  test('applies the lines and returns the updated items plus an activity event', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session() as never);
    vi.mocked(repo.completeSession).mockResolvedValue({
      session: session({ completedAt: new Date('2026-08-02T15:30:00.000Z'), notes: 'front row rotated' }),
      lines: [dbLine({ countedQty: 5, added: 4, resultingStock: 9 })],
      items: [
        {
          id: ITEM_ID,
          storeId: STORE_ID,
          productName: 'Cola',
          category: 'beverages',
          currentStock: 9,
          capacity: 12,
          price: 2.5,
          lastRestocked: new Date('2026-08-02T15:30:00.000Z'),
        },
      ],
      activity: {
        id: '77777777-7777-7777-7777-777777777777',
        storeId: STORE_ID,
        type: 'restock',
        description: 'Restocked 1 item, +4, 1 correction',
        occurredAt: new Date('2026-08-02T15:30:00.000Z'),
        actor: 'operator@smartstore.example',
      },
    } as never);

    const res = await request(makeApp())
      .post(`/api/operator/restock-sessions/${SESSION_ID}/complete`)
      .send({ notes: 'front row rotated' });

    expect(res.status).toBe(200);
    expect(res.body.items[0].currentStock).toBe(9);
    expect(res.body.lines[0].resultingStock).toBe(9);
    expect(res.body.activity.type).toBe('restock');
    expect(res.body.session.completedAt).not.toBeNull();
  });

  test('409s on a second completion rather than applying twice', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(
      session({ completedAt: new Date('2026-08-02T15:30:00.000Z') }) as never,
    );

    const res = await request(makeApp())
      .post(`/api/operator/restock-sessions/${SESSION_ID}/complete`)
      .send({});

    expect(res.status).toBe(409);
    expect(vi.mocked(repo.completeSession)).not.toHaveBeenCalled();
  });

  test('404s for an unknown session', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(null);

    const res = await request(makeApp())
      .post(`/api/operator/restock-sessions/${SESSION_ID}/complete`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('the legacy one-tap restock', () => {
  test('still works, but now writes a session and lines', async () => {
    vi.mocked(repo.getStore).mockResolvedValue(store() as never);
    vi.mocked(repo.listInventory).mockResolvedValue([
      {
        id: ITEM_ID,
        storeId: STORE_ID,
        productName: 'Cola',
        category: 'beverages',
        currentStock: 3,
        capacity: 12,
        price: 2.5,
        lastRestocked: new Date('2026-07-20T00:00:00.000Z'),
      },
    ] as never);
    vi.mocked(repo.openSession).mockResolvedValue(session() as never);
    vi.mocked(repo.upsertLine).mockResolvedValue(
      dbLine({ added: 9, resultingStock: 12 }) as never,
    );
    vi.mocked(repo.completeSession).mockResolvedValue({
      session: session({ completedAt: new Date('2026-08-02T15:30:00.000Z') }),
      lines: [dbLine({ added: 9, resultingStock: 12 })],
      items: [
        {
          id: ITEM_ID,
          storeId: STORE_ID,
          productName: 'Cola',
          category: 'beverages',
          currentStock: 12,
          capacity: 12,
          price: 2.5,
          lastRestocked: new Date('2026-08-02T15:30:00.000Z'),
        },
      ],
      activity: {
        id: '77777777-7777-7777-7777-777777777777',
        storeId: STORE_ID,
        type: 'restock',
        description: 'Restocked 1 item, +9',
        occurredAt: new Date('2026-08-02T15:30:00.000Z'),
        actor: 'operator@smartstore.example',
      },
    } as never);

    const res = await request(makeApp())
      .post(`/api/operator/stores/${STORE_ID}/restock`)
      .send({ itemIds: [ITEM_ID] });

    // Response shape is unchanged for the existing client...
    expect(res.status).toBe(200);
    expect(res.body.items[0].currentStock).toBe(12);
    expect(res.body.activity.type).toBe('restock');
    // ...but it can no longer bypass the audit trail.
    expect(vi.mocked(repo.openSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(repo.completeSession)).toHaveBeenCalledOnce();
  });
});
