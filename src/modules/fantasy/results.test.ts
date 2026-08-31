import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Exercise routing + controller + client-key guard without a DB.
vi.mock('./results.repository.js', () => ({
  upsertResult: vi.fn(),
  listResults: vi.fn(),
}));
// Rate limiters are pass-through here; their behaviour is the limiter's own unit.
vi.mock('../../middleware/rateLimiter.js', () => ({
  createIpLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  createHeaderKeyLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../config/env.js', () => ({ env: { DRAFT_ADJ_SERVICE_TOKEN: 'test-secret' } }));

import { errorHandler } from '../../middleware/errorHandler.js';
import { CLIENT_KEY_HEADER } from './results.client-key.js';
import * as repo from './results.repository.js';
import router from './routes.js';

const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const validBody = (over: Record<string, unknown> = {}) => ({
  clientDraftId: 'draft-2026-08-31-abc',
  sport: 'nfl',
  numTeams: 12,
  rounds: 15,
  mySlot: 10,
  mode: 'practice',
  fullySim: false,
  humanPickCount: 2,
  teamNames: 'A|B',
  picks: [
    { overall: 0, teamIdx: 0, playerId: 'josh-allen', name: 'Josh Allen', pos: 'QB', source: 'sim', keeper: false },
    { overall: 10, teamIdx: 10, playerId: 'bijan-robinson', name: 'Bijan Robinson', pos: 'RB', source: 'user', keeper: false },
  ],
  standings: { rows: [{ teamIdx: 10, starterPts: 1800 }], myRank: 1 },
  projAdjustments: [],
  ...over,
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/fantasy', router);
  app.use(errorHandler);
  return app;
}

describe('draft results API', () => {
  beforeEach(() => vi.clearAllMocks());

  test('POST rejects a missing client key with 400 and never touches the DB', async () => {
    const res = await request(makeApp()).post('/api/fantasy/draft-results').send(validBody());
    expect(res.status).toBe(400);
    expect(repo.upsertResult).not.toHaveBeenCalled();
  });

  test('POST rejects a malformed (non-UUID) client key with 400', async () => {
    const res = await request(makeApp())
      .post('/api/fantasy/draft-results')
      .set(CLIENT_KEY_HEADER, 'not-a-uuid')
      .send(validBody());
    expect(res.status).toBe(400);
    expect(repo.upsertResult).not.toHaveBeenCalled();
  });

  test('POST with a valid key upserts and returns 201 with the id', async () => {
    (repo.upsertResult as any).mockResolvedValue({ id: '99999999-9999-9999-9999-999999999999' });
    const res = await request(makeApp())
      .post('/api/fantasy/draft-results')
      .set(CLIENT_KEY_HEADER, KEY)
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('99999999-9999-9999-9999-999999999999');
    // the client key is threaded to the repo so an install's drafts group
    expect(repo.upsertResult).toHaveBeenCalledWith(KEY, expect.objectContaining({ clientDraftId: 'draft-2026-08-31-abc' }));
  });

  test('POST validates the body — a bad mode is 400', async () => {
    const res = await request(makeApp())
      .post('/api/fantasy/draft-results')
      .set(CLIENT_KEY_HEADER, KEY)
      .send(validBody({ mode: 'nonsense' }));
    expect(res.status).toBe(400);
    expect(repo.upsertResult).not.toHaveBeenCalled();
  });

  test('POST caps the picks array (601 > 600) so a payload cannot be unbounded', async () => {
    const picks = Array.from({ length: 601 }, (_, i) => ({
      overall: i, teamIdx: 0, playerId: `p${i}`, name: `P${i}`, pos: 'RB', source: 'sim', keeper: false,
    }));
    const res = await request(makeApp())
      .post('/api/fantasy/draft-results')
      .set(CLIENT_KEY_HEADER, KEY)
      .send(validBody({ picks }));
    expect(res.status).toBe(400);
    expect(repo.upsertResult).not.toHaveBeenCalled();
  });

  test('POST /batch upserts every result in one request', async () => {
    (repo.upsertResult as any)
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce({ id: 'b' });
    const res = await request(makeApp())
      .post('/api/fantasy/draft-results/batch')
      .set(CLIENT_KEY_HEADER, KEY)
      .send({ results: [validBody({ clientDraftId: 'd1' }), validBody({ clientDraftId: 'd2' })] });
    expect(res.status).toBe(201);
    expect(res.body.upserted).toBe(2);
    expect(res.body.ids).toEqual(['a', 'b']);
    expect(repo.upsertResult).toHaveBeenCalledTimes(2);
  });

  test('POST /batch requires a valid client key and rejects an empty batch', async () => {
    const noKey = await request(makeApp()).post('/api/fantasy/draft-results/batch').send({ results: [validBody()] });
    expect(noKey.status).toBe(400);
    const empty = await request(makeApp()).post('/api/fantasy/draft-results/batch').set(CLIENT_KEY_HEADER, KEY).send({ results: [] });
    expect(empty.status).toBe(400);
    expect(repo.upsertResult).not.toHaveBeenCalled();
  });

  test('GET returns results newest-first as summaries (no blobs)', async () => {
    (repo.listResults as any).mockResolvedValue([
      { id: '1', client_key: KEY, sport: 'nfl', num_teams: 12, my_slot: 10, mode: 'practice', fully_sim: false, human_pick_count: 2, created_at: new Date() },
    ]);
    const res = await request(makeApp()).get('/api/fantasy/draft-results');
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ sport: 'nfl', mode: 'practice', fullySim: false, humanPickCount: 2 });
    expect(res.body.results[0].picks).toBeUndefined();
    expect(repo.listResults).toHaveBeenCalledWith(50, false); // default limit, summary
  });

  test('POST threads the manual projection adjustments through to the repo', async () => {
    (repo.upsertResult as any).mockResolvedValue({ id: 'z' });
    const projAdjustments = [{ playerId: 'josh-allen', name: 'Josh Allen', pos: 'QB', delta: 5 }];
    const res = await request(makeApp())
      .post('/api/fantasy/draft-results')
      .set(CLIENT_KEY_HEADER, KEY)
      .send(validBody({ projAdjustments }));
    expect(res.status).toBe(201);
    expect(repo.upsertResult).toHaveBeenCalledWith(KEY, expect.objectContaining({ projAdjustments }));
  });

  test('POST defaults projAdjustments to [] when omitted', async () => {
    (repo.upsertResult as any).mockResolvedValue({ id: 'z' });
    const body = validBody();
    delete (body as any).projAdjustments;
    const res = await request(makeApp()).post('/api/fantasy/draft-results').set(CLIENT_KEY_HEADER, KEY).send(body);
    expect(res.status).toBe(201);
    expect(repo.upsertResult).toHaveBeenCalledWith(KEY, expect.objectContaining({ projAdjustments: [] }));
  });

  test('GET ?full=true includes the picks + standings blobs', async () => {
    (repo.listResults as any).mockResolvedValue([
      {
        id: '1', client_key: KEY, client_draft_id: 'd1', sport: 'nfl', num_teams: 12, rounds: 15,
        my_slot: 10, mode: 'practice', fully_sim: false, human_pick_count: 2, team_names: 'A|B',
        picks: [{ overall: 0, teamIdx: 0, playerId: 'x', name: 'X', pos: 'QB', source: 'sim', keeper: false }],
        standings: { rows: [{ teamIdx: 10, starterPts: 1800 }], myRank: 1 },
        proj_adjustments: [{ playerId: 'josh-allen', name: 'Josh Allen', pos: 'QB', delta: 5 }],
        created_at: new Date(),
      },
    ]);
    const res = await request(makeApp()).get('/api/fantasy/draft-results?full=true&limit=200');
    expect(res.status).toBe(200);
    expect(repo.listResults).toHaveBeenCalledWith(200, true);
    expect(res.body.results[0].picks).toHaveLength(1);
    expect(res.body.results[0].standings.myRank).toBe(1);
    expect(res.body.results[0].clientDraftId).toBe('d1');
    expect(res.body.results[0].projAdjustments[0].delta).toBe(5);
  });
});
