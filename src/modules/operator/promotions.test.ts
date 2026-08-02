import { describe, expect, test } from 'vitest';

import {
  appliesTo,
  comparePerformance,
  discountedPrice,
  promotionStatus,
} from './promotions.js';

const NOW = new Date('2026-08-10T12:00:00.000Z');

const promo = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'promo-1',
  storeId: 'store-1',
  productName: null as string | null,
  percent: 20,
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: new Date('2026-08-31T00:00:00.000Z'),
  ...over,
});

const sale = (timestamp: string, total: number, quantity = 1, productName = 'Energy Bar') => ({
  productName,
  quantity,
  total,
  occurredAt: new Date(timestamp),
});

describe('promotionStatus', () => {
  test('is scheduled before it starts', () => {
    const at = promo({ startsAt: new Date('2026-09-01T00:00:00.000Z') });
    expect(promotionStatus(at, NOW)).toBe('scheduled');
  });

  test('is active inside its window', () => {
    expect(promotionStatus(promo(), NOW)).toBe('active');
  });

  test('is ended after its end date', () => {
    const at = promo({ endsAt: new Date('2026-08-05T00:00:00.000Z') });
    expect(promotionStatus(at, NOW)).toBe('ended');
  });

  test('stays active indefinitely when there is no end date', () => {
    const at = promo({ endsAt: null });
    expect(promotionStatus(at, NOW)).toBe('active');
    expect(promotionStatus(at, new Date('2030-01-01T00:00:00.000Z'))).toBe(
      'active',
    );
  });

  test('is active on the exact instant it starts', () => {
    const at = promo({ startsAt: NOW });
    expect(promotionStatus(at, NOW)).toBe('active');
  });
});

describe('appliesTo', () => {
  test('a store-wide promotion covers every product', () => {
    expect(appliesTo(promo({ productName: null }), 'Anything')).toBe(true);
  });

  test('a product promotion covers only its product', () => {
    const at = promo({ productName: 'Energy Bar' });
    expect(appliesTo(at, 'Energy Bar')).toBe(true);
    expect(appliesTo(at, 'Coca-Cola 355ml')).toBe(false);
  });
});

describe('discountedPrice', () => {
  test('applies the percent and rounds to cents', () => {
    expect(discountedPrice(2.99, 20)).toBe(2.39);
  });

  test('clamps a nonsense percent rather than inventing a price', () => {
    expect(discountedPrice(10, 0)).toBe(10);
    expect(discountedPrice(10, 200)).toBe(0);
    expect(discountedPrice(10, -50)).toBe(10);
  });
});

describe('comparePerformance', () => {
  // Window: Aug 1 to Aug 11 (10 days). Baseline: the 10 days before it.
  const windowStart = new Date('2026-08-01T00:00:00.000Z');
  const windowEnd = new Date('2026-08-11T00:00:00.000Z');

  const sales = [
    // Inside the window
    sale('2026-08-02T10:00:00.000Z', 20, 8),
    sale('2026-08-05T10:00:00.000Z', 15, 6),
    // Inside the equal-length baseline before it
    sale('2026-07-24T10:00:00.000Z', 25, 5),
    // Older than the baseline, must be ignored
    sale('2026-07-01T10:00:00.000Z', 999, 999),
    // A different product, must be ignored for a targeted promotion
    sale('2026-08-03T10:00:00.000Z', 50, 20, 'Coca-Cola 355ml'),
  ];

  test('totals units and revenue inside the window', () => {
    const result = comparePerformance(
      promo({ productName: 'Energy Bar' }),
      sales,
      windowStart,
      windowEnd,
    );
    expect(result.window.units).toBe(14);
    expect(result.window.revenue).toBe(35);
  });

  test('uses an equal-length baseline immediately before the window', () => {
    const result = comparePerformance(
      promo({ productName: 'Energy Bar' }),
      sales,
      windowStart,
      windowEnd,
    );
    expect(result.baseline.units).toBe(5);
    expect(result.baseline.revenue).toBe(25);
  });

  test('reports the deltas as percentages', () => {
    const result = comparePerformance(
      promo({ productName: 'Energy Bar' }),
      sales,
      windowStart,
      windowEnd,
    );
    // 14 vs 5 units = +180%, 35 vs 25 revenue = +40%
    expect(result.unitsChangePercent).toBe(180);
    expect(result.revenueChangePercent).toBe(40);
  });

  test('does not divide by zero when there is no baseline', () => {
    const result = comparePerformance(
      promo({ productName: 'Brand New Thing' }),
      sales,
      windowStart,
      windowEnd,
    );
    expect(result.baseline.units).toBe(0);
    expect(result.unitsChangePercent).toBeNull();
    expect(result.revenueChangePercent).toBeNull();
  });

  test('a store-wide promotion counts every product', () => {
    const result = comparePerformance(
      promo({ productName: null }),
      sales,
      windowStart,
      windowEnd,
    );
    expect(result.window.units).toBe(34); // 8 + 6 + 20
  });
});
