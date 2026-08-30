import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|me' } };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));

vi.mock('./catalog.js', () => ({ readCatalog: vi.fn() }));
vi.mock('./repository.js', () => ({
  getWallet: vi.fn(),
  claimDaily: vi.fn(),
  openPack: vi.fn(),
  listPulls: vi.fn(),
}));

import tcgRouter from './routes.js';
import { readCatalog } from './catalog.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tcg', tcgRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/tcg/catalog', () => {
  test('nests sets under their serie and reports how fresh it is', async () => {
    vi.mocked(readCatalog).mockResolvedValue({
      series: [
        {
          id: 'tcgp',
          name: 'Pokémon TCG Pocket',
          logo: null,
          sets: [
            {
              id: 'A1',
              name: 'Genetic Apex',
              logo: null,
              symbol: null,
              cardCountOfficial: 226,
              cardCountTotal: 286,
            },
          ],
        },
      ],
      updatedAt: '2026-08-30T05:00:00.000Z',
    });

    const res = await request(makeApp()).get('/api/tcg/catalog');

    expect(res.status).toBe(200);
    expect(res.body.series[0].sets[0].id).toBe('A1');
    // The UI says how fresh this is instead of implying it is live.
    expect(res.body.updatedAt).toBe('2026-08-30T05:00:00.000Z');
  });

  test('serves the catalog without a token, since the pages reading it are public', async () => {
    vi.mocked(readCatalog).mockResolvedValue({ series: [], updatedAt: null });
    const res = await request(makeApp()).get('/api/tcg/catalog');
    expect(res.status).toBe(200);
  });

  test('answers a never-ingested catalog as empty rather than as an error', async () => {
    vi.mocked(readCatalog).mockResolvedValue({ series: [], updatedAt: null });

    const res = await request(makeApp()).get('/api/tcg/catalog');

    // "Nothing ingested yet" and "upstream is down" have to be distinguishable
    // at the other end — conflating them is how an outage passed for stale data.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ series: [], updatedAt: null });
  });

  test('500s rather than serving half a catalog when the read fails', async () => {
    vi.mocked(readCatalog).mockRejectedValue(new Error('db down'));
    const res = await request(makeApp()).get('/api/tcg/catalog');
    expect(res.status).toBe(500);
  });
});
