// ---------------------------------------------------------------------------
// ESPN fantasy matchups — the results provider
// ---------------------------------------------------------------------------
//
// Reads the same league feed as the odds provider and emits every completed
// matchup as a result the settler grades. The provider_key and team names are
// produced by the shared helpers, so they line up exactly with what the odds
// side wrote — settlement matches on both.

import type { NormalizedResult, ResultsProvider } from './types.js';
import { type EspnCookies, fetchEspnLeague, normalizeResults, parseLeagueSpec } from './espnFantasy.js';

export class EspnFantasyResultsProvider implements ResultsProvider {
  readonly name = 'espn-fantasy';

  constructor(private readonly cookies: EspnCookies = {}) {}

  async getResults(sportKeys: string[]): Promise<NormalizedResult[]> {
    const all: NormalizedResult[] = [];
    for (const sportKey of sportKeys) {
      const spec = parseLeagueSpec(sportKey);
      const league = await fetchEspnLeague(spec, this.cookies);
      all.push(...normalizeResults(league, spec));
    }
    return all;
  }
}
