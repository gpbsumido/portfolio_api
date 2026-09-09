import { describe, test, expect, vi, afterEach } from 'vitest';
import { TheOddsApiProvider } from './theOddsApi.js';

const V4_PAYLOAD = [
  {
    id: 'evt-1',
    sport_key: 'baseball_mlb',
    commence_time: '2026-09-02T23:05:00Z',
    home_team: 'Boston Red Sox',
    away_team: 'New York Yankees',
    bookmakers: [
      {
        key: 'draftkings',
        markets: [
          { key: 'h2h', outcomes: [{ name: 'New York Yankees', price: -145 }, { name: 'Boston Red Sox', price: 122 }] },
          {
            key: 'spreads',
            outcomes: [
              { name: 'New York Yankees', price: -110, point: -1.5 },
              { name: 'Boston Red Sox', price: -110, point: 1.5 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -105, point: 8.5 },
              { name: 'Under', price: -115, point: 8.5 },
            ],
          },
        ],
      },
    ],
  },
];

describe('The Odds API provider', () => {
  afterEach(() => vi.restoreAllMocks());

  test('maps a v4 odds payload into normalized events with american prices', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(V4_PAYLOAD), { status: 200 }),
    );

    const provider = new TheOddsApiProvider('test-key');
    const events = await provider.getOdds(['baseball_mlb']);

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt.providerKey).toBe('evt-1');
    expect(evt.home).toBe('Boston Red Sox');
    expect(evt.away).toBe('New York Yankees');
    expect(evt.markets.map((m) => m.market).sort()).toEqual(['h2h', 'spread', 'total']);
    const spread = evt.markets.find((m) => m.market === 'spread');
    expect(spread?.outcomes[0].point).toBe(-1.5);
    const h2h = evt.markets.find((m) => m.market === 'h2h');
    expect(h2h?.outcomes.find((o) => o.name === 'New York Yankees')?.priceAmerican).toBe(-145);
  });

  test('refuses to construct without an API key rather than silently no-op', () => {
    expect(() => new TheOddsApiProvider('')).toThrow();
  });

  test('a sport whose fetch fails is skipped, not thrown (sync survives)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('quota', { status: 429 }));
    const provider = new TheOddsApiProvider('test-key');
    // A quota/transient error on one sport must not sink the whole odds sync.
    await expect(provider.getOdds(['baseball_mlb'])).resolves.toEqual([]);
  });

  test('one bad sport does not drop the others', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(V4_PAYLOAD), { status: 200 }))
      .mockResolvedValueOnce(new Response('quota', { status: 429 }));
    const events = await new TheOddsApiProvider('test-key').getOdds([
      'baseball_mlb',
      'basketball_nba',
    ]);
    // The reachable sport still produces events; the failing one is skipped.
    expect(events.length).toBeGreaterThan(0);
  });

  test('reports each sport outcome to onOutcome — null when ok, the error when not', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(V4_PAYLOAD), { status: 200 }))
      .mockResolvedValueOnce(new Response('quota', { status: 429 }));
    const outcomes: { key: string; error: string | null }[] = [];
    await new TheOddsApiProvider('test-key', 'us', (o) => outcomes.push(o)).getOdds([
      'baseball_mlb',
      'basketball_nba',
    ]);
    expect(outcomes).toEqual([
      { key: 'baseball_mlb', error: null },
      { key: 'basketball_nba', error: expect.stringContaining('429') },
    ]);
  });
});
