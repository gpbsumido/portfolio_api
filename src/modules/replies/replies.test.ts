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
  insertReply: vi.fn(),
  getReplyById: vi.fn(),
  listReplies: vi.fn(),
  getReplyCounts: vi.fn(),
}));

import repliesRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const reply = {
  id: 'rid',
  post_id: ID_A,
  content: 'nice one',
  created_at: '2026-01-01T00:00:00.000Z',
  author: { username: 'paul', display_name: 'Paul', avatar_url: null },
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/replies', repliesRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('replies routes', () => {
  test('POST creates a reply and returns it', async () => {
    vi.mocked(repo.insertReply).mockResolvedValue('rid');
    vi.mocked(repo.getReplyById).mockResolvedValue(reply);

    const res = await request(makeApp())
      .post(`/api/replies/${ID_A}`)
      .send({ content: 'nice one' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(reply);
    expect(repo.insertReply).toHaveBeenCalledWith('auth0|me', ID_A, 'nice one');
  });

  test('POST rejects an empty reply', async () => {
    const res = await request(makeApp())
      .post(`/api/replies/${ID_A}`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
    expect(repo.insertReply).not.toHaveBeenCalled();
  });

  test('POST rejects a non-uuid post id', async () => {
    const res = await request(makeApp())
      .post('/api/replies/not-a-uuid')
      .send({ content: 'hi' });
    expect(res.status).toBe(400);
  });

  test('GET /:postId returns the thread', async () => {
    vi.mocked(repo.listReplies).mockResolvedValue([reply]);
    const res = await request(makeApp()).get(`/api/replies/${ID_A}`);
    expect(res.status).toBe(200);
    expect(res.body.replies).toEqual([reply]);
  });

  test('GET batch returns a count per requested post', async () => {
    vi.mocked(repo.getReplyCounts).mockResolvedValue(new Map([[ID_A, 2]]));
    const res = await request(makeApp()).get(`/api/replies?ids=${ID_A},${ID_B}`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual([
      { post_id: ID_A, count: 2 },
      { post_id: ID_B, count: 0 },
    ]);
  });
});
