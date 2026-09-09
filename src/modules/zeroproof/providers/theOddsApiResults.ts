// ---------------------------------------------------------------------------
// The Odds API (v4) /scores — the primary results provider
// ---------------------------------------------------------------------------
//
// /scores is quota-free and uses the same event ids as /odds, so results map to
// our events by provider_key with no fuzzy matching. (ESPN's scoreboard is a
// later fallback and lives behind the same interface, matched by team + time.)

import type { NormalizedResult, ResultsProvider } from './types.js';
import type { IngestOutcome } from './theOddsApi.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('the-odds-api-results');

const BASE = 'https://api.the-odds-api.com/v4';

interface V4Score {
  name: string;
  score: string;
}
interface V4ScoreEvent {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: V4Score[] | null;
}

export class TheOddsApiResultsProvider implements ResultsProvider {
  readonly name = 'the-odds-api';

  constructor(
    private readonly apiKey: string,
    private readonly daysFrom = 1,
    private readonly onOutcome?: (outcome: IngestOutcome) => void,
  ) {
    if (!apiKey) throw new Error('TheOddsApiResultsProvider requires an API key');
  }

  async getResults(sportKeys: string[]): Promise<NormalizedResult[]> {
    const all: NormalizedResult[] = [];
    for (const sportKey of sportKeys) {
      // One sport's fetch failing (a quota blip, a transient 5xx) must not sink
      // the whole settle — skip it, log it, and let the reachable sports grade.
      // The settle is idempotent, so the skipped sport is picked up next run.
      try {
        const url = `${BASE}/sports/${sportKey}/scores?apiKey=${this.apiKey}&daysFrom=${this.daysFrom}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`The Odds API scores returned ${res.status} for ${sportKey}`);
        }
        const events = (await res.json()) as V4ScoreEvent[];
        for (const event of events) {
          const normalized = normalize(event);
          if (normalized) all.push(normalized);
        }
        this.onOutcome?.({ key: sportKey, error: null });
      } catch (err) {
        log.warn({ err, sport: sportKey }, 'skipping sport whose scores failed to fetch');
        this.onOutcome?.({ key: sportKey, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return all;
  }
}

/** Drop events with no usable score payload rather than invent zeros. */
function normalize(event: V4ScoreEvent): NormalizedResult | null {
  const scoreFor = (team: string) => event.scores?.find((s) => s.name === team)?.score;
  const home = scoreFor(event.home_team);
  const away = scoreFor(event.away_team);
  if (home == null || away == null) return null;
  return {
    providerKey: event.id,
    completed: event.completed,
    home: event.home_team,
    away: event.away_team,
    homeScore: Number(home),
    awayScore: Number(away),
  };
}
