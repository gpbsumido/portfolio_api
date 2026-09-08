import { describe, expect, test } from 'vitest';
import {
  isJoinable,
  LEAGUE_NO_DEADLINE,
  leagueWalletLockEnd,
  rankStandings,
  validateLeagueRules,
} from './leagues.js';

describe('league rules', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  const base = {
    startingBankrollCents: 50000,
    maxMembers: 10,
    winCondition: 'threshold' as const,
    thresholdCents: 100000,
    endsAt: null,
  };

  test('leagueWalletLockEnd uses the deadline for timeline, open-ended for threshold', () => {
    const endsAt = new Date('2026-12-01T00:00:00Z');
    expect(leagueWalletLockEnd('timeline', endsAt)).toEqual(endsAt);
    expect(leagueWalletLockEnd('threshold', null)).toEqual(LEAGUE_NO_DEADLINE);
  });

  test('leagueWalletLockEnd rejects a timeline league with no end date', () => {
    expect(() => leagueWalletLockEnd('timeline', null)).toThrow();
  });

  test('isJoinable only while open and under the cap', () => {
    expect(isJoinable('open', 4, 10)).toBe(true);
    expect(isJoinable('open', 10, 10)).toBe(false);
    expect(isJoinable('settled', 4, 10)).toBe(false);
  });

  test('a threshold below the starting bankroll is rejected', () => {
    expect(() => validateLeagueRules({ ...base, thresholdCents: 50000 }, now)).toThrow();
    expect(() => validateLeagueRules({ ...base, thresholdCents: null }, now)).toThrow();
    expect(() => validateLeagueRules(base, now)).not.toThrow();
  });

  test('a timeline end date must be in the future', () => {
    const timeline = { ...base, winCondition: 'timeline' as const, thresholdCents: null };
    expect(() =>
      validateLeagueRules({ ...timeline, endsAt: new Date('2020-01-01T00:00:00Z') }, now),
    ).toThrow();
    expect(() =>
      validateLeagueRules({ ...timeline, endsAt: new Date('2026-12-01T00:00:00Z') }, now),
    ).not.toThrow();
  });

  test('starting bankroll and member bounds are enforced', () => {
    expect(() => validateLeagueRules({ ...base, startingBankrollCents: 50 }, now)).toThrow();
    expect(() => validateLeagueRules({ ...base, maxMembers: 1 }, now)).toThrow();
    expect(() => validateLeagueRules({ ...base, maxMembers: 1000 }, now)).toThrow();
  });

  test('rankStandings orders by balance, breaks ties on ROI, and numbers 1-based', () => {
    const ranked = rankStandings([
      { userSub: 'a', balanceCents: 1200, wins: 2, losses: 1, pushes: 0, betCount: 3, roiPct: 20 },
      { userSub: 'b', balanceCents: 1840, wins: 5, losses: 1, pushes: 0, betCount: 6, roiPct: 84 },
      { userSub: 'c', balanceCents: 1200, wins: 3, losses: 2, pushes: 0, betCount: 5, roiPct: 5 },
    ]);
    expect(ranked.map((r) => [r.userSub, r.rank])).toEqual([
      ['b', 1],
      ['a', 2], // ties c on balance, wins on ROI
      ['c', 3],
    ]);
  });
});
