import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  searchUsers: vi.fn(),
  searchPosts: vi.fn(),
}));

import searchRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const user = { username: 'paul', display_name: 'Paul', avatar_url: null };
const post = {
  id: 'p1',
  type: 'text',
  content: 'paul was here',
  caption: null,
  created_at: '2026-01-01T00:00:00.000Z',
  author: user,
};

function makeApp() {
  const app = express();
  app.use('/api/search', searchRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('search route', () => {
  test('returns matching users and posts', async () => {
    vi.mocked(repo.searchUsers).mockResolvedValue([user]);
    vi.mocked(repo.searchPosts).mockResolvedValue([post]);

    const res = await request(makeApp()).get('/api/search?q=paul');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: [user], posts: [post] });
    expect(repo.searchUsers).toHaveBeenCalledWith('paul');
  });

  test('returns empty results for a blank query without hitting the repo', async () => {
    const res = await request(makeApp()).get('/api/search?q=%20%20');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: [], posts: [] });
    expect(repo.searchUsers).not.toHaveBeenCalled();
  });

  test('returns empty results when q is missing', async () => {
    const res = await request(makeApp()).get('/api/search');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: [], posts: [] });
  });
});
