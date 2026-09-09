import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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
  createLeague: vi.fn(),
  joinLeague: vi.fn(),
  getLeagueById: vi.fn(),
  getLeagueByJoinCode: vi.fn(),
  getMembership: vi.fn(),
  countMembers: vi.fn(),
  listPublicOpenLeagues: vi.fn(),
  getMyLeagues: vi.fn(),
  getLeagueStandingRows: vi.fn(),
  listLeagueEspnLeagues: vi.fn(),
  addLeagueEspnLeague: vi.fn(),
  removeLeagueEspnLeague: vi.fn(),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './repository.js';
import zeroproofRouter from './routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/zeroproof', zeroproofRouter);
  app.use(errorHandler);
  return app;
}

const league = (overrides: Record<string, unknown> = {}) => ({
  id: 'lg-1',
  commissionerSub: 'auth0|me',
  name: 'Friday Night Parlays',
  joinCode: 'ABC234',
  visibility: 'public',
  startingBankrollCents: 50000,
  maxMembers: 10,
  winCondition: 'threshold',
  thresholdCents: 100000,
  endsAt: null,
  status: 'open',
  winnerSub: null,
  createdAt: new Date('2026-09-08T00:00:00Z'),
  settledAt: null,
  ...overrides,
});

const standingRow = (overrides: Record<string, unknown> = {}) => ({
  userSub: 'auth0|someone',
  balanceCents: 50000,
  bets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: 'auth0|me' };
  vi.mocked(repo.listLeagueEspnLeagues).mockResolvedValue([] as never);
});

describe('creating a league', () => {
  const body = {
    name: 'Friday Night Parlays',
    visibility: 'public',
    startingBankrollCents: 50000,
    maxMembers: 10,
    winCondition: 'threshold',
    thresholdCents: 100000,
  };

  test('creates a league and returns it with its join code and one member', async () => {
    vi.mocked(repo.createLeague).mockResolvedValue(league() as never);

    const res = await request(makeApp()).post('/api/zeroproof/leagues').send(body);

    expect(res.status).toBe(201);
    expect(res.body.league).toMatchObject({
      id: 'lg-1',
      joinCode: 'ABC234',
      memberCount: 1,
      status: 'open',
    });
  });

  test('rejects a target at or below the starting bankroll with 400', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/leagues')
      .send({ ...body, thresholdCents: 40000 });

    expect(res.status).toBe(400);
    expect(repo.createLeague).not.toHaveBeenCalled();
  });

  test('creates a league with an ESPN league, seeding it into the additive list', async () => {
    vi.mocked(repo.createLeague).mockResolvedValue(league() as never);
    vi.mocked(repo.addLeagueEspnLeague).mockResolvedValue({ id: 'le-1' } as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/leagues')
      .send({ ...body, espnGame: 'ffl', espnLeagueId: '836777691', espnSeason: '2026' });

    expect(res.status).toBe(201);
    expect(repo.addLeagueEspnLeague).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: 'lg-1',
        game: 'ffl',
        espnLeagueId: '836777691',
        season: '2026',
      }),
    );
  });

  test('rejects a partial ESPN binding with 400', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/leagues')
      .send({ ...body, espnGame: 'ffl' });

    expect(res.status).toBe(400);
    expect(repo.createLeague).not.toHaveBeenCalled();
  });

  test('a token without a subject is refused', async () => {
    claims = {};
    const res = await request(makeApp()).post('/api/zeroproof/leagues').send(body);
    expect(res.status).toBe(401);
    expect(repo.createLeague).not.toHaveBeenCalled();
  });
});

