// ---------------------------------------------------------------------------
// Fixtures odds provider — replays a captured slate, zero vendor credits
// ---------------------------------------------------------------------------

import { FIXTURE_SLATE } from './fixturesData.js';
import type { NormalizedEvent, OddsProvider } from './types.js';

export const fixturesProvider: OddsProvider = {
  name: 'fixtures',
  async getOdds(sportKeys: string[]): Promise<NormalizedEvent[]> {
    const wanted = new Set(sportKeys);
    // Copy so a caller can't mutate the shared fixture through the returned events.
    return FIXTURE_SLATE.filter((event) => wanted.has(event.sport)).map((event) => ({
      ...event,
      markets: event.markets.map((m) => ({ ...m, outcomes: m.outcomes.map((o) => ({ ...o })) })),
    }));
  },
};
