import { describe, test, expect } from 'vitest';
import {
  canAfford,
  DEFAULT_MAX_ODDS_AGE_MS,
  isBettable,
  isEventBettable,
  isStale,
  maxOddsAgeMsFromMinutes,
  selectLine,
} from './placement.js';

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

  test('isEventBettable — open while upcoming and before the start time', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    expect(
      isEventBettable({ status: 'upcoming', commenceTime: new Date('2026-09-08T18:00:00Z') }, now),
    ).toBe(true);
  });

  test('isEventBettable — a real fixture locks the moment its start time passes', () => {
    const now = new Date('2026-09-08T18:30:00Z');
    expect(
      isEventBettable({ status: 'upcoming', commenceTime: new Date('2026-09-08T18:00:00Z') }, now),
    ).toBe(false);
  });

  test('isEventBettable — a started ESPN matchup is locked even with a future synthetic commence', () => {
    // Fantasy matchups carry a synthetic commence time that always sits in the
    // future, so the started status is what closes them once points are scored.
    const now = new Date('2026-09-08T12:00:00Z');
    expect(
      isEventBettable({ status: 'started', commenceTime: new Date('2026-09-10T00:00:00Z') }, now),
    ).toBe(false);
  });

  test('isEventBettable — a final event is not bettable', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    expect(
      isEventBettable({ status: 'final', commenceTime: new Date('2026-09-10T00:00:00Z') }, now),
    ).toBe(false);
  });

  test('isStale gates on the freshness window, wide enough for the sync cadence by default', () => {
    const now = new Date('2026-09-02T20:00:00Z');
    // The default window comfortably clears a few-hour sync gap, so a line a
    // few hours old is still bettable.
    expect(isStale(new Date('2026-09-02T17:00:00Z'), now)).toBe(false); // 3 h
    expect(isStale(new Date('2026-09-02T06:00:00Z'), now)).toBe(true); // 14 h
    // An explicit window overrides the default.
    const hour = 60 * 60 * 1000;
    expect(isStale(new Date('2026-09-02T19:30:00Z'), now, hour)).toBe(false); // 30 min
    expect(isStale(new Date('2026-09-02T18:30:00Z'), now, hour)).toBe(true); // 90 min
  });

  test('maxOddsAgeMsFromMinutes reads a minutes budget, falling back to the default when unset or junk', () => {
    expect(maxOddsAgeMsFromMinutes('30')).toBe(30 * 60 * 1000);
    expect(maxOddsAgeMsFromMinutes('720')).toBe(DEFAULT_MAX_ODDS_AGE_MS);
    expect(maxOddsAgeMsFromMinutes(undefined)).toBe(DEFAULT_MAX_ODDS_AGE_MS);
    expect(maxOddsAgeMsFromMinutes('')).toBe(DEFAULT_MAX_ODDS_AGE_MS);
    expect(maxOddsAgeMsFromMinutes('not-a-number')).toBe(DEFAULT_MAX_ODDS_AGE_MS);
    expect(maxOddsAgeMsFromMinutes('0')).toBe(DEFAULT_MAX_ODDS_AGE_MS); // non-positive is misconfig, ignore it
    expect(maxOddsAgeMsFromMinutes('-5')).toBe(DEFAULT_MAX_ODDS_AGE_MS);
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
