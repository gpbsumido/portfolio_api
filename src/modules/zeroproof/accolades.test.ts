import { describe, test, expect } from 'vitest';
import { ACCOLADES, challengeMilestone, earnedAccolades } from './accolades.js';

const won = (stakeCents: number, at: string) => ({
  status: 'won',
  stakeCents,
  oddsAmerican: 100, // even money → profit = stake
  settledAt: new Date(at),
});

describe('challenge milestone from the bankroll curve', () => {
  test('finds the peak and the time to first $1k', () => {
    // Challenge starts at $100. Three even-money wins of $150, $200, $600.
    // Running: 100 → 250 → 450 → 1050. Peak 1050; crosses 1000 on the third bet.
    const lockStart = new Date('2026-09-01T00:00:00Z');
    const m = challengeMilestone(10000, lockStart, [
      won(15000, '2026-09-05T00:00:00Z'),
      won(20000, '2026-09-10T00:00:00Z'),
      won(60000, '2026-09-14T00:00:00Z'), // day 13
    ]);

    expect(m.peakCents).toBe(105000);
    // 13 days in ms
    expect(m.msToFirst1k).toBe(13 * 24 * 3600 * 1000);
  });

  test('leaves time-to-$1k null when the wallet never reaches it', () => {
    const m = challengeMilestone(10000, new Date('2026-09-01T00:00:00Z'), [
      won(5000, '2026-09-05T00:00:00Z'),
    ]);
    expect(m.peakCents).toBe(15000);
    expect(m.msToFirst1k).toBeNull();
  });
});

describe('which accolades are earned', () => {
  test('crossing $1k on day 13 earns first-1k and the under-14-days speed badge', () => {
    const ids = earnedAccolades({
      hasPlacedBet: true,
      wins: 3,
      longestWinStreak: 3,
      challengeWallets: [{ peakCents: 105000, msToFirst1k: 13 * 24 * 3600 * 1000 }],
    });

    expect(ids).toContain('challenge_1k');
    expect(ids).toContain('challenge_1k_14d');
    expect(ids).toContain('challenge_250');
    expect(ids).toContain('challenge_500');
    expect(ids).not.toContain('challenge_5k');
  });

  test('a slow $1k earns the milestone but not the speed badge', () => {
    const ids = earnedAccolades({
      hasPlacedBet: true,
      wins: 1,
      longestWinStreak: 1,
      challengeWallets: [{ peakCents: 100000, msToFirst1k: 30 * 24 * 3600 * 1000 }],
    });
    expect(ids).toContain('challenge_1k');
    expect(ids).not.toContain('challenge_1k_14d');
  });

  test('a five-win streak earns the hot-hand badge', () => {
    expect(earnedAccolades({ hasPlacedBet: true, wins: 5, longestWinStreak: 5, challengeWallets: [] })).toContain('streak_5');
    expect(earnedAccolades({ hasPlacedBet: true, wins: 5, longestWinStreak: 4, challengeWallets: [] })).not.toContain('streak_5');
  });

  test('every earned id is a real accolade in the catalog', () => {
    const catalogIds = new Set(ACCOLADES.map((a) => a.id));
    const ids = earnedAccolades({
      hasPlacedBet: true,
      wins: 5,
      longestWinStreak: 5,
      challengeWallets: [{ peakCents: 600000, msToFirst1k: 1000 }],
    });
    expect(ids.every((id) => catalogIds.has(id))).toBe(true);
  });
});
