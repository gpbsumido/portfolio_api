import { describe, expect, test } from 'vitest';
import {
  FEE_MODEL,
  benchmarksFrom,
  buildFinance,
  buildFleetShrink,
  buildProductPerformance,
} from './aggregations.js';

/**
 * Cross-repo parity guard.
 *
 * The aggregation math is duplicated: this module and paul-explore's
 * operator-planner / operator-product-performance / operator-shrink /
 * operator-finance compute the same numbers so the live API and the app's seed
 * fallback agree. Nothing structural stops the two copies drifting, and the only
 * thing that would catch it otherwise is the heavy live-backend E2E.
 *
 * So both repos assert the SAME canonical scenarios against the SAME expected
 * outputs (identical literals below and in paul-explore's operator-parity.test).
 * If a formula changes in one repo, its parity test fails against the shared
 * expectation. Its twin lives at
 * paul-explore/src/__tests__/operator/operator-parity.test.ts — the two must be
 * changed together.
 */

const NOW = new Date('2026-08-04T12:00:00.000Z');

describe('operator aggregation parity (keep in sync with paul-explore)', () => {
  test('the fee model matches', () => {
    expect(FEE_MODEL).toEqual({
      transactionRate: 0.04,
      transactionFlat: 0.1,
      platformPerUnitMonthly: 60,
    });
  });

  test('benchmarks', () => {
    expect(benchmarksFrom({ revenue: 13, units: 3, txns: 2 })).toEqual({
      avgItemPrice: 4.33,
      itemsPerOrder: 1.5,
      sampleSize: 2,
    });
  });

  test('product performance category index and dead SKU', () => {
    const rows = buildProductPerformance(
      [
        { productName: 'Cola', category: 'beverages', units: 50, revenue: 100 },
        { productName: 'Water', category: 'beverages', units: 25, revenue: 50 },
      ],
      [{ productName: 'Kombucha', category: 'beverages' }],
      7,
    );
    expect(rows.map((r) => [r.productName, r.performanceIndex, r.hasSales])).toEqual([
      ['Cola', 200, true],
      ['Water', 100, true],
      ['Kombucha', 0, false],
    ]);
  });

  test('shrink split, valuation and worst-first ranking', () => {
    const result = buildFleetShrink([
      {
        storeId: 's2',
        storeName: 'Busy Gym',
        expectedQty: 10,
        countedQty: 4,
        removed: 0,
        removalReason: null,
        price: 3,
      },
      {
        storeId: 's1',
        storeName: 'Quiet Lobby',
        expectedQty: 5,
        countedQty: 4,
        removed: 2,
        removalReason: 'expired',
        price: 2,
      },
    ]);
    expect(result.stores.map((s) => s.storeId)).toEqual(['s2', 's1']);
    expect(result.totals.unexplainedUnits).toBe(7);
    expect(result.totals.unexplainedValue).toBe(20);
    expect(result.totals.explainedByReason).toEqual({ expired: 2 });
  });

  test('finance nets a week after both fees', () => {
    const { weeks, totals } = buildFinance(
      [{ bucket: 0, gross: 1000, txns: 200 }],
      1,
      NOW,
      8,
    );
    expect(weeks).toHaveLength(8);
    expect([
      weeks[0].transactionFees,
      weeks[0].platformFees,
      weeks[0].netPayout,
    ]).toEqual([60, 14, 926]);
    expect(totals.grossRevenue).toBe(1000);
  });
});
