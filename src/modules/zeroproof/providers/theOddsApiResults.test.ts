import { describe, test, expect, vi, afterEach } from 'vitest';
import { TheOddsApiResultsProvider } from './theOddsApiResults.js';

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

describe('The Odds API results provider', () => {
  afterEach(() => vi.restoreAllMocks());

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
