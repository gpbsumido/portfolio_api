import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Auth as a HARD REJECT: if /track ever ran through checkJwt it would 401 here,
// so a 202 proves the ingest endpoint is public (anonymous telemetry).
vi.mock('../../config/auth.js', () => ({
  checkJwt: (_req: any, res: any, _next: any) => res.status(401).json({ error: 'Unauthorized' }),
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../shared/auth/adminEmail.js', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repository.js')>();
  return { ...actual, insertAnalyticsEvents: vi.fn() };
});

import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './repository.js';
import zeroproofRouter from './routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/zeroproof', zeroproofRouter);
  app.use(errorHandler);
  return app;
}

const event = (overrides: Record<string, unknown> = {}) => ({
  eventUuid: '11111111-1111-4111-8111-111111111111',
  name: 'page_view',
  page: '/zeroproof',
  seq: 1,
  sessionId: 'sess-1',
  anonId: 'anon-1',
  clientTs: '2026-09-29T00:00:00.000Z',
  props: { source: 'nav' },
  appVersion: '7.9.3',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.insertAnalyticsEvents).mockResolvedValue({ accepted: 1, deduped: 0 } as never);
});

describe('POST /api/zeroproof/track', () => {
  test('stores a batch without any auth and reports the counts', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/track')
      .send({ events: [event()] });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 1, deduped: 0 });
    expect(repo.insertAnalyticsEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repo.insertAnalyticsEvents).mock.calls[0]?.[0]).toHaveLength(1);
  });

  test('reports events dropped as duplicates', async () => {
    vi.mocked(repo.insertAnalyticsEvents).mockResolvedValue({ accepted: 1, deduped: 1 } as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/track')
      .send({ events: [event(), event()] });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 1, deduped: 1 });
  });

  test('rejects a body with no events', async () => {
    const res = await request(makeApp()).post('/api/zeroproof/track').send({ events: [] });
    expect(res.status).toBe(400);
    expect(repo.insertAnalyticsEvents).not.toHaveBeenCalled();
  });

  test('rejects an oversized batch', async () => {
    const events = Array.from({ length: 200 }, (_, i) =>
      event({ eventUuid: `11111111-1111-4111-8111-0000000000${String(i).padStart(2, '0')}`, seq: i }),
    );
    const res = await request(makeApp()).post('/api/zeroproof/track').send({ events });
    expect(res.status).toBe(400);
    expect(repo.insertAnalyticsEvents).not.toHaveBeenCalled();
  });

  test('rejects an event missing required fields', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/track')
      .send({ events: [{ name: 'page_view' }] });
    expect(res.status).toBe(400);
    expect(repo.insertAnalyticsEvents).not.toHaveBeenCalled();
  });
});
