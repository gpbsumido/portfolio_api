import { describe, test, expect, vi, afterEach } from 'vitest';
import { TheOddsApiResultsProvider, resultsDaysFromEnv } from './theOddsApiResults.js';

const scoreEvents = (homeScore: string, awayScore: string) => [
  {
    id: 'evt-1',
    completed: true,
    home_team: 'Boston Red Sox',
    away_team: 'New York Yankees',
    scores: [
      { name: 'Boston Red Sox', score: homeScore },
      { name: 'New York Yankees', score: awayScore },
    ],
  },
];

describe('resultsDaysFromEnv', () => {
  // The Odds API /scores accepts daysFrom 1-3; default to the max so a game that
  // finished up to 3 days ago still settles. A too-small window is why bets on
  // finished games sat "open" — the result was never fetched.
  test('defaults to 3, clamps to 1-3, and ignores junk', () => {
    expect(resultsDaysFromEnv(undefined)).toBe(3);
    expect(resultsDaysFromEnv('')).toBe(3);
    expect(resultsDaysFromEnv('1')).toBe(1);
    expect(resultsDaysFromEnv('2')).toBe(2);
    expect(resultsDaysFromEnv('3')).toBe(3);
    expect(resultsDaysFromEnv('5')).toBe(3); // over the API max, clamp down
    expect(resultsDaysFromEnv('0')).toBe(1); // under the API min, clamp up
    expect(resultsDaysFromEnv('-2')).toBe(1);
    expect(resultsDaysFromEnv('not-a-number')).toBe(3);
  });
});

describe('The Odds API results provider', () => {
  afterEach(() => vi.restoreAllMocks());

  test('fetches a 3-day window by default so a day-old game still settles', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('[]', { status: 200 }));
    await new TheOddsApiResultsProvider('key').getResults(['baseball_mlb']);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('daysFrom=3');
  });

  test('maps a /scores payload into normalized results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(scoreEvents('5', '3')), { status: 200 }),
    );
    const results = await new TheOddsApiResultsProvider('key').getResults(['baseball_mlb']);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ completed: true, homeScore: 5, awayScore: 3 });
  });

  test('a sport whose scores fail is skipped, not thrown (settle survives)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('quota', { status: 429 }));
    // A quota/transient error on one sport must not sink the whole settle.
    await expect(
      new TheOddsApiResultsProvider('key').getResults(['baseball_mlb']),
    ).resolves.toEqual([]);
  });

  test('one bad sport does not drop the others', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(scoreEvents('5', '3')), { status: 200 }))
      .mockResolvedValueOnce(new Response('quota', { status: 429 }));
    const results = await new TheOddsApiResultsProvider('key').getResults([
      'baseball_mlb',
      'basketball_nba',
    ]);
    // The reachable sport still settles; the failing one is skipped.
    expect(results).toHaveLength(1);
    expect(results[0].homeScore).toBe(5);
  });
});
