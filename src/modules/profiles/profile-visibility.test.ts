import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|viewer' } };
    next();
  },
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));

import { ProfilesController } from './controller.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const OWNER = 'auth0|owner';

const privateProfile = {
  user_sub: OWNER,
  username: 'someone',
  display_name: 'Someone',
  bio: 'a private bio',
  avatar_url: 'https://cdn.example/a.png',
  is_public: false,
  created_at: new Date(),
  post_count: 12,
  follower_count: 3,
  following_count: 4,
  follow_status: null,
};

function makeApp() {
  const app = express();
  const ctrl = new ProfilesController();
  app.get('/api/profiles/:username', (req, res, next) =>
    ctrl.getByUsername(req as never, res as never, next),
  );
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('public profile visibility', () => {
  test('a private profile does not expose its details to an anonymous caller', async () => {
    vi.spyOn(repo, 'getPublicProfile').mockResolvedValue(privateProfile as never);

    const res = await request(makeApp()).get('/api/profiles/someone');

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('a private bio');
    expect(body).not.toContain(OWNER);
  });

  test('a private profile still reveals enough for a follow request to make sense', async () => {
    vi.spyOn(repo, 'getPublicProfile').mockResolvedValue(privateProfile as never);

    const res = await request(makeApp()).get('/api/profiles/someone');

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('someone');
    expect(res.body.is_public).toBe(false);
  });

  test('a public profile is unchanged', async () => {
    vi.spyOn(repo, 'getPublicProfile').mockResolvedValue({
      ...privateProfile,
      is_public: true,
      bio: 'a public bio',
    } as never);

    const res = await request(makeApp()).get('/api/profiles/someone');

    expect(res.body.bio).toBe('a public bio');
    expect(res.body.post_count).toBe(12);
  });
});
