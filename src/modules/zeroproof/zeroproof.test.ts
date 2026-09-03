import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

let claims: Record<string, unknown> = { sub: 'auth0|me' };

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  openWallet: vi.fn(),
  listWallets: vi.fn(),
  listUpcomingEventsWithLines: vi.fn(),
  upsertEvent: vi.fn(),
  insertSnapshot: vi.fn(),
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
