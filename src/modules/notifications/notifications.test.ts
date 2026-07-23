import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|me' } };
    next();
  },
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  listEvents: vi.fn(),
  getSeenAt: vi.fn(),
  setSeenAt: vi.fn().mockResolvedValue(undefined),
}));

import notificationsRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const actor = { username: 'mara', display_name: 'Mara', avatar_url: null };
const evt = (type: string, created_at: string) => ({
  type,
  actor,
  post_id: null,
  created_at,
});
const events = [
  evt('like', '2026-01-03T00:00:00.000Z'),
  evt('reply', '2026-01-01T00:00:00.000Z'),
];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('notifications routes', () => {
  test('counts only events newer than last-seen as unread', async () => {
    vi.mocked(repo.listEvents).mockResolvedValue(events as any);
    vi.mocked(repo.getSeenAt).mockResolvedValue(new Date('2026-01-02T00:00:00.000Z'));

    const res = await request(makeApp()).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.unread_count).toBe(1);
  });

  test('everything is unread when never viewed', async () => {
    vi.mocked(repo.listEvents).mockResolvedValue(events as any);
    vi.mocked(repo.getSeenAt).mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/notifications');
    expect(res.body.unread_count).toBe(2);
  });

  test('PUT /seen marks notifications read', async () => {
    const res = await request(makeApp()).put('/api/notifications/seen');
    expect(res.status).toBe(204);
    expect(repo.setSeenAt).toHaveBeenCalledWith('auth0|me', expect.any(Date));
  });
});
