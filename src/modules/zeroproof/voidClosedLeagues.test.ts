import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  getOpenBetsForProviderKeyPrefix: vi.fn(),
  closeUpcomingEventsForProviderKeyPrefix: vi.fn(),
  settleBet: vi.fn(),
}));

import type { LeagueSpec } from './providers/espnFantasy.js';
import * as repo from './repository.js';
import { retireClosedLeagues } from './service.js';

const spec = (over: Partial<LeagueSpec> = {}): LeagueSpec => ({
  game: 'fba',
  leagueId: '123',
  season: '2027',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.closeUpcomingEventsForProviderKeyPrefix).mockResolvedValue(0);
  vi.mocked(repo.getOpenBetsForProviderKeyPrefix).mockResolvedValue([]);
});

describe('retireClosedLeagues', () => {
  test('voids every open bet and closes the upcoming events, keyed by provider prefix', async () => {
    vi.mocked(repo.getOpenBetsForProviderKeyPrefix).mockResolvedValue([
      { id: 'b1', walletId: 'w1', stakeCents: 1000, oddsAmerican: -110 },
      { id: 'b2', walletId: 'w2', stakeCents: 500, oddsAmerican: 120 },
    ]);
    vi.mocked(repo.closeUpcomingEventsForProviderKeyPrefix).mockResolvedValue(3);

    const result = await retireClosedLeagues([spec()]);

    expect(repo.getOpenBetsForProviderKeyPrefix).toHaveBeenCalledWith('espn:fba:2027:123:');
    expect(repo.closeUpcomingEventsForProviderKeyPrefix).toHaveBeenCalledWith('espn:fba:2027:123:');
    expect(repo.settleBet).toHaveBeenCalledTimes(2);
    expect(repo.settleBet).toHaveBeenCalledWith({
      bet: { id: 'b1', walletId: 'w1', stakeCents: 1000, oddsAmerican: -110 },
      grade: 'void',
      closingOdds: null,
      clv: null,
    });
    expect(result).toEqual({ betsVoided: 2, eventsClosed: 3 });
  });

  test('closes events even when a closed league has no open bets', async () => {
    vi.mocked(repo.closeUpcomingEventsForProviderKeyPrefix).mockResolvedValue(4);

    const result = await retireClosedLeagues([spec({ game: 'fba', leagueId: '9' })]);

    expect(repo.closeUpcomingEventsForProviderKeyPrefix).toHaveBeenCalledWith('espn:fba:2027:9:');
    expect(repo.settleBet).not.toHaveBeenCalled();
    expect(result).toEqual({ betsVoided: 0, eventsClosed: 4 });
  });

  test('no closed leagues means nothing is touched', async () => {
    const result = await retireClosedLeagues([]);
    expect(repo.getOpenBetsForProviderKeyPrefix).not.toHaveBeenCalled();
    expect(repo.closeUpcomingEventsForProviderKeyPrefix).not.toHaveBeenCalled();
    expect(repo.settleBet).not.toHaveBeenCalled();
    expect(result).toEqual({ betsVoided: 0, eventsClosed: 0 });
  });
});
