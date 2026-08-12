import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { EMAIL_CLAIM_NS } from '../../shared/auth/adminEmail.js';

const OWNER = 'owner@example.com';
let claims: Record<string, unknown> = {};

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  listTodos: vi.fn(),
  setDone: vi.fn(),
}));

import todosRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const ID = '11111111-1111-1111-1111-111111111111';
const originalAllowlist = process.env.ADMIN_ALLOWED_EMAILS;

const adminClaims = {
  sub: 'auth0|owner',
  [`${EMAIL_CLAIM_NS}email`]: OWNER,
  [`${EMAIL_CLAIM_NS}email_verified`]: true,
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/todos', todosRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_ALLOWED_EMAILS = OWNER;
  claims = { ...adminClaims };
  vi.mocked(repo.listTodos).mockResolvedValue([]);
});

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.ADMIN_ALLOWED_EMAILS;
  else process.env.ADMIN_ALLOWED_EMAILS = originalAllowlist;
});

describe('todos access', () => {
  test('a non-admin cannot read the list', async () => {
    claims = { ...adminClaims, [`${EMAIL_CLAIM_NS}email`]: 'someone@else.com' };

    const res = await request(makeApp()).get('/api/todos');

    expect(res.status).toBe(403);
    expect(repo.listTodos).not.toHaveBeenCalled();
  });

  test('a non-admin cannot tick an item', async () => {
    claims = { ...adminClaims, [`${EMAIL_CLAIM_NS}email`]: 'someone@else.com' };

    const res = await request(makeApp()).patch(`/api/todos/${ID}`).send({ done: true });

    expect(res.status).toBe(403);
    expect(repo.setDone).not.toHaveBeenCalled();
  });

  test('an unset allowlist locks everyone out', async () => {
    delete process.env.ADMIN_ALLOWED_EMAILS;

    expect((await request(makeApp()).get('/api/todos')).status).toBe(403);
  });

  test('the admin can read the list', async () => {
    const res = await request(makeApp()).get('/api/todos');

    expect(res.status).toBe(200);
    expect(res.body.todos).toEqual([]);
  });
});

describe('todos updates', () => {
  test('ticking an item marks it done', async () => {
    vi.mocked(repo.setDone).mockResolvedValue({ id: ID, done: true } as never);

    const res = await request(makeApp()).patch(`/api/todos/${ID}`).send({ done: true });

    expect(res.status).toBe(200);
    expect(repo.setDone).toHaveBeenCalledWith(ID, true);
  });

  test('a missing item answers 404 rather than pretending to succeed', async () => {
    vi.mocked(repo.setDone).mockResolvedValue(null);

    const res = await request(makeApp()).patch(`/api/todos/${ID}`).send({ done: true });

    expect(res.status).toBe(404);
  });

  test('fields other than done are rejected, not silently applied', async () => {
    const res = await request(makeApp())
      .patch(`/api/todos/${ID}`)
      .send({ done: true, title: 'rewritten', phase: 9 });

    expect(res.status).toBe(400);
    expect(repo.setDone).not.toHaveBeenCalled();
  });

  test('a non-uuid id is rejected before it reaches the database', async () => {
    const res = await request(makeApp()).patch('/api/todos/not-a-uuid').send({ done: true });

    expect(res.status).toBe(400);
    expect(repo.setDone).not.toHaveBeenCalled();
  });
});
