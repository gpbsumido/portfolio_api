import { describe, test, expect, vi, beforeEach } from 'vitest';
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
  openWallet: vi.fn(),
  listWallets: vi.fn(),
  listUpcomingEventsWithLines: vi.fn(),
  upsertEvent: vi.fn(),
  insertSnapshot: vi.fn(),
  getWalletById: vi.fn(),
  getLatestSnapshot: vi.fn(),
  placeBet: vi.fn(),
  getSettledBetsForUser: vi.fn(),
  getSettledBetsByUser: vi.fn(),
  logReferralClick: vi.fn(),
  houseSummary: vi.fn(),
}));

import zeroproofRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { ConflictError } from '../../shared/errors/index.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/zeroproof', zeroproofRouter);
  app.use(errorHandler);
  return app;
}

const wallet = (overrides: Record<string, unknown> = {}) => ({
  id: 'wallet-1',
  userSub: 'auth0|me',
  mode: 'season',
  principalCents: 50000,
  balanceCents: 50000,
  lockStart: new Date('2026-09-02T00:00:00Z'),
  lockEnd: new Date('2026-12-02T00:00:00Z'),
  status: 'active',
  createdAt: new Date('2026-09-02T00:00:00Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: 'auth0|me' };
});

const freshSnapshot = (overrides: Record<string, unknown> = {}) => ({
  outcomes: [
    { name: 'New York Yankees', priceAmerican: -145 },
    { name: 'Boston Red Sox', priceAmerican: 122 },
  ],
  fetchedAt: new Date(),
  ...overrides,
});

const bet = (overrides: Record<string, unknown> = {}) => ({
  id: 'bet-1',
  walletId: 'wallet-1',
  eventId: 'evt-1',
  market: 'h2h',
  selection: 'Boston Red Sox',
  oddsAmerican: 122,
  lineValue: null,
  closingOddsAmerican: null,
  clv: null,
  stakeCents: 2500,
  status: 'open',
  placedAt: new Date('2026-09-02T19:00:00Z'),
  settledAt: null,
  ...overrides,
});

describe('placing a bet', () => {
  const body = {
    walletId: 'wallet-1',
    eventId: 'evt-1',
    market: 'h2h',
    selection: 'Boston Red Sox',
    stakeCents: 2500,
  };

  test('places a bet at the current line and copies the odds onto it', async () => {
    vi.mocked(repo.getWalletById).mockResolvedValue(wallet() as never);
    vi.mocked(repo.getLatestSnapshot).mockResolvedValue(freshSnapshot() as never);
    vi.mocked(repo.placeBet).mockResolvedValue({ ok: true, bet: bet() } as never);

    const res = await request(makeApp()).post('/api/zeroproof/bets').send(body);

    expect(res.status).toBe(201);
    expect(res.body.bet).toMatchObject({ id: 'bet-1', oddsAmerican: 122, status: 'open' });
    expect(repo.placeBet).toHaveBeenCalledWith(
      expect.objectContaining({ oddsAmerican: 122, lineValue: null, stakeCents: 2500 }),
    );
  });

  test('rejects a stake the wallet cannot afford with 402', async () => {
    vi.mocked(repo.getWalletById).mockResolvedValue(wallet() as never);
    vi.mocked(repo.getLatestSnapshot).mockResolvedValue(freshSnapshot() as never);
    vi.mocked(repo.placeBet).mockResolvedValue({ ok: false, availableCents: 1000 } as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/bets')
      .send({ ...body, stakeCents: 999999 });

    expect(res.status).toBe(402);
    expect(res.body.availableCents).toBe(1000);
  });

  test('refuses a stale line older than 60 minutes', async () => {
    vi.mocked(repo.getWalletById).mockResolvedValue(wallet() as never);
    vi.mocked(repo.getLatestSnapshot).mockResolvedValue(
      freshSnapshot({ fetchedAt: new Date('2020-01-01T00:00:00Z') }) as never,
    );

    const res = await request(makeApp()).post('/api/zeroproof/bets').send(body);

    expect(res.status).toBe(409);
    expect(repo.placeBet).not.toHaveBeenCalled();
  });

  test('refuses to bet once the wallet is past its lock end', async () => {
    vi.mocked(repo.getWalletById).mockResolvedValue(
      wallet({ lockEnd: new Date('2020-01-01T00:00:00Z') }) as never,
    );
    vi.mocked(repo.getLatestSnapshot).mockResolvedValue(freshSnapshot() as never);

    const res = await request(makeApp()).post('/api/zeroproof/bets').send(body);

    expect(res.status).toBe(409);
    expect(repo.placeBet).not.toHaveBeenCalled();
  });

  test('rejects a selection the market does not offer', async () => {
    vi.mocked(repo.getWalletById).mockResolvedValue(wallet() as never);
    vi.mocked(repo.getLatestSnapshot).mockResolvedValue(freshSnapshot() as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/bets')
      .send({ ...body, selection: 'Nobody' });

    expect(res.status).toBe(400);
    expect(repo.placeBet).not.toHaveBeenCalled();
  });

  test("cannot bet from a wallet that isn't the caller's", async () => {
    vi.mocked(repo.getWalletById).mockResolvedValue(wallet({ userSub: 'auth0|someone-else' }) as never);
    vi.mocked(repo.getLatestSnapshot).mockResolvedValue(freshSnapshot() as never);

    const res = await request(makeApp()).post('/api/zeroproof/bets').send(body);

    expect(res.status).toBe(404);
    expect(repo.placeBet).not.toHaveBeenCalled();
  });

  test('a token without a subject is refused', async () => {
    claims = {};
    const res = await request(makeApp()).post('/api/zeroproof/bets').send(body);
    expect(res.status).toBe(401);
    expect(repo.placeBet).not.toHaveBeenCalled();
  });
});

describe('opening a wallet', () => {
  test('opens a Season wallet with the requested deposit and returns its derived balance', async () => {
    vi.mocked(repo.openWallet).mockResolvedValue(wallet() as never);

    const res = await request(makeApp())
      .post('/api/zeroproof/wallets')
      .send({ mode: 'season', depositCents: 50000 });

    expect(res.status).toBe(201);
    expect(res.body.wallet).toMatchObject({
      id: 'wallet-1',
      mode: 'season',
      principalCents: 50000,
      balanceCents: 50000,
      status: 'active',
    });
    expect(repo.openWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userSub: 'auth0|me', mode: 'season', principalCents: 50000 }),
    );
  });

  test('a Challenge wallet is fixed at $100 no matter what the body asks for', async () => {
    vi.mocked(repo.openWallet).mockResolvedValue(
      wallet({ mode: 'challenge', principalCents: 10000, balanceCents: 10000 }) as never,
    );

    const res = await request(makeApp())
      .post('/api/zeroproof/wallets')
      .send({ mode: 'challenge', depositCents: 999999 });

    expect(res.status).toBe(201);
    expect(repo.openWallet).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'challenge', principalCents: 10000 }),
    );
  });

  test('a Season deposit under the $20 minimum is rejected before the repo', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/wallets')
      .send({ mode: 'season', depositCents: 1500 });

    expect(res.status).toBe(400);
    expect(repo.openWallet).not.toHaveBeenCalled();
  });

  test('a Season request with no deposit amount is rejected', async () => {
    const res = await request(makeApp())
      .post('/api/zeroproof/wallets')
      .send({ mode: 'season' });

    expect(res.status).toBe(400);
    expect(repo.openWallet).not.toHaveBeenCalled();
  });

  test('a second active wallet of the same mode is refused with 409', async () => {
    vi.mocked(repo.openWallet).mockRejectedValue(
      new ConflictError('You already have an active season wallet'),
    );

    const res = await request(makeApp())
      .post('/api/zeroproof/wallets')
      .send({ mode: 'season', depositCents: 50000 });

    expect(res.status).toBe(409);
  });

  test('a token without a subject is refused', async () => {
    claims = {};
    const res = await request(makeApp())
      .post('/api/zeroproof/wallets')
      .send({ mode: 'season', depositCents: 50000 });

    expect(res.status).toBe(401);
    expect(repo.openWallet).not.toHaveBeenCalled();
  });
});

