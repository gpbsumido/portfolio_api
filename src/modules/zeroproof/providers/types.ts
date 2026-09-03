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
}

export interface OddsProvider {
  readonly name: string;
  getOdds(sportKeys: string[]): Promise<NormalizedEvent[]>;
}
