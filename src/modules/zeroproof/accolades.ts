// ---------------------------------------------------------------------------
// ZeroProof accolades — the catalog and the pure "what was earned" logic
// ---------------------------------------------------------------------------

import { americanToDecimal } from './ledger.js';

export interface AccoladeDef {
  id: string;
  name: string;
  criteria: string;
}

/** The seed catalog. Awards reference these ids; the definitions live in code. */
export const ACCOLADES: AccoladeDef[] = [
  { id: 'first_bet', name: 'First Bet', criteria: 'Placed your first bet' },
  { id: 'first_win', name: 'First Win', criteria: 'Won a bet' },
  { id: 'streak_5', name: 'Hot Hand', criteria: 'Five wins in a row' },
  { id: 'challenge_250', name: '$250 Club', criteria: 'Challenge bankroll reached $250' },
  { id: 'challenge_500', name: '$500 Club', criteria: 'Challenge bankroll reached $500' },
  { id: 'challenge_1k', name: 'First $1k', criteria: 'Challenge bankroll reached $1,000' },
  { id: 'challenge_5k', name: '$5k Club', criteria: 'Challenge bankroll reached $5,000' },
  { id: 'challenge_1k_14d', name: '$1k in 14 Days', criteria: 'Reached $1,000 within 14 days' },
];

const ACCOLADE_BY_ID = new Map(ACCOLADES.map((a) => [a.id, a]));

/** The display name for an awarded id, or the id itself if it's unknown. */
export function accoladeName(id: string): string {
  return ACCOLADE_BY_ID.get(id)?.name ?? id;
}

interface CurveBet {
  status: string;
  stakeCents: number;
  oddsAmerican: number;
  settledAt: Date | null;
}

const DAY_MS = 24 * 3600 * 1000;
const ONE_K_CENTS = 100_000;

/**
 * Walk a challenge wallet's bankroll curve for its peak and how long it took to
 * first reach $1,000 — the raw material for the height and speed accolades.
 */
export function challengeMilestone(
  principalCents: number,
  lockStart: Date,
  bets: CurveBet[],
): { peakCents: number; msToFirst1k: number | null } {
  const ordered = [...bets].sort(
    (a, b) => (a.settledAt?.getTime() ?? 0) - (b.settledAt?.getTime() ?? 0),
  );

  let balance = principalCents;
  let peakCents = principalCents;
  let msToFirst1k: number | null = null;

  for (const bet of ordered) {
    if (bet.status === 'won') {
      balance += Math.round(bet.stakeCents * (americanToDecimal(bet.oddsAmerican) - 1));
    } else if (bet.status === 'lost') {
      balance -= bet.stakeCents;
    }
    peakCents = Math.max(peakCents, balance);
    if (msToFirst1k === null && balance >= ONE_K_CENTS && bet.settledAt) {
      msToFirst1k = bet.settledAt.getTime() - lockStart.getTime();
    }
  }

  return { peakCents, msToFirst1k };
}

export interface AccoladeContext {
  hasPlacedBet: boolean;
  wins: number;
  longestWinStreak: number;
  challengeWallets: { peakCents: number; msToFirst1k: number | null }[];
}

/** The accolade ids a user has earned, given their play. Awarding is idempotent elsewhere. */
export function earnedAccolades(ctx: AccoladeContext): string[] {
  const ids = new Set<string>();
  if (ctx.hasPlacedBet) ids.add('first_bet');
  if (ctx.wins > 0) ids.add('first_win');
  if (ctx.longestWinStreak >= 5) ids.add('streak_5');

  for (const wallet of ctx.challengeWallets) {
    if (wallet.peakCents >= 25_000) ids.add('challenge_250');
    if (wallet.peakCents >= 50_000) ids.add('challenge_500');
    if (wallet.peakCents >= ONE_K_CENTS) ids.add('challenge_1k');
    if (wallet.peakCents >= 500_000) ids.add('challenge_5k');
    if (wallet.msToFirst1k != null && wallet.msToFirst1k <= 14 * DAY_MS) {
      ids.add('challenge_1k_14d');
    }
  }

  return [...ids];
}
