import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the repository so we exercise routing + controller logic without a DB.
vi.mock('./repository.js', () => ({
  findBySlug: vi.fn(),
  insertReferral: vi.fn(),
  recordClick: vi.fn(),
  countClicks: vi.fn(),
  recentClicks: vi.fn(),
}));

// Rate limiter is a pass-through in tests to keep them deterministic.
vi.mock('../../middleware/rateLimiter.js', () => ({
  createIpLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './repository.js';
import referralsRoutes from './routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/referrals', referralsRoutes);
  app.use(errorHandler);
  return app;
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'ref-1',
  slug: 'abc123',
  targetPath: '/work-portfolio',
  label: null,
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('referrals routes', () => {
  test('POST / creates a link with a generated slug and zero clicks', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(null);
    vi.mocked(repo.insertReferral).mockResolvedValue(row() as never);

    const res = await request(makeApp())
      .post('/api/referrals')
      .send({ targetPath: '/work-portfolio' });

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('abc123');
    expect(res.body.clicks).toBe(0);
    expect(res.body.url).toContain('/r/abc123');
    expect(repo.insertReferral).toHaveBeenCalledOnce();
  });

  test('POST / rejects a custom slug that already exists with 409', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(row({ slug: 'taken' }) as never);

    const res = await request(makeApp())
      .post('/api/referrals')
      .send({ slug: 'taken', targetPath: '/x' });

    expect(res.status).toBe(409);
    expect(repo.insertReferral).not.toHaveBeenCalled();
  });

  test('POST / rejects an invalid slug with 400', async () => {
    const res = await request(makeApp())
      .post('/api/referrals')
      .send({ slug: 'NO', targetPath: '/x' });

    expect(res.status).toBe(400);
  });

  test('GET /:slug returns 404 for an unknown slug', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/referrals/missing');

    expect(res.status).toBe(404);
  });

  test('GET /:slug returns the link with its click count', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(row() as never);
    vi.mocked(repo.countClicks).mockResolvedValue(7);

    const res = await request(makeApp()).get('/api/referrals/abc123');

    expect(res.status).toBe(200);
    expect(res.body.clicks).toBe(7);
    expect(res.body.targetPath).toBe('/work-portfolio');
  });

  test('POST /:slug/clicks records a click and returns the new count', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(row() as never);
    vi.mocked(repo.countClicks).mockResolvedValue(3);

    const res = await request(makeApp()).post('/api/referrals/abc123/clicks');

    expect(res.status).toBe(200);
    expect(repo.recordClick).toHaveBeenCalledOnce();
    expect(res.body.clicks).toBe(3);
  });

  test('GET /:slug/stats returns the count and recent sample', async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(row() as never);
    vi.mocked(repo.countClicks).mockResolvedValue(2);
    vi.mocked(repo.recentClicks).mockResolvedValue([
      { createdAt: new Date('2026-07-20T01:00:00.000Z') },
    ] as never);

    const res = await request(makeApp()).get('/api/referrals/abc123/stats');

    expect(res.status).toBe(200);
    expect(res.body.clicks).toBe(2);
    expect(res.body.recent).toHaveLength(1);
    expect(res.body.recent[0].at).toBe('2026-07-20T01:00:00.000Z');
  });
});
