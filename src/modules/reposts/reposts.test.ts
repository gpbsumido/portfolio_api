import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|me' } };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|me' } };
    next();
  },
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  repost: vi.fn().mockResolvedValue(undefined),
  unrepost: vi.fn().mockResolvedValue(undefined),
  getRepostCounts: vi.fn(),
  getRepostedByUser: vi.fn(),
}));

import repostsRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/reposts', repostsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('reposts routes', () => {
  test('POST reposts a post', async () => {
    const res = await request(makeApp()).post(`/api/reposts/${ID_A}`);
    expect(res.status).toBe(204);
    expect(repo.repost).toHaveBeenCalledWith('auth0|me', ID_A);
  });

  test('DELETE undoes a repost', async () => {
    const res = await request(makeApp()).delete(`/api/reposts/${ID_A}`);
    expect(res.status).toBe(204);
    expect(repo.unrepost).toHaveBeenCalledWith('auth0|me', ID_A);
  });

  test('POST with a non-uuid id is rejected', async () => {
    const res = await request(makeApp()).post('/api/reposts/nope');
    expect(res.status).toBe(400);
    expect(repo.repost).not.toHaveBeenCalled();
  });

  test('GET returns counts and reposted-by-me per post', async () => {
    vi.mocked(repo.getRepostCounts).mockResolvedValue(new Map([[ID_A, 4]]));
    vi.mocked(repo.getRepostedByUser).mockResolvedValue(new Set([ID_A]));
    const res = await request(makeApp()).get(`/api/reposts?ids=${ID_A},${ID_B}`);
    expect(res.status).toBe(200);
    expect(res.body.reposts).toEqual([
      { post_id: ID_A, count: 4, reposted: true },
      { post_id: ID_B, count: 0, reposted: false },
    ]);
  });
});
