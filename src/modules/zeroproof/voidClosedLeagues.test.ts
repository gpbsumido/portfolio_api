import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  getOpenBetsForProviderKeyPrefix: vi.fn(),
  settleBet: vi.fn(),
}));

import type { LeagueSpec } from './providers/espnFantasy.js';
import * as repo from './repository.js';
import { voidBetsForClosedLeagues } from './service.js';

const spec = (over: Partial<LeagueSpec> = {}): LeagueSpec => ({
  game: 'fba',
  leagueId: '123',
  season: '2027',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('voidBetsForClosedLeagues', () => {
  test('voids and refunds every open bet on a closed league, keyed by its provider prefix', async () => {
    vi.mocked(repo.getOpenBetsForProviderKeyPrefix).mockResolvedValue([
      { id: 'b1', walletId: 'w1', stakeCents: 1000, oddsAmerican: -110 },
      { id: 'b2', walletId: 'w2', stakeCents: 500, oddsAmerican: 120 },
    ]);

    const voided = await voidBetsForClosedLeagues([spec()]);

    expect(repo.getOpenBetsForProviderKeyPrefix).toHaveBeenCalledWith('espn:fba:2027:123:');
    expect(repo.settleBet).toHaveBeenCalledTimes(2);
    // A void grade refunds the stake and keeps the bet out of the record.
    expect(repo.settleBet).toHaveBeenCalledWith({
      bet: { id: 'b1', walletId: 'w1', stakeCents: 1000, oddsAmerican: -110 },
      grade: 'void',
      closingOdds: null,
      clv: null,
    });
    expect(voided).toBe(2);
  });

  test('no closed leagues means nothing is touched', async () => {
    const voided = await voidBetsForClosedLeagues([]);
    expect(repo.getOpenBetsForProviderKeyPrefix).not.toHaveBeenCalled();
    expect(repo.settleBet).not.toHaveBeenCalled();
    expect(voided).toBe(0);
  });

  test('a closed league with no open bets refunds nothing', async () => {
    vi.mocked(repo.getOpenBetsForProviderKeyPrefix).mockResolvedValue([]);

    const voided = await voidBetsForClosedLeagues([spec({ game: 'ffl', leagueId: '9' })]);

    expect(repo.getOpenBetsForProviderKeyPrefix).toHaveBeenCalledWith('espn:ffl:2027:9:');
    expect(repo.settleBet).not.toHaveBeenCalled();
    expect(voided).toBe(0);
  });
});
