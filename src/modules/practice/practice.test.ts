import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|me' } };
    next();
  },
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  listReviews: vi.fn(),
  saveReview: vi.fn(),
  importReviews: vi.fn(),
}));

import practiceRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/practice', practiceRouter);
  app.use(errorHandler);
  return app;
}

const review = (overrides: Record<string, unknown> = {}) => ({
  kind: 'problem',
  itemId: 'two-sum',
  step: 0,
  dueAt: '2026-11-05T12:00:00.000Z',
  lastReviewedAt: '2026-11-04T12:00:00.000Z',
  reviews: 1,
  ...overrides,
});

const stateOf = ({ kind: _kind, itemId: _itemId, ...state }: ReturnType<typeof review>) => state;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('practice review routes', () => {
  test('GET /reviews returns only the caller’s reviews', async () => {
    vi.mocked(repo.listReviews).mockResolvedValue([review()] as never);

    const res = await request(makeApp()).get('/api/practice/reviews');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviews: [review()] });
    expect(repo.listReviews).toHaveBeenCalledWith('auth0|me');
  });

  test('PUT /reviews/:kind/:itemId stores one review and returns what was kept', async () => {
    vi.mocked(repo.saveReview).mockResolvedValue(review() as never);

    const res = await request(makeApp()).put('/api/practice/reviews/problem/two-sum').send(stateOf(review()));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ review: review() });
    expect(repo.saveReview).toHaveBeenCalledWith('auth0|me', review());
  });

  test('PUT accepts drill cards as their own kind', async () => {
    vi.mocked(repo.saveReview).mockResolvedValue(review({ kind: 'drill' }) as never);

    const res = await request(makeApp()).put('/api/practice/reviews/drill/two-sum').send(stateOf(review()));

    expect(res.status).toBe(200);
    expect(repo.saveReview).toHaveBeenCalledWith('auth0|me', review({ kind: 'drill' }));
  });

  test('PUT rejects a kind it does not know', async () => {
    const res = await request(makeApp()).put('/api/practice/reviews/flashcard/two-sum').send(stateOf(review()));

    expect(res.status).toBe(400);
    expect(repo.saveReview).not.toHaveBeenCalled();
  });

  test('PUT rejects an item id that is not a slug', async () => {
    const res = await request(makeApp()).put('/api/practice/reviews/problem/Two%20Sum').send(stateOf(review()));

    expect(res.status).toBe(400);
    expect(repo.saveReview).not.toHaveBeenCalled();
  });

  test('PUT rejects fields it does not store, so a typo is a 400 rather than a no-op', async () => {
    const res = await request(makeApp())
      .put('/api/practice/reviews/problem/two-sum')
      .send({ ...stateOf(review()), rating: 'good' });

    expect(res.status).toBe(400);
    expect(repo.saveReview).not.toHaveBeenCalled();
  });

  test('PUT rejects a negative step', async () => {
    const res = await request(makeApp())
      .put('/api/practice/reviews/problem/two-sum')
      .send({ ...stateOf(review()), step: -1 });

    expect(res.status).toBe(400);
  });

  test('POST /reviews/import merges what a browser kept and returns the full set', async () => {
    const incoming = [review(), review({ kind: 'drill', itemId: 'valid-anagram' })];
    vi.mocked(repo.importReviews).mockResolvedValue(incoming as never);

    const res = await request(makeApp()).post('/api/practice/reviews/import').send({ reviews: incoming });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviews: incoming });
    expect(repo.importReviews).toHaveBeenCalledWith('auth0|me', incoming);
  });

  test('POST /reviews/import rejects the same item twice in one batch', async () => {
    const res = await request(makeApp())
      .post('/api/practice/reviews/import')
      .send({ reviews: [review(), review({ step: 2 })] });

    expect(res.status).toBe(400);
    expect(repo.importReviews).not.toHaveBeenCalled();
  });

  test('POST /reviews/import rejects an empty batch', async () => {
    const res = await request(makeApp()).post('/api/practice/reviews/import').send({ reviews: [] });

    expect(res.status).toBe(400);
  });
});
