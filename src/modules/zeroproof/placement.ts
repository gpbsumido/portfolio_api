// ---------------------------------------------------------------------------
// ZeroProof bet placement — pure rules
// ---------------------------------------------------------------------------

import { ValidationError } from '../../shared/errors/index.js';
import type { NormalizedOutcome } from './providers/types.js';

/**
 * A line older than this is too stale to bet — nobody bets a dead price. The
 * window has to clear the odds-sync cadence, or the newest snapshot we hold is
 * already "stale" for most of every gap and every bet 409s. The sync runs on a
 * platform cron (hours apart, to stay inside the vendor's credit budget), so the
 * default is deliberately generous; a deployment tightens it with
 * ZEROPROOF_MAX_ODDS_AGE_MINUTES once it syncs more often. Dollars are simulated,
 * so a somewhat older line costs nothing real — an un-bettable board does.
 */
export const DEFAULT_MAX_ODDS_AGE_MS = 12 * 60 * 60 * 1000;

export function isStale(fetchedAt: Date, now: Date, maxAgeMs = DEFAULT_MAX_ODDS_AGE_MS): boolean {
  return now.getTime() - fetchedAt.getTime() > maxAgeMs;
}

/**
 * Read the freshness window from a minutes budget (the raw env value). A missing,
 * empty, non-numeric, or non-positive value is treated as unset and falls back to
 * the default rather than silently gating every bet.
 */
export function maxOddsAgeMsFromMinutes(raw: string | undefined): number {
  const minutes = Number(raw);
  if (!raw || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_MAX_ODDS_AGE_MS;
  }
  return minutes * 60 * 1000;
}

export interface SelectedLine {
  priceAmerican: number;
  /** The handicap for spread/total; null for h2h. */
  lineValue: number | null;
}

/**
 * Copy the price (and handicap, if any) for the chosen outcome from a snapshot.
 * A selection the market doesn't offer is a client error, not a silent miss.
 */
export function selectLine(outcomes: NormalizedOutcome[], selection: string): SelectedLine {
  const outcome = outcomes.find((o) => o.name === selection);
  if (!outcome) {
    throw new ValidationError(`Selection "${selection}" is not offered on this market`);
  }
  return { priceAmerican: outcome.priceAmerican, lineValue: outcome.point ?? null };
}

/** A wallet takes bets only while it's active and inside its lock window. */
export function isBettable(wallet: { status: string; lockEnd: Date }, now: Date): boolean {
  return wallet.status === 'active' && now < wallet.lockEnd;
}

/**
 * An event takes bets only before its game is under way. The rule is uniform
 * across sports: it must still be 'upcoming' and its start time must be in the
 * future. Real fixtures carry a real `commenceTime`, so that check closes them.
 * ESPN fantasy matchups carry a synthetic commence time that always sits in the
 * future, so the sync flips their status to 'started' the moment points are
 * scored — and that's what closes them here.
 */
export function isEventBettable(event: { status: string; commenceTime: Date }, now: Date): boolean {
  return event.status === 'upcoming' && now < event.commenceTime;
}

/** The available-balance floor: a stake can't exceed what the wallet can cover. */
export function canAfford(availableCents: number, stakeCents: number): boolean {
  return stakeCents <= availableCents;
}
