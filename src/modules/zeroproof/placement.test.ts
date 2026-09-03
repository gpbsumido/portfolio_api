import { describe, test, expect } from 'vitest';
import { canAfford, isBettable, isStale, selectLine } from './placement.js';

describe('bet placement rules', () => {
  test('selectLine copies the price and handicap for the chosen outcome', () => {
    const outcomes = [
      { name: 'New York Yankees', priceAmerican: -145 },
      { name: 'Boston Red Sox', priceAmerican: 122 },
    ];
    expect(selectLine(outcomes, 'Boston Red Sox')).toEqual({ priceAmerican: 122, lineValue: null });

    const spread = [
      { name: 'Kansas City Chiefs', priceAmerican: -110, point: 2.5 },
      { name: 'Buffalo Bills', priceAmerican: -110, point: -2.5 },
    ];
    expect(selectLine(spread, 'Buffalo Bills')).toEqual({ priceAmerican: -110, lineValue: -2.5 });
  });

  test('selectLine rejects a selection the market does not offer', () => {
    expect(() => selectLine([{ name: 'Draw', priceAmerican: 230 }], 'Arsenal')).toThrow();
  });

  test('isStale gates on the 60-minute snapshot age', () => {
    const now = new Date('2026-09-02T20:00:00Z');
    expect(isStale(new Date('2026-09-02T19:30:00Z'), now)).toBe(false); // 30 min
    expect(isStale(new Date('2026-09-02T18:30:00Z'), now)).toBe(true); // 90 min
  });

  test('isBettable is false once a wallet is busted or past its lock end', () => {
    const now = new Date('2026-09-02T20:00:00Z');
    const lockEnd = new Date('2026-12-02T00:00:00Z');
    expect(isBettable({ status: 'active', lockEnd }, now)).toBe(true);
    expect(isBettable({ status: 'busted', lockEnd }, now)).toBe(false);
    expect(isBettable({ status: 'active', lockEnd: new Date('2026-08-01T00:00:00Z') }, now)).toBe(false);
  });

  test('canAfford holds the available-balance floor', () => {
    expect(canAfford(5000, 5000)).toBe(true);
    expect(canAfford(5000, 5001)).toBe(false);
  });
});
