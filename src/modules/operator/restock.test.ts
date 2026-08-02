import { describe, expect, test } from 'vitest';

import {
  countStatusOf,
  describeSession,
  resultingStock,
  summarizeSession,
} from './restock.js';

const line = (over: Partial<Record<string, unknown>> = {}) => ({
  itemId: 'item-1',
  expectedQty: 8,
  countedQty: null,
  added: 0,
  removed: 0,
  removalReason: null,
  ...over,
});

describe('resultingStock', () => {
  test('uses the counted quantity when the restocker entered one', () => {
    // The shelf is the source of truth when someone actually looked at it.
    expect(resultingStock(line({ expectedQty: 8, countedQty: 5 }), 12)).toBe(5);
  });

  test('falls back to the expected quantity when the count was skipped', () => {
    expect(resultingStock(line({ expectedQty: 8, countedQty: null }), 12)).toBe(
      8,
    );
  });

  test('treats a counted zero as a count, not as a skip', () => {
    expect(resultingStock(line({ expectedQty: 8, countedQty: 0 }), 12)).toBe(0);
  });

  test('applies adds and removes on top of the base', () => {
    const at = line({ expectedQty: 8, countedQty: 5, added: 4, removed: 2 });
    expect(resultingStock(at, 12)).toBe(7);
  });

  test('clamps at zero rather than going negative', () => {
    expect(resultingStock(line({ countedQty: 2, removed: 9 }), 12)).toBe(0);
  });

  test('clamps at capacity rather than overfilling a shelf', () => {
    expect(resultingStock(line({ countedQty: 10, added: 20 }), 12)).toBe(12);
  });
});

describe('countStatusOf', () => {
  test('reports not-counted when the count was skipped', () => {
    expect(countStatusOf(line({ countedQty: null }))).toBe('not-counted');
  });

  test('reports matches-expected when the count agreed', () => {
    expect(countStatusOf(line({ expectedQty: 8, countedQty: 8 }))).toBe(
      'matches-expected',
    );
  });

  test('reports correction when the count disagreed', () => {
    expect(countStatusOf(line({ expectedQty: 8, countedQty: 5 }))).toBe(
      'correction',
    );
  });
});

describe('summarizeSession', () => {
  const lines = [
    line({ itemId: 'a', expectedQty: 8, countedQty: 5, added: 4 }),
    line({ itemId: 'b', expectedQty: 6, countedQty: 6, removed: 2, removalReason: 'expired' }),
    line({ itemId: 'c', expectedQty: 3, countedQty: null, added: 9 }),
    line({ itemId: 'd', expectedQty: 4, countedQty: 1, removed: 3, removalReason: 'damaged' }),
  ];

  test('totals what went in and what came out', () => {
    const summary = summarizeSession(lines);
    expect(summary.added).toBe(13);
    expect(summary.removed).toBe(5);
    expect(summary.itemsTouched).toBe(4);
  });

  test('counts corrections and skipped counts separately', () => {
    const summary = summarizeSession(lines);
    expect(summary.corrections).toBe(2); // a and d
    expect(summary.notCounted).toBe(1); // c
  });

  test('breaks removals down by reason, because that is the whole point', () => {
    const summary = summarizeSession(lines);
    expect(summary.removedByReason).toEqual({ expired: 2, damaged: 3 });
  });

  test('handles an empty session without dividing by anything', () => {
    const summary = summarizeSession([]);
    expect(summary).toMatchObject({
      added: 0,
      removed: 0,
      corrections: 0,
      notCounted: 0,
      itemsTouched: 0,
    });
    expect(summary.removedByReason).toEqual({});
  });
});

describe('describeSession', () => {
  test('names the removals by reason so the activity feed is readable', () => {
    const text = describeSession(
      summarizeSession([
        line({ itemId: 'b', countedQty: 6, removed: 2, removalReason: 'expired' }),
        line({ itemId: 'a', countedQty: 5, added: 4 }),
      ]),
    );
    expect(text).toMatch(/2 items/);
    expect(text).toMatch(/\+4/);
    expect(text).toMatch(/-2/);
    expect(text).toMatch(/2 expired/);
  });

  test('calls out corrections when the shelf disagreed with the system', () => {
    const text = describeSession(
      summarizeSession([line({ expectedQty: 8, countedQty: 5 })]),
    );
    expect(text).toMatch(/1 correction/);
  });

  test('reads sensibly when nothing moved', () => {
    expect(describeSession(summarizeSession([]))).toMatch(/no changes/i);
  });
});
