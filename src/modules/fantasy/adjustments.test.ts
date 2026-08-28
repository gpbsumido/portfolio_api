import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Exercise routing + controller + write-auth without a DB.
vi.mock('./adjustments.repository.js', () => ({
  listAdjustments: vi.fn(),
  setStatus: vi.fn(),
  upsertBatch: vi.fn(),
}));
vi.mock('../../middleware/rateLimiter.js', () => ({
  createIpLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
// The write token the router reads at import time.
vi.mock('../../config/env.js', () => ({ env: { DRAFT_ADJ_SERVICE_TOKEN: 'test-secret' } }));

import { env } from '../../config/env.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './adjustments.repository.js';
import { ADJ_TOKEN_HEADER } from './adjustments.write-auth.js';
import router from './routes.js';

const row = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  player_name: 'Ricky Pearsall', team: 'SF', position: 'WR',
  category: 'injury', note: 'PCL, out for season', source_url: 'https://x',
  delta_pct: '-90', beneficiary_of: null, confidence: 'high',
  status: 'pending', batch_date: '2026-08-27', created_at: new Date(), updated_at: new Date(),
  ...over,
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/fantasy', router);
  app.use(errorHandler);
  return app;
}

const TOKEN = 'test-secret';

describe('draft adjustments API', () => {
  beforeEach(() => vi.clearAllMocks());

  test('GET /adjustments returns DTOs and passes the status filter through', async () => {
    (repo.listAdjustments as any).mockResolvedValue([row()]);
    const res = await request(makeApp()).get('/api/fantasy/adjustments?status=pending');
    expect(res.status).toBe(200);
    expect(res.body.adjustments[0]).toMatchObject({ player: 'Ricky Pearsall', deltaPct: -90, status: 'pending' });
    expect(repo.listAdjustments).toHaveBeenCalledWith('pending');
  });

  test('adjustments routes send permissive CORS and answer the preflight', async () => {
    (repo.listAdjustments as any).mockResolvedValue([]);
    const app = makeApp();
    const get = await request(app).get('/api/fantasy/adjustments').set('Origin', 'moz-extension://abc');
    expect(get.headers['access-control-allow-origin']).toBe('*');
    const pre = await request(app)
      .options('/api/fantasy/adjustments/11111111-1111-1111-1111-111111111111')
      .set('Origin', 'moz-extension://abc')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'x-draft-adj-token');
    expect(pre.status).toBeLessThan(300);
    expect((pre.headers['access-control-allow-headers'] || '').toLowerCase()).toContain('x-draft-adj-token');
  });

  test('GET defaults status to "all" when omitted', async () => {
    (repo.listAdjustments as any).mockResolvedValue([]);
    await request(makeApp()).get('/api/fantasy/adjustments');
    expect(repo.listAdjustments).toHaveBeenCalledWith('all');
  });

  test('PATCH /:id flips status with the token', async () => {
    (repo.setStatus as any).mockResolvedValue(row({ status: 'approved' }));
    const res = await request(makeApp())
      .patch('/api/fantasy/adjustments/11111111-1111-1111-1111-111111111111')
      .set(ADJ_TOKEN_HEADER, TOKEN)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.adjustment.status).toBe('approved');
    expect(repo.setStatus).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'approved');
  });

  test('PATCH without the token is 401 and never touches the DB', async () => {
    const res = await request(makeApp())
      .patch('/api/fantasy/adjustments/11111111-1111-1111-1111-111111111111')
      .send({ status: 'approved' });
    expect(res.status).toBe(401);
    expect(repo.setStatus).not.toHaveBeenCalled();
  });

  test('PATCH unknown id is 404', async () => {
    (repo.setStatus as any).mockResolvedValue(null);
    const res = await request(makeApp())
      .patch('/api/fantasy/adjustments/22222222-2222-2222-2222-222222222222')
      .set(ADJ_TOKEN_HEADER, TOKEN)
      .send({ status: 'rejected' });
    expect(res.status).toBe(404);
  });

  test('PATCH rejects an invalid status via zod', async () => {
    const res = await request(makeApp())
      .patch('/api/fantasy/adjustments/11111111-1111-1111-1111-111111111111')
      .set(ADJ_TOKEN_HEADER, TOKEN)
      .send({ status: 'maybe' });
    expect(res.status).toBe(400);
  });

  test('POST batch upserts with the token and reports the count', async () => {
    (repo.upsertBatch as any).mockResolvedValue(2);
    const items = [
      { player: 'Ricky Pearsall', team: 'SF', category: 'injury', note: 'out', deltaPct: -90, confidence: 'high' },
      { player: 'Mike Evans', team: 'SF', category: 'ripple', note: 'targets', deltaPct: 8, confidence: 'med', beneficiaryOf: 'Ricky Pearsall' },
    ];
    const res = await request(makeApp())
      .post('/api/fantasy/adjustments')
      .set(ADJ_TOKEN_HEADER, TOKEN)
      .send({ batchDate: '2026-08-27', items });
    expect(res.status).toBe(201);
    expect(res.body.upserted).toBe(2);
    expect(repo.upsertBatch).toHaveBeenCalledWith('2026-08-27', items);
  });

  test('POST batch rejects a delta outside [-100, 100]', async () => {
    const res = await request(makeApp())
      .post('/api/fantasy/adjustments')
      .set(ADJ_TOKEN_HEADER, TOKEN)
      .send({ batchDate: '2026-08-27', items: [{ player: 'X', category: 'injury', note: 'n', deltaPct: -500, confidence: 'low' }] });
    expect(res.status).toBe(400);
    expect(repo.upsertBatch).not.toHaveBeenCalled();
  });
});
