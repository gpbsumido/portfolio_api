import { describe, test, expect } from 'vitest';
import { computeStats, sharpScore } from './stats.js';

// A settled bet as the stats functions see it.
const b = (overrides: Record<string, unknown> = {}) => ({
  status: 'won',
  stakeCents: 1000,
  oddsAmerican: 100, // even money → profit = stake
  clv: 5,
  settledAt: new Date('2026-09-01T00:00:00Z'),
  ...overrides,
});

describe('profile stats', () => {
  test('counts the record and rolls up ROI over settled bets', () => {
    const stats = computeStats([
      b({ status: 'won', stakeCents: 1000, oddsAmerican: 100 }), // +1000
      b({ status: 'lost', stakeCents: 1000 }), // -1000
      b({ status: 'won', stakeCents: 2000, oddsAmerican: 100 }), // +2000
      b({ status: 'push', stakeCents: 5000 }), // 0, stake not counted
    ]);

    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.pushes).toBe(1);
    // profit 2000 over 4000 staked (pushes excluded) → 50%
    expect(stats.roiPct).toBe(50);
    expect(stats.betCount).toBe(3); // graded win/loss bets
  });

  test('tracks the longest streak and the biggest single hit', () => {
    const stats = computeStats([
      b({ status: 'won', settledAt: new Date('2026-09-01') }),
      b({ status: 'won', settledAt: new Date('2026-09-02') }),
      b({ status: 'won', stakeCents: 5000, oddsAmerican: 200, settledAt: new Date('2026-09-03') }), // profit 10000
      b({ status: 'lost', settledAt: new Date('2026-09-04') }),
    ]);

    expect(stats.longestStreak).toBe(3);
    expect(stats.biggestHitCents).toBe(10000);
  });

  test('averages CLV over the bets that have it', () => {
    const stats = computeStats([b({ clv: 4 }), b({ clv: 8 }), b({ clv: null })]);
    expect(stats.clvAvgPct).toBe(6);
  });
});

describe('sharp score', () => {
  test('is undefined below the minimum bet count', () => {
    expect(sharpScore({ clvAvgPct: 5, roiPct: 10, betCount: 3 })).toBeNull();
  });

  test('is monotonic in CLV — more closing-line value ranks higher', () => {
    const lower = sharpScore({ clvAvgPct: 2, roiPct: 10, betCount: 50 });
    const higher = sharpScore({ clvAvgPct: 8, roiPct: 10, betCount: 50 });
    expect(lower).not.toBeNull();
    expect(higher).not.toBeNull();
    expect(higher as number).toBeGreaterThan(lower as number);
  });
});
