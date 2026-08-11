import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|viewer' } };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  getPostById: vi.fn(),
  getPostMediaByPostId: vi.fn().mockResolvedValue([]),
  getProfileVisibilityBySub: vi.fn(),
  isAcceptedFollower: vi.fn().mockResolvedValue(false),
  getProfileVisibility: vi.fn(),
  getPostsByUsername: vi.fn(),
  getDiscoverPosts: vi.fn(),
}));
vi.mock('./service.js', () => ({
  deletePostWithMedia: vi.fn(),
  createPhotoPost: vi.fn(),
}));

import postsRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const POST_ID = '11111111-1111-1111-1111-111111111111';
const AUTHOR = 'auth0|author';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/posts', postsRouter);
  app.use(errorHandler);
  return app;
}

const privatePost = {
  id: POST_ID,
  type: 'text',
  content: 'private thoughts',
  caption: null,
  created_at: new Date(),
  updated_at: new Date(),
  sub: AUTHOR,
  username: 'author',
  display_name: 'Author',
  avatar_url: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.getPostById).mockResolvedValue(privatePost as never);
});

describe('single post visibility', () => {
  test('a private account\'s post is not readable by an anonymous caller', async () => {
    vi.mocked(repo.getProfileVisibilityBySub).mockResolvedValue({
      user_sub: AUTHOR,
      is_public: false,
    } as never);

    const res = await request(makeApp()).get(`/api/posts/${POST_ID}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('private thoughts');
  });

  test('a public account\'s post stays readable', async () => {
    vi.mocked(repo.getProfileVisibilityBySub).mockResolvedValue({
      user_sub: AUTHOR,
      is_public: true,
    } as never);

    const res = await request(makeApp()).get(`/api/posts/${POST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('private thoughts');
  });

  test('the author\'s own sub is not leaked in the private case', async () => {
    vi.mocked(repo.getProfileVisibilityBySub).mockResolvedValue({
      user_sub: AUTHOR,
      is_public: false,
    } as never);

    const res = await request(makeApp()).get(`/api/posts/${POST_ID}`);

    expect(JSON.stringify(res.body)).not.toContain(AUTHOR);
  });
});
