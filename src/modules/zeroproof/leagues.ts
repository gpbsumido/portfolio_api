// ---------------------------------------------------------------------------
// ZeroProof leagues — pure rules
// ---------------------------------------------------------------------------
//
// A league is a scope over the machinery that already exists: members bet from
// a league-scoped wallet, and their standing is their wallet's bankroll ranked
// against the other members. Nothing here touches the ledger or the DB — just
// the rules for what a valid league is, who may join, and how a board ranks.

import { ValidationError } from '../../shared/errors/index.js';

export type LeagueVisibility = 'public' | 'invite';
export type LeagueWinCondition = 'threshold' | 'timeline';
export type LeagueStatus = 'open' | 'settled';

/** A starting bankroll has to be worth betting; a target below it is unwinnable. */
export const MIN_STARTING_BANKROLL_CENTS = 100;
/** Two players is the smallest contest; the cap keeps a single scan cheap. */
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS_CAP = 100;

/**
 * Threshold leagues have no deadline — they run until someone crosses the target
 * — so their wallet stays bettable indefinitely. Betting stops when the league
 * settles and its wallets are archived, not when a clock runs out.
 */
export const LEAGUE_NO_DEADLINE = new Date('9999-12-31T00:00:00Z');

/**
 * The betting window for a member's league wallet. A timeline league closes at
 * its deadline; a threshold league runs open-ended until it settles. Reusing the
 * wallet's lock_end means the existing `isBettable` gate needs no special case.
 */
export function leagueWalletLockEnd(winCondition: LeagueWinCondition, endsAt: Date | null): Date {
  if (winCondition === 'timeline') {
    if (!endsAt) throw new ValidationError('A timeline league needs an end date');
    return endsAt;
  }
  return LEAGUE_NO_DEADLINE;
}

/** A league takes new members only while it's open and under its size cap. */
export function isJoinable(status: string, memberCount: number, maxMembers: number): boolean {
  return status === 'open' && memberCount < maxMembers;
}

export interface LeagueRules {
  startingBankrollCents: number;
  maxMembers: number;
  winCondition: LeagueWinCondition;
  thresholdCents: number | null;
  endsAt: Date | null;
}

/**
 * The cross-field rules a create request must satisfy, checked where every field
 * is known. The request schema guarantees the shapes; this guarantees they make
 * a coherent contest.
 */
export function validateLeagueRules(rules: LeagueRules, now: Date): void {
  if (rules.startingBankrollCents < MIN_STARTING_BANKROLL_CENTS) {
    throw new ValidationError('A starting bankroll is $1 minimum');
  }
  if (rules.maxMembers < MIN_MEMBERS || rules.maxMembers > MAX_MEMBERS_CAP) {
    throw new ValidationError(
      `A league holds between ${MIN_MEMBERS} and ${MAX_MEMBERS_CAP} members`,
    );
  }
  if (rules.winCondition === 'threshold') {
    if (rules.thresholdCents == null || rules.thresholdCents <= rules.startingBankrollCents) {
      throw new ValidationError('A target has to be above the starting bankroll');
    }
  }
  if (rules.winCondition === 'timeline') {
    if (!rules.endsAt || rules.endsAt <= now) {
      throw new ValidationError('An end date has to be in the future');
    }
  }
}

export interface StandingInput {
  userSub: string;
  balanceCents: number;
  wins: number;
  losses: number;
  pushes: number;
  betCount: number;
  roiPct: number;
}

export interface Standing extends StandingInput {
  rank: number;
}

/**
 * Rank members for the board. Balance is the contest metric ("how much money to
 * win"), so it ranks first; ROI breaks ties. Ranks are 1-based and dense — a tie
 * on both still gets distinct positions, in a stable order.
 */
export function rankStandings(entries: readonly StandingInput[]): Standing[] {
  return [...entries]
    .sort((a, b) => b.balanceCents - a.balanceCents || b.roiPct - a.roiPct)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
