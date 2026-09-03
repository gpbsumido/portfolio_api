import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./repository.js', () => ({
  getEventByProviderKey: vi.fn(),
  getOpenBetsForEvent: vi.fn(),
  getClosingSnapshot: vi.fn(),
  settleBet: vi.fn(),
  markEventFinal: vi.fn(),
}));

import * as repo from './repository.js';
import { settle } from './service.js';
import type { ResultsProvider } from './providers/types.js';

const resultsProvider = (results: unknown[]): ResultsProvider => ({
  name: 'fake',
  getResults: vi.fn().mockResolvedValue(results),
});

const RESULT = {
  providerKey: 'evt-1',
  completed: true,
  home: 'Boston Red Sox',
  away: 'New York Yankees',
  homeScore: 3,
  awayScore: 5,
};

const OPEN_BET = {
  id: 'bet-1',
  walletId: 'w1',
  market: 'h2h',
  selection: 'New York Yankees',
  lineValue: null,
  oddsAmerican: -145,
  stakeCents: 2500,
  status: 'open',
};

beforeEach(() => vi.clearAllMocks());

describe('settling a slate', () => {
  test('grades each open bet once, stamps the closing line, and marks the event final', async () => {
    vi.mocked(repo.getEventByProviderKey).mockResolvedValue({
      id: 'evt-db-1',
      status: 'upcoming',
      commenceTime: new Date('2026-09-02T23:05:00Z'),
    } as never);
    vi.mocked(repo.getOpenBetsForEvent).mockResolvedValue([OPEN_BET] as never);
    vi.mocked(repo.getClosingSnapshot).mockResolvedValue({
      outcomes: [{ name: 'New York Yankees', priceAmerican: -160 }],
    } as never);

    const summary = await settle(resultsProvider([RESULT]), ['baseball_mlb']);

    expect(repo.settleBet).toHaveBeenCalledTimes(1);
    expect(repo.settleBet).toHaveBeenCalledWith(
      expect.objectContaining({ grade: 'won', closingOdds: -160 }),
    );
    expect(repo.markEventFinal).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ eventsSettled: 1, betsGraded: 1 });
  });

  test('is idempotent: a second run over an already-final event grades nothing', async () => {
    vi.mocked(repo.getEventByProviderKey).mockResolvedValue({
      id: 'evt-db-1',
      status: 'final',
      commenceTime: new Date('2026-09-02T23:05:00Z'),
    } as never);

    const summary = await settle(resultsProvider([RESULT]), ['baseball_mlb']);

    expect(repo.getOpenBetsForEvent).not.toHaveBeenCalled();
    expect(repo.settleBet).not.toHaveBeenCalled();
    expect(repo.markEventFinal).not.toHaveBeenCalled();
    expect(summary).toEqual({ eventsSettled: 0, betsGraded: 0 });
  });

  test('skips results the vendor has not marked complete', async () => {
    const summary = await settle(resultsProvider([{ ...RESULT, completed: false }]), ['baseball_mlb']);
    expect(repo.getEventByProviderKey).not.toHaveBeenCalled();
    expect(summary).toEqual({ eventsSettled: 0, betsGraded: 0 });
  });
});
