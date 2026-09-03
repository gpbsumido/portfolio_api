// ---------------------------------------------------------------------------
// ZeroProof profile stats — pure rollups over settled bets
// ---------------------------------------------------------------------------

import { americanToDecimal } from './ledger.js';

export interface SettledBetLike {
  status: string;
  stakeCents: number;
  oddsAmerican: number;
  clv: number | string | null;
  settledAt: Date | null;
}

export interface ProfileStats {
  wins: number;
  losses: number;
  pushes: number;
  /** Graded win/loss bets — the volume the sharp score is defined over. */
  betCount: number;
  roiPct: number;
  currentStreak: number;
  longestStreak: number;
  biggestHitCents: number;
  clvAvgPct: number | null;
  sharpScore: number | null;
}

/** Below this many graded bets, the sharp score is noise, so it's withheld. */
export const MIN_SHARP_BETS = 10;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeStats(bets: SettledBetLike[]): ProfileStats {
  const ordered = [...bets].sort(
    (a, b) => (a.settledAt?.getTime() ?? 0) - (b.settledAt?.getTime() ?? 0),
  );

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let profitCents = 0;
  let stakedCents = 0;
  let biggestHitCents = 0;
  let clvSum = 0;
  let clvCount = 0;
  let currentStreak = 0;
  let longestStreak = 0;

  for (const bet of ordered) {
    const clv = bet.clv == null ? null : Number(bet.clv);
    if (clv !== null && !Number.isNaN(clv)) {
      clvSum += clv;
      clvCount += 1;
    }

    if (bet.status === 'won') {
      wins += 1;
      stakedCents += bet.stakeCents;
      const hit = Math.round(bet.stakeCents * (americanToDecimal(bet.oddsAmerican) - 1));
      profitCents += hit;
      biggestHitCents = Math.max(biggestHitCents, hit);
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else if (bet.status === 'lost') {
      losses += 1;
      stakedCents += bet.stakeCents;
      profitCents -= bet.stakeCents;
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
    } else if (bet.status === 'push') {
      pushes += 1;
    }
    // 'void' returns the stake and doesn't touch the record.
  }

  const betCount = wins + losses;
  const roiPct = stakedCents > 0 ? round2((profitCents / stakedCents) * 100) : 0;
  const clvAvgPct = clvCount > 0 ? round2(clvSum / clvCount) : null;

  return {
    wins,
    losses,
    pushes,
    betCount,
    roiPct,
    currentStreak,
    longestStreak,
    biggestHitCents,
    clvAvgPct,
    sharpScore: sharpScore({ clvAvgPct: clvAvgPct ?? 0, roiPct, betCount }),
  };
}

/**
 * The sharp score: CLV-weighted, with ROI as a secondary term, defined only past
 * a minimum volume. Monotonic in CLV — beating the close is what it rewards.
 */
export function sharpScore(input: { clvAvgPct: number; roiPct: number; betCount: number }): number | null {
  if (input.betCount < MIN_SHARP_BETS) return null;
  return round2(input.clvAvgPct * 0.6 + input.roiPct * 0.4);
}
