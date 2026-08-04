// ---------------------------------------------------------------------------
// Operator module — pure fleet aggregation helpers
//
// These mirror the pure models in paul-explore (operator-planner,
// operator-product-performance, operator-shrink, operator-finance) so the live
// API and the app's seed fallback compute the same numbers. The SQL in the
// repository does the fan-in (grouping, summing); these shape the grouped rows
// into the response DTOs. Pure and clock-injectable, so every branch is
// testable without a database.
// ---------------------------------------------------------------------------

import { roundCents } from './analytics.js';
import type {
  BenchmarksDto,
  FinanceDto,
  FleetShrinkDto,
  PayoutWeekDto,
  ProductPerformanceRowDto,
  ShrinkSummaryDto,
  StoreShrinkDto,
} from './types.js';

/** One decimal place, for whole-ish figures like a daily rate or basket size. */
function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Planner benchmarks
// ---------------------------------------------------------------------------

export type FleetTotals = { revenue: number; units: number; txns: number };

/**
 * The fleet's mean basket price and items per order, or null when there are no
 * sales to learn from — the honest answer the planner offers as a default.
 */
export function benchmarksFrom(totals: FleetTotals): BenchmarksDto {
  if (totals.txns === 0) return null;
  return {
    avgItemPrice: totals.units > 0 ? roundCents(totals.revenue / totals.units) : 0,
    itemsPerOrder: roundTenth(totals.units / totals.txns),
    sampleSize: totals.txns,
  };
}

// ---------------------------------------------------------------------------
// Product performance
// ---------------------------------------------------------------------------

export type ProductSalesRow = {
  productName: string;
  category: string;
  units: number;
  revenue: number;
};

export type InventoryProductRow = { productName: string; category: string };

/**
 * Assembles per-product performance over a `days` window: units, revenue, a
 * daily rate, and revenue indexed against the product's own category average
 * (100 is average). Stocked products with no sales are kept in as dead SKUs.
 * Ranked by revenue, highest first.
 */
export function buildProductPerformance(
  sales: readonly ProductSalesRow[],
  products: readonly InventoryProductRow[],
  days: number,
): ProductPerformanceRowDto[] {
  const windowDays = Math.max(1, days);
  const byProduct = new Map<
    string,
    { category: string; units: number; revenue: number }
  >();

  for (const row of sales) {
    const existing = byProduct.get(row.productName);
    if (existing) {
      existing.units += row.units;
      existing.revenue = roundCents(existing.revenue + row.revenue);
    } else {
      byProduct.set(row.productName, {
        category: row.category,
        units: row.units,
        revenue: roundCents(row.revenue),
      });
    }
  }

  for (const product of products) {
    if (!byProduct.has(product.productName)) {
      byProduct.set(product.productName, {
        category: product.category,
        units: 0,
        revenue: 0,
      });
    }
  }

  const categoryTotals = new Map<string, { revenue: number; count: number }>();
  for (const { category, revenue } of byProduct.values()) {
    const total = categoryTotals.get(category) ?? { revenue: 0, count: 0 };
    total.revenue += revenue;
    total.count += 1;
    categoryTotals.set(category, total);
  }

  const rows: ProductPerformanceRowDto[] = [...byProduct.entries()].map(
    ([productName, acc]) => {
      const total = categoryTotals.get(acc.category);
      const mean = total && total.count > 0 ? total.revenue / total.count : 0;
      return {
        productName,
        category: acc.category,
        unitsSold: acc.units,
        revenue: acc.revenue,
        avgPerDay: roundTenth(acc.units / windowDays),
        performanceIndex: mean > 0 ? Math.round((acc.revenue / mean) * 100) : 0,
        hasSales: acc.units > 0,
      };
    },
  );

  return rows.sort(
    (a, b) =>
      b.revenue - a.revenue || a.productName.localeCompare(b.productName),
  );
}

// ---------------------------------------------------------------------------
// Shrink and loss
// ---------------------------------------------------------------------------

export type ShrinkLineRow = {
  storeId: string;
  storeName: string;
  expectedQty: number;
  countedQty: number | null;
  removed: number;
  removalReason: string | null;
  price: number;
};

const EMPTY_SHRINK: ShrinkSummaryDto = {
  unexplainedUnits: 0,
  unexplainedValue: 0,
  explainedUnits: 0,
  explainedValue: 0,
  explainedByReason: {},
  countedLines: 0,
  notCountedLines: 0,
};

function summarizeShrink(lines: readonly ShrinkLineRow[]): ShrinkSummaryDto {
  let unexplainedUnits = 0;
  let unexplainedValue = 0;
  let explainedUnits = 0;
  let explainedValue = 0;
  let countedLines = 0;
  let notCountedLines = 0;
  const explainedByReason: Record<string, number> = {};

  for (const line of lines) {
    if (line.countedQty === null) {
      notCountedLines += 1;
    } else {
      countedLines += 1;
      const shortfall = Math.max(0, line.expectedQty - line.countedQty);
      unexplainedUnits += shortfall;
      unexplainedValue += shortfall * line.price;
    }
    if (line.removed > 0) {
      explainedUnits += line.removed;
      explainedValue += line.removed * line.price;
      const reason = line.removalReason ?? 'other';
      explainedByReason[reason] = (explainedByReason[reason] ?? 0) + line.removed;
    }
  }

  return {
    unexplainedUnits,
    unexplainedValue: roundCents(unexplainedValue),
    explainedUnits,
    explainedValue: roundCents(explainedValue),
    explainedByReason,
    countedLines,
    notCountedLines,
  };
}

