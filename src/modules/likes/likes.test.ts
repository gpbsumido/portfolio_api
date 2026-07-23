import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Auth: like/unlike require it, batch is optional. Stub a user for all.
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
  likePost: vi.fn().mockResolvedValue(undefined),
  unlikePost: vi.fn().mockResolvedValue(undefined),
  getLikeCounts: vi.fn(),
  getLikedByUser: vi.fn(),
}));

import likesRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/likes', likesRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('likes routes', () => {
  test('POST /api/likes/:id likes the post', async () => {
    const res = await request(makeApp()).post(`/api/likes/${ID_A}`);
    expect(res.status).toBe(204);
    expect(repo.likePost).toHaveBeenCalledWith('auth0|me', ID_A);
  });

  test('DELETE /api/likes/:id unlikes the post', async () => {
    const res = await request(makeApp()).delete(`/api/likes/${ID_A}`);
    expect(res.status).toBe(204);
    expect(repo.unlikePost).toHaveBeenCalledWith('auth0|me', ID_A);
  });

  test('POST with a non-uuid id is rejected', async () => {
    const res = await request(makeApp()).post('/api/likes/not-a-uuid');
    expect(res.status).toBe(400);
    expect(repo.likePost).not.toHaveBeenCalled();
  });

  test('GET /api/likes returns counts and liked-by-me per post', async () => {
    vi.mocked(repo.getLikeCounts).mockResolvedValue(new Map([[ID_A, 3]]));
    vi.mocked(repo.getLikedByUser).mockResolvedValue(new Set([ID_A]));

    const res = await request(makeApp()).get(
      `/api/likes?ids=${ID_A},${ID_B}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.likes).toEqual([
      { post_id: ID_A, count: 3, liked: true },
      { post_id: ID_B, count: 0, liked: false },
    ]);
  });

  test('GET /api/likes ignores non-uuid ids in the batch', async () => {
    vi.mocked(repo.getLikeCounts).mockResolvedValue(new Map());
    vi.mocked(repo.getLikedByUser).mockResolvedValue(new Set());

    const res = await request(makeApp()).get(`/api/likes?ids=garbage,${ID_A}`);

    expect(res.status).toBe(200);
    expect(res.body.likes).toEqual([{ post_id: ID_A, count: 0, liked: false }]);
  });
});