describe('referral link (/refer)', () => {
  test('logs the click with the caller and partner, then 302s to the book', async () => {
    vi.mocked(repo.logReferralClick).mockResolvedValue(undefined as never);

    const res = await request(makeApp()).get('/api/zeroproof/refer?partner=draftkings').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('draftkings');
    expect(repo.logReferralClick).toHaveBeenCalledWith(
      expect.objectContaining({ userSub: 'auth0|me', partner: 'draftkings' }),
    );
  });

  test('rejects an unknown partner rather than redirect anywhere', async () => {
    const res = await request(makeApp()).get('/api/zeroproof/refer?partner=sketchybook').redirects(0);
    expect(res.status).toBe(400);
    expect(repo.logReferralClick).not.toHaveBeenCalled();
  });
});

describe('house view (/house)', () => {
  test('returns the float, accrued yield and referral clicks', async () => {
    vi.mocked(repo.houseSummary).mockResolvedValue({
      houseCents: 15000,
      escrowCents: -60000,
      yieldCents: 5000,
      referralClicks: 3,
    } as never);

    const res = await request(makeApp()).get('/api/zeroproof/house');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ houseCents: 15000, yieldCents: 5000, referralClicks: 3 });
  });
});

describe('profile (/me)', () => {
  test('returns the caller record, ROI and wallets', async () => {
    vi.mocked(repo.listWallets).mockResolvedValue([wallet()] as never);
    vi.mocked(repo.getSettledBetsForUser).mockResolvedValue([
      { status: 'won', stakeCents: 1000, oddsAmerican: 100, clv: '5', settledAt: new Date('2026-09-01') },
      { status: 'lost', stakeCents: 1000, oddsAmerican: -110, clv: '-2', settledAt: new Date('2026-09-02') },
    ] as never);

    const res = await request(makeApp()).get('/api/zeroproof/me');

    expect(res.status).toBe(200);
    expect(res.body.stats.wins).toBe(1);
    expect(res.body.stats.losses).toBe(1);
    expect(res.body.wallets).toHaveLength(1);
    expect(res.body.accolades).toEqual([]);
    expect(repo.getSettledBetsForUser).toHaveBeenCalledWith('auth0|me');
  });

  test('a token without a subject is refused', async () => {
    claims = {};
    const res = await request(makeApp()).get('/api/zeroproof/me');
    expect(res.status).toBe(401);
  });
});

