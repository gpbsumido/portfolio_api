// ---------------------------------------------------------------------------
// ZeroProof settlement — pure grading and closing-line value
// ---------------------------------------------------------------------------

import { americanToDecimal } from './ledger.js';
import type { NormalizedOutcome, NormalizedResult } from './providers/types.js';

export type Grade = 'won' | 'lost' | 'push' | 'void';

interface GradableBet {
  market: string;
  selection: string;
  /** The handicap/line for spread and total; null for h2h. */
  lineValue: number | null;
}

function scoreForTeam(result: NormalizedResult, team: string): number | null {
  if (team === result.home) return result.homeScore;
  if (team === result.away) return result.awayScore;
  return null;
}

/**
 * Grade a bet against a final result. Handicap applied for spreads, combined
 * score for totals, exact covers are pushes; an incomplete event voids. A tie
 * on a two-way h2h is a push (a soccer Draw is its own selection, handled here).
 */
export function gradeBet(bet: GradableBet, result: NormalizedResult): Grade {
  if (!result.completed) return 'void';

  if (bet.market === 'total') {
    const total = result.homeScore + result.awayScore;
    const line = bet.lineValue ?? 0;
    if (total === line) return 'push';
    const isOver = total > line;
    return bet.selection.toLowerCase() === 'over' ? (isOver ? 'won' : 'lost') : isOver ? 'lost' : 'won';
  }

  if (bet.selection === 'Draw') {
    return result.homeScore === result.awayScore ? 'won' : 'lost';
  }

  const teamScore = scoreForTeam(result, bet.selection);
  if (teamScore === null) return 'void';
  const oppScore = bet.selection === result.home ? result.awayScore : result.homeScore;
  const handicap = bet.market === 'spread' ? (bet.lineValue ?? 0) : 0;
  const margin = teamScore + handicap - oppScore;
  if (margin > 0) return 'won';
  if (margin < 0) return 'lost';
  return 'push';
}

/**
 * Closing-line value as a percentage: positive when the bet's price paid more
 * than the closing price — the single best public proxy for betting skill.
 */
export function computeClv(betOdds: number, closingOdds: number): number {
  const ratio = americanToDecimal(betOdds) / americanToDecimal(closingOdds);
  return Math.round((ratio - 1) * 10000) / 100;
}

/** The closing price for a bet's selection, off the closing snapshot. */
export function closingOddsFor(
  snapshot: { outcomes: NormalizedOutcome[] },
  selection: string,
): number | null {
  const outcome = snapshot.outcomes.find((o) => o.name === selection);
  return outcome ? outcome.priceAmerican : null;
}
