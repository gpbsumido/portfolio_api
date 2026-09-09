// ---------------------------------------------------------------------------
// ZeroProof wallets — types and DTOs
// ---------------------------------------------------------------------------

import type {
  ZeroproofLeague,
  ZeroproofLeagueEspnLeague,
  ZeroproofWallet,
} from '../../config/drizzle/schema.js';
import type { ProfileStats } from './stats.js';

export type WalletMode = 'season' | 'challenge' | 'league';
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

/** A member's place on a league board, ranked by bankroll. */
export interface LeagueStanding {
  userSub: string;
  balanceCents: number;
  wins: number;
  losses: number;
  pushes: number;
  betCount: number;
  roiPct: number;
  rank: number;
}

/** A league row plus its current member count — the shape lists and detail share. */
export interface LeagueListItem {
  league: ZeroproofLeague;
  memberCount: number;
}

/** A commissioner-added ESPN league row plus its last resolution health. */
export type LeagueEspnLeagueRow = ZeroproofLeagueEspnLeague & {
  lastCheckedAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
};

/** A league in full: rules, standings, and the caller's relationship to it. */
export interface LeagueDetail {
  league: ZeroproofLeague;
  memberCount: number;
  standings: LeagueStanding[];
  /** ESPN leagues the commissioner added for members to bet (additive), with health. */
  espnLeagues: LeagueEspnLeagueRow[];
  /** The caller's league wallet id, for the betslip — null if they haven't joined. */
  callerWalletId: string | null;
  isMember: boolean;
  isCommissioner: boolean;
}

/** An ESPN league added to a ZeroProof league, as the API returns it. */
export interface LeagueEspnLeagueDto {
  id: string;
  game: string;
  leagueId: string;
  season: string;
  label: string | null;
  createdAt: string;
  /** When the sync cron last tried to resolve it — null if never synced yet. */
  lastCheckedAt: string | null;
  /** When it last resolved successfully — null if it has never resolved. */
  lastOkAt: string | null;
  /** The most recent resolution error, or null when it's currently reachable. */
  lastError: string | null;
}

export interface LeagueStandingDto {
  userSub: string;
  balanceCents: number;
  wins: number;
  losses: number;
  pushes: number;
  betCount: number;
  roiPct: number;
  rank: number;
}

export interface LeagueDto {
  id: string;
  commissionerSub: string;
  name: string;
  /** Present only when the caller may share it (a member or the commissioner). */
  joinCode: string | null;
  visibility: string;
  startingBankrollCents: number;
  maxMembers: number;
  winCondition: string;
  thresholdCents: number | null;
  endsAt: string | null;
  status: string;
  winnerSub: string | null;
  /** The bound ESPN league, or null — when set, members only bet its matchups. */
  espnGame: string | null;
  espnLeagueId: string | null;
  espnSeason: string | null;
  createdAt: string;
  settledAt: string | null;
  memberCount: number;
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
