import { describe, expect, test } from 'vitest';
import { buildOperatorSeed } from './seed-data.js';
import { buildFinance, type WeekGrossRow } from './aggregations.js';

/**
 * Regression guard for "operator finance is always negative".
 *
 * The finance model charges a platform fee per machine per week regardless of
 * sales, so a seed that is too sparse in recent weeks nets negative every week.
 * That is exactly what a flat 60-sales-per-store seed did: ~6 sales a week
 * across the fleet against $672 of platform fees over eight weeks. These tests
 * pin the seed to realistic vending volume so a live operator sees a healthy,
 * positive payout, and so the fee can never silently swamp revenue again.
 *
 * The bucketing here mirrors repository.weeklyGrossBuckets (sales in the last
 * `weeks` seven-day windows), so the numbers match what GET /finance returns.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-04T12:00:00.000Z');

function financeFromSeed(now: Date, weeks = 8) {
  let n = 0;
  const seed = buildOperatorSeed(() => `id-${String(++n).padStart(4, '0')}`, now);
  const since = now.getTime() - weeks * 7 * MS_PER_DAY;
  const byBucket = new Map<number, { gross: number; txns: number }>();
  for (const sale of seed.sales) {
    const t = sale.occurredAt.getTime();
    if (t < since) continue;
    const bucket = Math.floor((now.getTime() - t) / (7 * MS_PER_DAY));
    const cur = byBucket.get(bucket) ?? { gross: 0, txns: 0 };
    cur.gross += sale.total;
    cur.txns += 1;
    byBucket.set(bucket, cur);
  }
  const rows: WeekGrossRow[] = [...byBucket.entries()].map(([bucket, v]) => ({
    bucket,
    gross: v.gross,
    txns: v.txns,
  }));
  return buildFinance(rows, seed.stores.length, now, weeks);
}

describe('finance is healthy from the seed', () => {
  test('the fleet nets a positive payout over the last eight weeks', () => {
    const { totals } = financeFromSeed(NOW);
    expect(totals.netPayout).toBeGreaterThan(0);
  });

  test('platform fees are a minority of gross, not a swamp', () => {
    const { totals } = financeFromSeed(NOW);
    expect(totals.platformFees).toBeLessThan(totals.grossRevenue * 0.25);
  });

  test('every recent week has real sales volume, none empty', () => {
    const { weeks } = financeFromSeed(NOW);
    for (const week of weeks) {
      expect(week.transactionCount).toBeGreaterThan(0);
    }
  });

  test('stays positive as the reseed date moves', () => {
    for (const iso of [
      '2026-01-15T00:00:00.000Z',
      '2026-11-30T23:00:00.000Z',
      '2027-03-01T08:00:00.000Z',
    ]) {
      const { totals } = financeFromSeed(new Date(iso));
      expect(totals.netPayout).toBeGreaterThan(0);
    }
  });
});
