// ---------------------------------------------------------------------------
// Fixtures results provider — canned finals for the captured slate
// ---------------------------------------------------------------------------
//
// Pairs with the fixtures odds provider so a seeded slate settles end to end
// with zero vendor credits. Keyed by the same provider_key the odds carry.

import type { NormalizedResult, ResultsProvider } from './types.js';

const FIXTURE_RESULTS: NormalizedResult[] = [
  { providerKey: 'fx-mlb-nyy-bos', completed: true, home: 'Boston Red Sox', away: 'New York Yankees', homeScore: 3, awayScore: 5 },
  { providerKey: 'fx-mlb-lad-sd', completed: true, home: 'San Diego Padres', away: 'Los Angeles Dodgers', homeScore: 2, awayScore: 6 },
  { providerKey: 'fx-epl-ars-che', completed: true, home: 'Arsenal', away: 'Chelsea', homeScore: 2, awayScore: 1 },
  { providerKey: 'fx-nfl-kc-buf', completed: true, home: 'Buffalo Bills', away: 'Kansas City Chiefs', homeScore: 24, awayScore: 27 },
];

export const fixturesResultsProvider: ResultsProvider = {
  name: 'fixtures',
  async getResults(): Promise<NormalizedResult[]> {
    return FIXTURE_RESULTS.map((r) => ({ ...r }));
  },
};