describe('joining a league', () => {
  test('refuses a full league with 409', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league({ maxMembers: 2 }) as never);
    vi.mocked(repo.getMembership).mockResolvedValue(undefined as never);
    vi.mocked(repo.countMembers).mockResolvedValue(2 as never);

    const res = await request(makeApp()).post('/api/zeroproof/leagues/lg-1/join').send({});

    expect(res.status).toBe(409);
    expect(repo.joinLeague).not.toHaveBeenCalled();
  });

  test('refuses a settled league with 409', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league({ status: 'settled' }) as never);
    vi.mocked(repo.getMembership).mockResolvedValue(undefined as never);
    vi.mocked(repo.countMembers).mockResolvedValue(0 as never);

    const res = await request(makeApp()).post('/api/zeroproof/leagues/lg-1/join').send({});

    expect(res.status).toBe(409);
    expect(repo.joinLeague).not.toHaveBeenCalled();
  });

  test('is idempotent — an existing member gets their wallet, no second join', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league() as never);
    vi.mocked(repo.getMembership).mockResolvedValue({ walletId: 'w-existing' } as never);

    const res = await request(makeApp()).post('/api/zeroproof/leagues/lg-1/join').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ walletId: 'w-existing' });
    expect(repo.joinLeague).not.toHaveBeenCalled();
  });

  test('an invite league rejects a wrong code and accepts the right one', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(
      league({ visibility: 'invite', joinCode: 'SECRET7' }) as never,
    );
    vi.mocked(repo.getMembership).mockResolvedValue(undefined as never);
    vi.mocked(repo.countMembers).mockResolvedValue(1 as never);

    const wrong = await request(makeApp())
      .post('/api/zeroproof/leagues/lg-1/join')
      .send({ joinCode: 'NOPE99' });
    expect(wrong.status).toBe(403);
    expect(repo.joinLeague).not.toHaveBeenCalled();

    vi.mocked(repo.joinLeague).mockResolvedValue({ walletId: 'w-new', joined: true } as never);
    const right = await request(makeApp())
      .post('/api/zeroproof/leagues/lg-1/join')
      .send({ joinCode: 'secret7' }); // case-insensitive
    expect(right.status).toBe(200);
    expect(right.body).toEqual({ walletId: 'w-new' });
  });

  test('a public league joins by id without a code', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league() as never);
    vi.mocked(repo.getMembership).mockResolvedValue(undefined as never);
    vi.mocked(repo.countMembers).mockResolvedValue(3 as never);
    vi.mocked(repo.joinLeague).mockResolvedValue({ walletId: 'w-new', joined: true } as never);

    const res = await request(makeApp()).post('/api/zeroproof/leagues/lg-1/join').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ walletId: 'w-new' });
  });

  test('joining a league that does not exist is 404', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(undefined as never);
    const res = await request(makeApp()).post('/api/zeroproof/leagues/lg-x/join').send({});
    expect(res.status).toBe(404);
  });
});

describe('league detail and standings', () => {
  test('ranks members by balance and hides the join code from a non-member', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(
      league({
        visibility: 'invite',
        joinCode: 'SECRET7',
        commissionerSub: 'auth0|other',
      }) as never,
    );
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([
      standingRow({ userSub: 'auth0|a', balanceCents: 1200 }),
      standingRow({ userSub: 'auth0|b', balanceCents: 1840 }),
    ] as never);
    vi.mocked(repo.getMembership).mockResolvedValue(undefined as never);

    const res = await request(makeApp()).get('/api/zeroproof/leagues/lg-1');

    expect(res.status).toBe(200);
    expect(res.body.league.joinCode).toBeNull();
    expect(res.body.isMember).toBe(false);
    expect(
      res.body.standings.map((s: { userSub: string; rank: number }) => [s.userSub, s.rank]),
    ).toEqual([
      ['auth0|b', 1],
      ['auth0|a', 2],
    ]);
  });

  test('shows the join code and wallet to a member', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(
      league({
        visibility: 'invite',
        joinCode: 'SECRET7',
        commissionerSub: 'auth0|other',
      }) as never,
    );
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([
      standingRow({ userSub: 'auth0|me' }),
    ] as never);
    vi.mocked(repo.getMembership).mockResolvedValue({ walletId: 'w-me' } as never);

    const res = await request(makeApp()).get('/api/zeroproof/leagues/lg-1');

    expect(res.status).toBe(200);
    expect(res.body.league.joinCode).toBe('SECRET7');
    expect(res.body.isMember).toBe(true);
    expect(res.body.callerWalletId).toBe('w-me');
  });

  test('returns the ESPN leagues the commissioner added, with resolution health', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league() as never);
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([standingRow()] as never);
    vi.mocked(repo.getMembership).mockResolvedValue(undefined as never);
    vi.mocked(repo.listLeagueEspnLeagues).mockResolvedValue([
      {
        id: 'le-1',
        leagueId: 'lg-1',
        game: 'ffl',
        espnLeagueId: '836777691',
        season: '2026',
        label: 'The office league',
        createdAt: new Date('2026-09-08T00:00:00Z'),
        lastCheckedAt: new Date('2026-09-09T00:00:00Z'),
        lastOkAt: null,
        lastError: 'ESPN fantasy returned 401 for ffl:836777691:2026',
      },
    ] as never);

    const res = await request(makeApp()).get('/api/zeroproof/leagues/lg-1');

    expect(res.status).toBe(200);
    expect(res.body.espnLeagues).toEqual([
      {
        id: 'le-1',
        game: 'ffl',
        leagueId: '836777691',
        season: '2026',
        label: 'The office league',
        createdAt: '2026-09-08T00:00:00.000Z',
        lastCheckedAt: '2026-09-09T00:00:00.000Z',
        lastOkAt: null,
        lastError: 'ESPN fantasy returned 401 for ffl:836777691:2026',
      },
    ]);
  });
});

