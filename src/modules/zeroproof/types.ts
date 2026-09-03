// ---------------------------------------------------------------------------
// ZeroProof wallets — types and DTOs
// ---------------------------------------------------------------------------

import type { ZeroproofWallet } from '../../config/drizzle/schema.js';
import type { ProfileStats } from './stats.js';

export type WalletMode = 'season' | 'challenge';
export type WalletStatus = 'active' | 'busted' | 'refunded';

/** A wallet row plus its derived bettable balance. */
export type WalletWithBalance = ZeroproofWallet & { balanceCents: number };

/** A market's latest lines for an event, as stored/derived from snapshots. */
export interface MarketLines {
  market: string;
  fetchedAt: Date;
  outcomes: { name: string; priceAmerican: number; point?: number }[];
}

/** An upcoming event with its latest line per market. */
export interface EventWithLines {
  id: string;
  sport: string;
  home: string;
  away: string;
  commenceTime: Date;
  status: string;
  markets: MarketLines[];
}

export interface EventDto {
  id: string;
  sport: string;
  home: string;
  away: string;
  commenceTime: string;
  status: string;
  markets: {
    market: string;
    fetchedAt: string;
    outcomes: { name: string; priceAmerican: number; point?: number }[];
  }[];
}

export interface EarnedAccolade {
  id: string;
  name: string;
  awardedAt: Date;
}

/** What `getProfile` returns: the caller's wallets, stats, and earned accolades. */
export interface ProfileResponse {
  wallets: WalletWithBalance[];
  stats: ProfileStats;
  accolades: EarnedAccolade[];
}

export interface LeaderboardEntry {
  userSub: string;
  wins: number;
  losses: number;
  pushes: number;
  betCount: number;
  roiPct: number;
  sharpScore: number | null;
}

export interface BetDto {
  id: string;
  walletId: string;
  eventId: string;
  market: string;
  selection: string;
  /** Locked at placement. */
  oddsAmerican: number;
  lineValue: number | null;
  /** The moat, filled at settlement. */
  closingOddsAmerican: number | null;
  clv: number | null;
  stakeCents: number;
  status: string;
  placedAt: string;
  settledAt: string | null;
}

export interface WalletDto {
  id: string;
  mode: string;
  /** The locked deposit, refunded in full at lock_end. */
  principalCents: number;
  /** The bettable bankroll, derived from the ledger. */
  balanceCents: number;
  lockStart: string;
  lockEnd: string;
  status: string;
  createdAt: string;
}