function addShrink(a: ShrinkSummaryDto, b: ShrinkSummaryDto): ShrinkSummaryDto {
  const explainedByReason = { ...a.explainedByReason };
  for (const [reason, units] of Object.entries(b.explainedByReason)) {
    explainedByReason[reason] = (explainedByReason[reason] ?? 0) + units;
  }
  return {
    unexplainedUnits: a.unexplainedUnits + b.unexplainedUnits,
    unexplainedValue: roundCents(a.unexplainedValue + b.unexplainedValue),
    explainedUnits: a.explainedUnits + b.explainedUnits,
    explainedValue: roundCents(a.explainedValue + b.explainedValue),
    explainedByReason,
    countedLines: a.countedLines + b.countedLines,
    notCountedLines: a.notCountedLines + b.notCountedLines,
  };
}

/**
 * Reconciles completed restock lines into per-store shrink, ranked worst-first
 * by the value of unexplained shrink, plus fleet totals. Rows arrive already
 * joined to their store and item price.
 */
export function buildFleetShrink(
  rows: readonly ShrinkLineRow[],
): FleetShrinkDto {
  const byStore = new Map<
    string,
    { storeName: string; lines: ShrinkLineRow[] }
  >();
  for (const row of rows) {
    const entry = byStore.get(row.storeId) ?? {
      storeName: row.storeName,
      lines: [],
    };
    entry.lines.push(row);
    byStore.set(row.storeId, entry);
  }

  const stores: StoreShrinkDto[] = [...byStore.entries()].map(
    ([storeId, entry]) => ({
      storeId,
      storeName: entry.storeName,
      ...summarizeShrink(entry.lines),
    }),
  );

  stores.sort(
    (a, b) =>
      b.unexplainedValue - a.unexplainedValue ||
      a.storeName.localeCompare(b.storeName),
  );

  const totals = stores.reduce(
    (acc, store) => addShrink(acc, store),
    EMPTY_SHRINK,
  );

  return { stores, totals };
}

// ---------------------------------------------------------------------------
// Finance — weekly payouts
// ---------------------------------------------------------------------------

/**
 * The fee model, duplicated deliberately from paul-explore's operator-planner
 * rather than shared across a package boundary — the same tradeoff the
 * promotions arithmetic already makes. The number the planner quotes and the
 * number finance pays out must be the same by construction.
 */
export const FEE_MODEL = {
  transactionRate: 0.04,
  transactionFlat: 0.1,
  platformPerUnitMonthly: 60,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;

export type WeekGrossRow = { bucket: number; gross: number; txns: number };

/**
 * Fills sparse weekly gross rows (bucket 0 = the most recent 7 days) into a
 * fixed set of `weeks` payout weeks, netting each after the transaction cut and
 * the prorated platform fee, plus fleet totals. Newest week first.
 */
export function buildFinance(
  rows: readonly WeekGrossRow[],
  storeCount: number,
  now: Date,
  weeks = 8,
): FinanceDto {
  const nowMs = now.getTime();
  const platformFees = roundCents(
    FEE_MODEL.platformPerUnitMonthly *
      Math.max(0, storeCount) *
      (DAYS_PER_WEEK / DAYS_PER_MONTH),
  );

  const gross = new Array<number>(weeks).fill(0);
  const counts = new Array<number>(weeks).fill(0);
  for (const row of rows) {
    if (row.bucket < 0 || row.bucket >= weeks) continue;
    gross[row.bucket] = row.gross;
    counts[row.bucket] = row.txns;
  }

  const week: PayoutWeekDto[] = gross.map((grossRevenue, i) => {
    const revenue = roundCents(grossRevenue);
    const transactionFees = roundCents(
      revenue * FEE_MODEL.transactionRate + counts[i] * FEE_MODEL.transactionFlat,
    );
    return {
      weekStart: new Date(
        nowMs - (i + 1) * DAYS_PER_WEEK * MS_PER_DAY,
      ).toISOString(),
      grossRevenue: revenue,
      transactionCount: counts[i],
      transactionFees,
      platformFees,
      netPayout: roundCents(revenue - transactionFees - platformFees),
    };
  });

  const totals = week.reduce(
    (acc, w) => ({
      grossRevenue: roundCents(acc.grossRevenue + w.grossRevenue),
      transactionCount: acc.transactionCount + w.transactionCount,
      transactionFees: roundCents(acc.transactionFees + w.transactionFees),
      platformFees: roundCents(acc.platformFees + w.platformFees),
      netPayout: roundCents(acc.netPayout + w.netPayout),
    }),
    {
      grossRevenue: 0,
      transactionCount: 0,
      transactionFees: 0,
      platformFees: 0,
      netPayout: 0,
    },
  );

  return { weeks: week, totals, fees: { ...FEE_MODEL } };
}