describe('commissioner-managed ESPN leagues', () => {
  test('the commissioner adds an ESPN league and gets 201', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league() as never);
    vi.mocked(repo.addLeagueEspnLeague).mockResolvedValue({
      id: 'le-1',
      leagueId: 'lg-1',
      game: 'ffl',
      espnLeagueId: '836777691',
      season: '2026',
      label: null,
      createdAt: new Date('2026-09-08T00:00:00Z'),
    } as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/leagues/lg-1/espn-leagues')
      .send({ game: 'ffl', leagueId: '836777691', season: '2026' });

    expect(res.status).toBe(201);
    expect(res.body.espnLeague).toMatchObject({ game: 'ffl', leagueId: '836777691', season: '2026' });
    expect(repo.addLeagueEspnLeague).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 'lg-1', game: 'ffl', espnLeagueId: '836777691', season: '2026' }),
    );
  });

  test('a non-commissioner is refused with 403', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(
      league({ commissionerSub: 'auth0|someone-else' }) as never,
    );

    const res = await request(makeApp())
      .post('/api/zeroproof/leagues/lg-1/espn-leagues')
      .send({ game: 'ffl', leagueId: '836777691', season: '2026' });

    expect(res.status).toBe(403);
    expect(repo.addLeagueEspnLeague).not.toHaveBeenCalled();
  });

  test('adding to a league that does not exist is 404', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(undefined as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/leagues/lg-1/espn-leagues')
      .send({ game: 'ffl', leagueId: '836777691', season: '2026' });

    expect(res.status).toBe(404);
  });

  test('a malformed season is refused with 400 before any repo call', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/leagues/lg-1/espn-leagues')
      .send({ game: 'ffl', leagueId: '836777691', season: 'twenty' });

    expect(res.status).toBe(400);
    expect(repo.addLeagueEspnLeague).not.toHaveBeenCalled();
  });

  test('the commissioner removes an ESPN league and gets 204', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(league() as never);
    vi.mocked(repo.removeLeagueEspnLeague).mockResolvedValue(undefined as never);

    const res = await request(makeApp()).delete(
      '/api/zeroproof/leagues/lg-1/espn-leagues/le-1',
    );

    expect(res.status).toBe(204);
    expect(repo.removeLeagueEspnLeague).toHaveBeenCalledWith('lg-1', 'le-1');
  });

  test('a non-commissioner cannot remove — 403', async () => {
    vi.mocked(repo.getLeagueById).mockResolvedValue(
      league({ commissionerSub: 'auth0|someone-else' }) as never,
    );

    const res = await request(makeApp()).delete(
      '/api/zeroproof/leagues/lg-1/espn-leagues/le-1',
    );

    expect(res.status).toBe(403);
    expect(repo.removeLeagueEspnLeague).not.toHaveBeenCalled();
  });
});

describe('discovery and my leagues', () => {
  test('lists public leagues without exposing join codes', async () => {
    vi.mocked(repo.listPublicOpenLeagues).mockResolvedValue([
      { league: league(), memberCount: 4 },
    ] as never);

    const res = await request(makeApp()).get('/api/zeroproof/leagues?q=friday');

    expect(res.status).toBe(200);
    expect(res.body.leagues).toHaveLength(1);
    expect(res.body.leagues[0].joinCode).toBeNull();
    expect(res.body.leagues[0].memberCount).toBe(4);
  });

  test('mine returns the caller leagues with their join codes', async () => {
    vi.mocked(repo.getMyLeagues).mockResolvedValue([{ league: league(), memberCount: 1 }] as never);

    const res = await request(makeApp()).get('/api/zeroproof/leagues/mine');

    expect(res.status).toBe(200);
    expect(res.body.leagues[0].joinCode).toBe('ABC234');
  });
});
