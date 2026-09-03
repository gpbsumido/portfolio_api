import { describe, test, expect, vi } from 'vitest';
import { fixturesProvider } from './fixtures.js';

// The fixtures provider is the dev/test/seed source: it replays a captured
// slate so the lobby renders and settlement runs with zero vendor credits.
describe('fixtures odds provider', () => {
  test('serves a slate for the requested sport without any network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const events = await fixturesProvider.getOdds(['baseball_mlb']);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events.length).toBeGreaterThan(0);
    const evt = events[0];
    expect(evt.sport).toBe('baseball_mlb');
    expect(evt.providerKey).toBeTruthy();
    const h2h = evt.markets.find((m) => m.market === 'h2h');
    expect(h2h?.outcomes).toHaveLength(2);
    expect(typeof h2h?.outcomes[0].priceAmerican).toBe('number');

    fetchSpy.mockRestore();
  });

  test('filters the slate to the requested sports', async () => {
    const events = await fixturesProvider.getOdds(['soccer_epl']);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.sport === 'soccer_epl')).toBe(true);
  });
});
