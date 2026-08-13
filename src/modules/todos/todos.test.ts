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
  createTodo: vi.fn(),
  softDeleteTodo: vi.fn(),
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

describe('adding an item', () => {
  const newItem = { title: 'Rotate the database password', project: 'portfolio_api' };

  test('a non-admin cannot add one', async () => {
    claims = { ...adminClaims, [`${EMAIL_CLAIM_NS}email`]: 'someone@else.com' };

    const res = await request(makeApp()).post('/api/todos').send(newItem);

    expect(res.status).toBe(403);
    expect(repo.createTodo).not.toHaveBeenCalled();
  });

  test('a title and a project are both required', async () => {
    const noProject = await request(makeApp()).post('/api/todos').send({ title: 'Just a title' });
    const noTitle = await request(makeApp()).post('/api/todos').send({ project: 'all' });

    expect(noProject.status).toBe(400);
    expect(noTitle.status).toBe(400);
    expect(repo.createTodo).not.toHaveBeenCalled();
  });

  test('a blank title is not a title', async () => {
    const res = await request(makeApp()).post('/api/todos').send({ title: '   ', project: 'all' });

    expect(res.status).toBe(400);
    expect(repo.createTodo).not.toHaveBeenCalled();
  });

  test('fields the caller has no business setting are rejected', async () => {
    const res = await request(makeApp())
      .post('/api/todos')
      .send({ ...newItem, position: 0, done: true, blocking: true });

    // Strict, not stripped. Silently dropping position would let a caller
    // believe it chose the slot.
    expect(res.status).toBe(400);
    expect(repo.createTodo).not.toHaveBeenCalled();
  });

  test('a new item defaults to the backlog phase', async () => {
    vi.mocked(repo.createTodo).mockResolvedValue({ id: ID } as never);

    await request(makeApp()).post('/api/todos').send(newItem);

    expect(repo.createTodo).toHaveBeenCalledWith(expect.objectContaining({ phase: 4 }));
  });

  test('a created item comes back with its server-assigned id', async () => {
    vi.mocked(repo.createTodo).mockResolvedValue({ id: ID, phase: 4, position: 7 } as never);

    const res = await request(makeApp()).post('/api/todos').send(newItem);

    expect(res.status).toBe(201);
    expect(res.body.todo.id).toBe(ID);
  });
});

describe('removing an item', () => {
  test('a non-admin cannot remove one', async () => {
    claims = { ...adminClaims, [`${EMAIL_CLAIM_NS}email`]: 'someone@else.com' };

    const res = await request(makeApp()).delete(`/api/todos/${ID}`);

    expect(res.status).toBe(403);
    expect(repo.softDeleteTodo).not.toHaveBeenCalled();
  });

  test('removing an item soft deletes it', async () => {
    vi.mocked(repo.softDeleteTodo).mockResolvedValue({ id: ID } as never);

    const res = await request(makeApp()).delete(`/api/todos/${ID}`);

    expect(res.status).toBe(200);
    expect(repo.softDeleteTodo).toHaveBeenCalledWith(ID);
  });

  test('removing something already removed answers 404, not a silent success', async () => {
    vi.mocked(repo.softDeleteTodo).mockResolvedValue(null);

    const res = await request(makeApp()).delete(`/api/todos/${ID}`);

    expect(res.status).toBe(404);
  });

  test('a non-uuid id is rejected before it reaches the database', async () => {
    const res = await request(makeApp()).delete('/api/todos/not-a-uuid');

    expect(res.status).toBe(400);
    expect(repo.softDeleteTodo).not.toHaveBeenCalled();
  });
});
