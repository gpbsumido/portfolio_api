import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  cookieHeader,
  currentBettableWeek,
  EspnFantasyProvider,
  type EspnLeague,
  matchupProviderKey,
  normalizeMatchups,
  normalizeResults,
  parseLeagueSpec,
  PICK_EM_PRICE_AMERICAN,
  priceFromWinProbability,
  teamName,
} from './espnFantasy.js';
import { EspnFantasyResultsProvider } from './espnFantasyResults.js';

const SPEC = { game: 'ffl', leagueId: '1241838', season: '2022' };
const NOW = new Date('2026-09-08T00:00:00.000Z');

const LEAGUE: EspnLeague = {
  scoringPeriodId: 2,
  seasonId: 2022,
  teams: [
    { id: 1, name: 'Team Binish', abbrev: 'BINI' },
    { id: 2, location: 'Los Angeles', nickname: 'Angels', abbrev: 'LAA' },
    { id: 3, name: '   ', abbrev: 'RAW' }, // blank name falls back to abbrev
    { id: 4, abbrev: '' }, // nothing usable falls back to "Team 4"
  ],
  schedule: [
    { id: 1, matchupPeriodId: 1, winner: 'HOME', home: { teamId: 1, totalPoints: 125.0 }, away: { teamId: 2, totalPoints: 86.1 } },
    { id: 2, matchupPeriodId: 2, winner: 'UNDECIDED', home: { teamId: 1, totalPoints: 0, winProbability: 0.6 }, away: { teamId: 3, totalPoints: 0, winProbability: 0.4 } },
    { id: 3, matchupPeriodId: 2, winner: 'UNDECIDED', home: { teamId: 2, totalPoints: 0 }, away: { teamId: 4, totalPoints: 0 } },
    { id: 4, matchupPeriodId: 3, winner: 'UNDECIDED', home: { teamId: 1, totalPoints: 0 }, away: { teamId: 4, totalPoints: 0 } },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('ESPN fantasy — pure normalization', () => {
  test('parseLeagueSpec splits a key and rejects a malformed one', () => {
    expect(parseLeagueSpec('ffl:1241838:2022')).toEqual(SPEC);
    expect(() => parseLeagueSpec('ffl:1241838')).toThrow();
  });

  test('teamName resolves a name, composes location+nickname, and falls back', () => {
    expect(teamName(LEAGUE.teams, 1)).toBe('Team Binish');
    expect(teamName(LEAGUE.teams, 2)).toBe('Los Angeles Angels');
    expect(teamName(LEAGUE.teams, 3)).toBe('RAW');
    expect(teamName(LEAGUE.teams, 4)).toBe('Team 4');
    expect(teamName(LEAGUE.teams, 99)).toBe('Team 99');
  });

  test('currentBettableWeek is the earliest week with an undecided matchup', () => {
    expect(currentBettableWeek(LEAGUE)).toBe(2);
    expect(currentBettableWeek({ ...LEAGUE, schedule: LEAGUE.schedule.slice(0, 1) })).toBeNull();
  });

  test('priceFromWinProbability gives fair odds, and pick’em when it’s missing', () => {
    expect(priceFromWinProbability(0.6)).toBe(-150); // favourite
    expect(priceFromWinProbability(0.4)).toBe(150); // underdog
    expect(priceFromWinProbability(0.5)).toBe(-100); // even
    expect(priceFromWinProbability(undefined)).toBe(PICK_EM_PRICE_AMERICAN);
    expect(priceFromWinProbability(0)).toBe(PICK_EM_PRICE_AMERICAN);
    expect(priceFromWinProbability(1)).toBe(PICK_EM_PRICE_AMERICAN);
    expect(priceFromWinProbability(0.999)).toBe(priceFromWinProbability(0.95)); // clamped
  });

  test('normalizeMatchups prices each side off ESPN’s win probability, pick’em as fallback', () => {
    const events = normalizeMatchups(LEAGUE, SPEC, NOW);
    expect(events).toHaveLength(2);
    const first = events[0];
    expect(first.providerKey).toBe('espn:ffl:2022:1241838:2:1-3');
    expect(first.sport).toBe('fantasy_ffl');
    expect(first.home).toBe('Team Binish');
    expect(first.away).toBe('RAW');
    expect(first.commenceTime.getTime()).toBe(NOW.getTime() + 48 * 60 * 60 * 1000);
    // matchup 2 has a 0.6/0.4 win probability → -150 / +150
    expect(first.markets).toEqual([
      {
        market: 'h2h',
        outcomes: [
          { name: 'Team Binish', priceAmerican: -150 },
          { name: 'RAW', priceAmerican: 150 },
        ],
      },
    ]);
    // matchup 3 has no win probability → pick'em on both sides
    expect(events[1].markets[0].outcomes.map((o) => o.priceAmerican)).toEqual([
      PICK_EM_PRICE_AMERICAN,
      PICK_EM_PRICE_AMERICAN,
    ]);
  });

  test('normalizeResults yields completed matchups with scores and matching keys', () => {
    const results = normalizeResults(LEAGUE, SPEC);
    expect(results).toEqual([
      {
        providerKey: 'espn:ffl:2022:1241838:1:1-2',
        completed: true,
        home: 'Team Binish',
        away: 'Los Angeles Angels',
        homeScore: 125.0,
        awayScore: 86.1,
      },
    ]);
    // the results key matches what the odds side would have written for that matchup
    expect(results[0].providerKey).toBe(matchupProviderKey(SPEC, LEAGUE.schedule[0]));
  });

  test('cookieHeader builds a header for a private league, undefined when public', () => {
    expect(cookieHeader({ swid: '{abc}', espnS2: 'xyz' })).toBe('SWID={abc}; espn_s2=xyz');
    expect(cookieHeader({})).toBeUndefined();
  });
});

describe('ESPN fantasy — providers over a mocked fetch', () => {
  test('the odds provider fetches each league and normalizes its current week', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => LEAGUE } as Response),
    );
    const events = await new EspnFantasyProvider().getOdds(['ffl:1241838:2022']);
    expect(events).toHaveLength(2);
    expect(events[0].sport).toBe('fantasy_ffl');
  });

  test('the results provider emits completed matchups', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => LEAGUE } as Response),
    );
    const results = await new EspnFantasyResultsProvider().getResults(['ffl:1241838:2022']);
    expect(results).toHaveLength(1);
    expect(results[0].completed).toBe(true);
  });

  test('a league that fails to fetch is skipped, not thrown (cron survives)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response));
    // A private/misconfigured league returning non-2xx must not sink the run.
    await expect(
      new EspnFantasyProvider().getOdds(['ffl:1241838:2022']),
    ).resolves.toEqual([]);
  });

  test('one bad league does not sink the others', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => LEAGUE } as Response)
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response),
    );
    const results = await new EspnFantasyResultsProvider().getResults([
      'ffl:1241838:2022',
      'fba:999999:2027',
    ]);
    // The good league still settles; the failing one is skipped.
    expect(results).toHaveLength(1);
    expect(results[0].completed).toBe(true);
  });

  test('the private-league cookies reach the request as a Cookie header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => LEAGUE } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await new EspnFantasyProvider({ swid: '{abc}', espnS2: 'xyz' }).getOdds(['ffl:1241838:2022']);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Cookie: 'SWID={abc}; espn_s2=xyz' } });
  });

  test('reports each league resolution to onOutcome — null when ok, the error when not', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => LEAGUE } as Response)
        .mockResolvedValueOnce({ ok: false, status: 401 } as Response),
    );
    const outcomes: { key: string; error: string | null }[] = [];
    await new EspnFantasyProvider({}, (o) => outcomes.push(o)).getOdds([
      'ffl:1241838:2022',
      'fba:999999:2027',
    ]);
    expect(outcomes).toEqual([
      { key: 'ffl:1241838:2022', error: null },
      { key: 'fba:999999:2027', error: expect.stringContaining('401') },
    ]);
  });
});
