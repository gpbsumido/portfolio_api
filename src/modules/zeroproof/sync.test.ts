import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./repository.js', () => ({
  upsertEvent: vi.fn(),
  insertSnapshot: vi.fn(),
}));

import * as repo from './repository.js';
import { syncOdds } from './service.js';
import type { OddsProvider } from './providers/types.js';

const fakeProvider = (): OddsProvider => ({
  name: 'fake',
  getOdds: vi.fn().mockResolvedValue([
    {
      providerKey: 'evt-1',
      sport: 'baseball_mlb',
      home: 'Boston Red Sox',
      away: 'New York Yankees',
      commenceTime: new Date('2026-09-02T23:05:00Z'),
      markets: [
        { market: 'h2h', outcomes: [{ name: 'New York Yankees', priceAmerican: -145 }, { name: 'Boston Red Sox', priceAmerican: 122 }] },
        { market: 'total', outcomes: [{ name: 'Over', priceAmerican: -105, point: 8.5 }, { name: 'Under', priceAmerican: -115, point: 8.5 }] },
      ],
    },
  ]),
});

beforeEach(() => vi.clearAllMocks());

describe('syncing odds (snapshot write-through)', () => {
  test('upserts each event once and writes one snapshot per market', async () => {
    vi.mocked(repo.upsertEvent).mockResolvedValue('db-evt-1');

    const summary = await syncOdds(fakeProvider(), ['baseball_mlb']);

    expect(repo.upsertEvent).toHaveBeenCalledTimes(1);
    expect(repo.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ providerKey: 'evt-1', sport: 'baseball_mlb', home: 'Boston Red Sox' }),
    );
    // Two markets on the one event → two snapshots, each tagged with our event id.
    expect(repo.insertSnapshot).toHaveBeenCalledTimes(2);
    expect(repo.insertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'db-evt-1', market: 'h2h' }),
    );
    expect(summary).toEqual({ events: 1, snapshots: 2 });
  });
});
