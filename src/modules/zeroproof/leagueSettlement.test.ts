import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  getOpenLeagues: vi.fn(),
  getLeagueStandingRows: vi.fn(),
  settleLeague: vi.fn(),
}));

import * as repo from './repository.js';
import { settleFinishedLeagues } from './service.js';

const league = (overrides: Record<string, unknown> = {}) => ({
  id: 'lg-1',
  winCondition: 'threshold',
  thresholdCents: 100000,
  endsAt: null,
  ...overrides,
});

const row = (userSub: string, walletId: string, balanceCents: number) => ({
  userSub,
  walletId,
  balanceCents,
  bets: [],
});

beforeEach(() => vi.clearAllMocks());

describe('settling finished leagues', () => {
  test('settles a threshold league once a member reaches the target, winner = leader', async () => {
    vi.mocked(repo.getOpenLeagues).mockResolvedValue([league()] as never);
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([
      row('auth0|a', 'w-a', 80000),
      row('auth0|b', 'w-b', 120000),
    ] as never);

    const count = await settleFinishedLeagues(new Date('2026-09-08T00:00:00Z'));

    expect(count).toBe(1);
    expect(repo.settleLeague).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: 'lg-1',
        winnerSub: 'auth0|b',
        rankings: [
          expect.objectContaining({ userSub: 'auth0|b', walletId: 'w-b', rank: 1 }),
          expect.objectContaining({ userSub: 'auth0|a', walletId: 'w-a', rank: 2 }),
        ],
      }),
    );
  });

  test('leaves a threshold league alone until someone crosses', async () => {
    vi.mocked(repo.getOpenLeagues).mockResolvedValue([league()] as never);
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([
      row('auth0|a', 'w-a', 90000),
    ] as never);

    const count = await settleFinishedLeagues(new Date('2026-09-08T00:00:00Z'));

    expect(count).toBe(0);
    expect(repo.settleLeague).not.toHaveBeenCalled();
  });

  test('settles a timeline league once its deadline has passed', async () => {
    vi.mocked(repo.getOpenLeagues).mockResolvedValue([
      league({
        winCondition: 'timeline',
        thresholdCents: null,
        endsAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ] as never);
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([
      row('auth0|a', 'w-a', 60000),
      row('auth0|b', 'w-b', 40000),
    ] as never);

    const count = await settleFinishedLeagues(new Date('2026-09-08T00:00:00Z'));

    expect(count).toBe(1);
    expect(repo.settleLeague).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 'lg-1', winnerSub: 'auth0|a' }),
    );
  });

  test('leaves a timeline league alone before its deadline', async () => {
    vi.mocked(repo.getOpenLeagues).mockResolvedValue([
      league({
        winCondition: 'timeline',
        thresholdCents: null,
        endsAt: new Date('2026-12-01T00:00:00Z'),
      }),
    ] as never);
    vi.mocked(repo.getLeagueStandingRows).mockResolvedValue([
      row('auth0|a', 'w-a', 60000),
    ] as never);

    const count = await settleFinishedLeagues(new Date('2026-09-08T00:00:00Z'));

    expect(count).toBe(0);
    expect(repo.settleLeague).not.toHaveBeenCalled();
  });
});
