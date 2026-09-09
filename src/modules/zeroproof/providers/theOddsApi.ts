// ---------------------------------------------------------------------------
// The Odds API (v4) — the primary odds provider
// ---------------------------------------------------------------------------

import type { MarketKey, NormalizedEvent, NormalizedMarket, OddsProvider } from './types.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('the-odds-api');

const BASE = 'https://api.the-odds-api.com/v4';
const MARKETS_PARAM = 'h2h,spreads,totals';

/** Vendor market keys → ours. Anything not listed is ignored. */
const VENDOR_MARKET: Record<string, MarketKey> = {
  h2h: 'h2h',
  spreads: 'spread',
  totals: 'total',
};

interface V4Outcome {
  name: string;
  price: number;
  point?: number;
}
interface V4Market {
  key: string;
  outcomes: V4Outcome[];
}
interface V4Bookmaker {
  key: string;
  markets: V4Market[];
}
interface V4Event {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: V4Bookmaker[];
}

/** The outcome of trying to fetch one sport: the error, or null if it resolved. */
export type IngestOutcome = { key: string; error: string | null };

export class TheOddsApiProvider implements OddsProvider {
  readonly name = 'the-odds-api';

  constructor(
    private readonly apiKey: string,
    private readonly regions = 'us',
    private readonly onOutcome?: (outcome: IngestOutcome) => void,
  ) {
    // Fail loud at construction rather than degrade to an empty slate later.
    if (!apiKey) throw new Error('TheOddsApiProvider requires an API key');
  }

  async getOdds(sportKeys: string[]): Promise<NormalizedEvent[]> {
    const all: NormalizedEvent[] = [];
    for (const sportKey of sportKeys) {
      // One sport failing (a dead vendor, an exhausted quota, a transient 5xx)
      // must not sink the whole sync — skip it, log it, and let the reachable
      // sports post their lines. Served-from-DB reads keep the last good slate.
      try {
        const url =
          `${BASE}/sports/${sportKey}/odds` +
          `?apiKey=${this.apiKey}&regions=${this.regions}&markets=${MARKETS_PARAM}&oddsFormat=american`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`The Odds API returned ${res.status} for ${sportKey}`);
        }
        const events = (await res.json()) as V4Event[];
        for (const event of events) all.push(normalize(event));
        this.onOutcome?.({ key: sportKey, error: null });
      } catch (err) {
        log.warn({ err, sport: sportKey }, 'skipping sport whose odds failed to fetch');
        this.onOutcome?.({ key: sportKey, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return all;
  }
}

/** Take the first bookmaker that offers each market — one book is enough for the MVP. */
function normalize(event: V4Event): NormalizedEvent {
  const book = event.bookmakers[0];
  const markets: NormalizedMarket[] = [];
  for (const vendorMarket of book?.markets ?? []) {
    const market = VENDOR_MARKET[vendorMarket.key];
    if (!market) continue;
    markets.push({
      market,
      outcomes: vendorMarket.outcomes.map((o) => ({
        name: o.name,
        priceAmerican: o.price,
        ...(o.point != null ? { point: o.point } : {}),
      })),
    });
  }
  return {
    providerKey: event.id,
    sport: event.sport_key,
    home: event.home_team,
    away: event.away_team,
    commenceTime: new Date(event.commence_time),
    markets,
  };
}
