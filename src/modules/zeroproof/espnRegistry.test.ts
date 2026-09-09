import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let claims: Record<string, unknown> = { sub: 'auth0|me' };

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
}));
vi.mock('../../shared/auth/adminEmail.js', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  listEspnLeagues: vi.fn(),
  addEspnLeague: vi.fn(),
  removeEspnLeague: vi.fn(),
}));

import zeroproofRouter from './routes.js';
import * as repo from './repository.js';
import { resolveEspnLeagueKeys } from './service.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/zeroproof', zeroproofRouter);
  app.use(errorHandler);
  return app;
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'reg-1',
  game: 'ffl',
  leagueId: '836777691',
  season: '2026',
  label: null,
  createdAt: new Date('2026-09-08T00:00:00Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: 'auth0|me' };
});
afterEach(() => {
  delete process.env.ESPN_FANTASY_LEAGUES;
});

describe('the ESPN league registry endpoints', () => {
  test('GET lists the registered leagues', async () => {
    vi.mocked(repo.listEspnLeagues).mockResolvedValue([row()] as never);
    const res = await request(makeApp()).get('/api/zeroproof/espn-leagues');
    expect(res.status).toBe(200);
    expect(res.body.leagues).toHaveLength(1);
    expect(res.body.leagues[0].leagueId).toBe('836777691');
  });

  test('POST registers a league and returns 201', async () => {
    vi.mocked(repo.addEspnLeague).mockResolvedValue(row({ label: 'The League' }) as never);
    const res = await request(makeApp())
      .post('/api/zeroproof/espn-leagues')
      .send({ game: 'ffl', leagueId: '836777691', season: '2026', label: 'The League' });
    expect(res.status).toBe(201);
    expect(repo.addEspnLeague).toHaveBeenCalledWith(
      expect.objectContaining({ game: 'ffl', leagueId: '836777691', season: '2026', label: 'The League' }),
    );
  });

  test('POST rejects a malformed season with 400', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/espn-leagues')
      .send({ game: 'ffl', leagueId: '836777691', season: 'twenty' });
    expect(res.status).toBe(400);
    expect(repo.addEspnLeague).not.toHaveBeenCalled();
  });

  test('DELETE removes a league and returns 204', async () => {
    vi.mocked(repo.removeEspnLeague).mockResolvedValue(undefined as never);
    const res = await request(makeApp()).delete('/api/zeroproof/espn-leagues/reg-1');
    expect(res.status).toBe(204);
    expect(repo.removeEspnLeague).toHaveBeenCalledWith('reg-1');
  });
});

describe('resolveEspnLeagueKeys', () => {
  test('unions the registered leagues with the env fallback, deduped', async () => {
    vi.mocked(repo.listEspnLeagues).mockResolvedValue([
      row({ game: 'ffl', leagueId: '836777691', season: '2026' }),
      row({ game: 'fba', leagueId: '449389534', season: '2027' }),
    ] as never);
    process.env.ESPN_FANTASY_LEAGUES = 'ffl:836777691:2026,ffl:111:2025';

    const keys = await resolveEspnLeagueKeys();

    expect(keys).toEqual([
      'ffl:836777691:2026',
      'fba:449389534:2027',
      'ffl:111:2025', // from env, the duplicate ffl:836777691:2026 is not repeated
    ]);
  });

  test('is empty when nothing is registered and no env fallback is set', async () => {
    vi.mocked(repo.listEspnLeagues).mockResolvedValue([] as never);
    expect(await resolveEspnLeagueKeys()).toEqual([]);
  });
});
