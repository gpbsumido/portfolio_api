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
  getWallet: vi.fn(),
  claimDaily: vi.fn(),
  openPack: vi.fn(),
  listPulls: vi.fn(),
}));

import tcgRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tcg', tcgRouter);
  app.use(errorHandler);
  return app;
}

const card = (overrides: Record<string, unknown> = {}) => ({
  id: 'nba-1-2026-04-17',
  playerId: 1,
  playerName: 'Star',
  points: 41,
  rarity: 'sir',
  sport: 'nba',
  periodId: '2026-04-17',
  title: 'Star · 41 PTS',
  subtitle: 'Apr 17 vs PHX',
  imageUrl: 'https://a.espncdn.com/i/headshots/nba/players/full/1.png',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: 'auth0|me' };
});

describe('wallet', () => {
  test('returns the caller-scoped balance', async () => {
    vi.mocked(repo.getWallet).mockResolvedValue({ balance: 300, lastClaimDate: '2026-08-22' });

    const res = await request(makeApp()).get('/api/tcg/wallet');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: 300, lastClaimDate: '2026-08-22' });
    expect(repo.getWallet).toHaveBeenCalledWith('auth0|me');
  });

  test('a token without a subject is refused', async () => {
    claims = {};
    const res = await request(makeApp()).get('/api/tcg/wallet');
    expect(res.status).toBe(401);
    expect(repo.getWallet).not.toHaveBeenCalled();
  });
});

describe('daily claim', () => {
  test('grants coins and reports whether it fired', async () => {
    vi.mocked(repo.claimDaily).mockResolvedValue({ claimed: true, balance: 500 });

    const res = await request(makeApp()).post('/api/tcg/wallet/claim');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ claimed: true, balance: 500 });
    expect(repo.claimDaily).toHaveBeenCalledWith('auth0|me', expect.any(String), 500);
  });
});

describe('opening a pack', () => {
  test('debits and records when the wallet can afford it', async () => {
    vi.mocked(repo.openPack).mockResolvedValue({ ok: true, balance: 400, added: 5 });

    const res = await request(makeApp())
      .post('/api/tcg/packs/open')
      .send({ cards: [card(), card({ id: 'nba-2-2026-04-17', playerId: 2 })] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: 400, added: 5, cost: 100 });
    expect(repo.openPack).toHaveBeenCalledWith('auth0|me', 100, expect.any(Array));
  });

  test('answers 402 when the wallet is short', async () => {
    vi.mocked(repo.openPack).mockResolvedValue({ ok: false, balance: 50, added: 0 });

    const res = await request(makeApp()).post('/api/tcg/packs/open').send({ cards: [card()] });

    expect(res.status).toBe(402);
    expect(res.body.balance).toBe(50);
  });

  test('an empty or malformed pack is rejected before the repo', async () => {
    const empty = await request(makeApp()).post('/api/tcg/packs/open').send({ cards: [] });
    const bad = await request(makeApp())
      .post('/api/tcg/packs/open')
      .send({ cards: [card({ rarity: 'legendary' })] });

    expect(empty.status).toBe(400);
    expect(bad.status).toBe(400);
    expect(repo.openPack).not.toHaveBeenCalled();
  });
});

describe('collection', () => {
  test('returns the caller-scoped pulls as ISO-dated cards', async () => {
    vi.mocked(repo.listPulls).mockResolvedValue([
      {
        id: 'uuid-1',
        userSub: 'auth0|me',
        cardId: 'nba-1-2026-04-17',
        sport: 'nba',
        playerId: 1,
        playerName: 'Star',
        points: 41,
        rarity: 'sir',
        periodId: '2026-04-17',
        title: 'Star · 41 PTS',
        subtitle: 'Apr 17 vs PHX',
        imageUrl: 'https://a.espncdn.com/i/headshots/nba/players/full/1.png',
        opponent: 'CHA',
        home: true,
        pulledAt: new Date('2026-08-22T00:00:00Z'),
      },
    ] as never);

    const res = await request(makeApp()).get('/api/tcg/collection');

    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].pulledAt).toBe('2026-08-22T00:00:00.000Z');
    expect(repo.listPulls).toHaveBeenCalledWith('auth0|me', 500);
  });
});