describe('leaderboard', () => {
  const manyBets = (clv: number, count: number) =>
    Array.from({ length: count }, () => ({
      status: 'won',
      stakeCents: 1000,
      oddsAmerican: 100,
      clv: String(clv),
      settledAt: new Date('2026-09-01'),
    }));

  test('ranks the higher-CLV user first on the sharp board', async () => {
    vi.mocked(repo.getSettledBetsByUser).mockResolvedValue([
      { userSub: 'auth0|low', bets: manyBets(2, 50) },
      { userSub: 'auth0|high', bets: manyBets(8, 50) },
    ] as never);

    const res = await request(makeApp()).get('/api/zeroproof/leaderboard?board=sharp');

    expect(res.status).toBe(200);
    expect(res.body.entries[0].userSub).toBe('auth0|high');
    expect(res.body.entries[0].sharpScore).toBeGreaterThan(res.body.entries[1].sharpScore);
  });

  test('is public — readable without a token', async () => {
    claims = {};
    vi.mocked(repo.getSettledBetsByUser).mockResolvedValue([] as never);
    const res = await request(makeApp()).get('/api/zeroproof/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });
});

describe('listing events', () => {
  test('returns upcoming events with their latest lines from the DB, ISO-dated', async () => {
    vi.mocked(repo.listUpcomingEventsWithLines).mockResolvedValue([
      {
        id: 'evt-1',
        sport: 'baseball_mlb',
        home: 'Boston Red Sox',
        away: 'New York Yankees',
        commenceTime: new Date('2026-09-02T23:05:00Z'),
        status: 'upcoming',
        markets: [
          {
            market: 'h2h',
            fetchedAt: new Date('2026-09-02T20:00:00Z'),
            outcomes: [
              { name: 'New York Yankees', priceAmerican: -145 },
              { name: 'Boston Red Sox', priceAmerican: 122 },
            ],
          },
        ],
      },
    ] as never);

    const res = await request(makeApp()).get('/api/zeroproof/events');

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].commenceTime).toBe('2026-09-02T23:05:00.000Z');
    expect(res.body.events[0].markets[0].market).toBe('h2h');
    expect(res.body.events[0].markets[0].outcomes[0].priceAmerican).toBe(-145);
  });

  test('is public — no auth token required to read the slate', async () => {
    claims = {};
    vi.mocked(repo.listUpcomingEventsWithLines).mockResolvedValue([] as never);

    const res = await request(makeApp()).get('/api/zeroproof/events');

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });
});

describe('listing wallets', () => {
  test('returns the caller-scoped wallets with ISO dates', async () => {
    vi.mocked(repo.listWallets).mockResolvedValue([wallet()] as never);

    const res = await request(makeApp()).get('/api/zeroproof/wallets');

    expect(res.status).toBe(200);
    expect(res.body.wallets).toHaveLength(1);
    expect(res.body.wallets[0].lockEnd).toBe('2026-12-02T00:00:00.000Z');
    expect(repo.listWallets).toHaveBeenCalledWith('auth0|me');
  });
});
