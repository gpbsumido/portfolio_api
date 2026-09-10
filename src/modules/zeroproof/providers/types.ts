// ---------------------------------------------------------------------------
// ZeroProof odds providers — the vendor-agnostic shape
// ---------------------------------------------------------------------------
//
// Every provider normalizes its vendor to this shape, so the odds vendor is
// swappable and user traffic never depends on any one API being up. Prices are
// American ints, stored as-is (a decimal toggle is display-only, later).

export type MarketKey = 'h2h' | 'spread' | 'total';

export interface NormalizedOutcome {
  name: string;
  priceAmerican: number;
  /** The handicap for spread/total markets; absent for h2h. */
  point?: number;
}

export interface NormalizedMarket {
  market: MarketKey;
  outcomes: NormalizedOutcome[];
}

export interface NormalizedEvent {
  /** The vendor's event id, mapped to our uuid so a provider swap keeps history. */
  providerKey: string;
  sport: string;
  home: string;
  away: string;
  commenceTime: Date;
  markets: NormalizedMarket[];
  /**
   * The game is already under way, so it should no longer take bets. Set by
   * providers that can tell — ESPN fantasy flips it on once a matchup has points.
   * Absent means the fixture's `commenceTime` is the authoritative start signal.
   */
  started?: boolean;
}

export interface OddsProvider {
  readonly name: string;
  getOdds(sportKeys: string[]): Promise<NormalizedEvent[]>;
}

export interface NormalizedResult {
  /** The vendor's event id — the same id space as the odds, so it maps to our event. */
  providerKey: string;
  completed: boolean;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

export interface ResultsProvider {
  readonly name: string;
  getResults(sportKeys: string[]): Promise<NormalizedResult[]>;
}
