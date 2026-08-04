import { describe, expect, test } from 'vitest';
import {
  benchmarksFrom,
  buildFinance,
  buildFleetShrink,
  buildProductPerformance,
  type ShrinkLineRow,
  type WeekGrossRow,
} from './aggregations.js';

const NOW = new Date('2026-08-04T12:00:00.000Z');

describe('benchmarksFrom', () => {
  test('derives mean basket price and items per order', () => {
    expect(benchmarksFrom({ revenue: 13, units: 3, txns: 2 })).toEqual({
      avgItemPrice: 4.33,
      itemsPerOrder: 1.5,
      sampleSize: 2,
    });
  });

  test('is null when there are no transactions', () => {
    expect(benchmarksFrom({ revenue: 0, units: 0, txns: 0 })).toBeNull();
  });
});

describe('buildProductPerformance', () => {
  test('indexes revenue against the category average and keeps dead SKUs', () => {
    const rows = buildProductPerformance(
      [
        { productName: 'Cola', category: 'beverages', units: 50, revenue: 100 },
        { productName: 'Water', category: 'beverages', units: 25, revenue: 50 },
      ],
      [{ productName: 'Kombucha', category: 'beverages' }],
      7,
    );
    const cola = rows.find((r) => r.productName === 'Cola');
    const dead = rows.find((r) => r.productName === 'Kombucha');
    // category mean revenue over three products = (100+50+0)/3 = 50
    expect(cola?.performanceIndex).toBe(200);
    expect(dead?.hasSales).toBe(false);
    expect(rows[0].productName).toBe('Cola'); // ranked by revenue
  });
});

describe('buildFleetShrink', () => {
  test('splits unexplained shrink from reasoned loss and ranks worst-first', () => {
    const lines: ShrinkLineRow[] = [
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
    ];
    const result = buildFleetShrink(lines);
    expect(result.stores.map((s) => s.storeId)).toEqual(['s2', 's1']);
    expect(result.totals.unexplainedUnits).toBe(7); // 6 + 1
    expect(result.totals.unexplainedValue).toBe(20); // 6*3 + 1*2
    expect(result.totals.explainedByReason).toEqual({ expired: 2 });
  });
});

describe('buildFinance', () => {
  test('nets each week after transaction and platform fees', () => {
    const rows: WeekGrossRow[] = [{ bucket: 0, gross: 1000, txns: 200 }];
    const { weeks, totals, fees } = buildFinance(rows, 1, NOW, 8);
    expect(weeks).toHaveLength(8);
    // 4% of 1000 + $0.10 * 200 = 60. platform $60 * 1 * 7/30 = 14.
    expect(weeks[0].transactionFees).toBe(60);
    expect(weeks[0].platformFees).toBe(14);
    expect(weeks[0].netPayout).toBe(926);
    expect(totals.grossRevenue).toBe(1000);
    expect(fees.platformPerUnitMonthly).toBe(60);
  });
});
