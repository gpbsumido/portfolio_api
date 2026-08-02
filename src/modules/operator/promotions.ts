// ---------------------------------------------------------------------------
// Operator module — pure promotion helpers
//
// The Pricing tab could model a discount but never run one, so it could predict
// and never be wrong out loud. A promotion is a row with a window; these helpers
// answer the three questions about it: is it on, does it cover this product, and
// what did it actually do.
//
// On that last one: comparePerformance is a BEFORE AND AFTER, not attribution.
// It measures the window against an equal-length baseline immediately before it.
// Seasonality, a new product on the next shelf, and a fridge that was warm for a
// week all move the same number. The API reports both raw figures rather than
// only the delta, and the UI says so in words -- a dashboard that quietly implies
// causation is worse than one that admits what it is showing.
// ---------------------------------------------------------------------------

export type PromotionStatus = 'scheduled' | 'active' | 'ended';

export type PromotionWindow = {
  productName: string | null;
  percent: number;
  startsAt: Date;
  endsAt: Date | null;
};

export type SaleLike = {
  productName: string;
  quantity: number;
  total: number;
  occurredAt: Date;
};

export type PerformanceTotals = {
  units: number;
  revenue: number;
};

export type PerformanceComparison = {
  window: PerformanceTotals;
  baseline: PerformanceTotals;
  /** Null when the baseline was zero — a percentage change would be a lie. */
  unitsChangePercent: number | null;
  revenueChangePercent: number | null;
};

/**
 * The longest stretch we will measure a promotion over.
 *
 * An open-ended promotion started a year ago has a window of a year, and the
 * baseline doubles the fetch, so measuring it would pull two years of sales to
 * answer one question. Clamping keeps the query bounded no matter how long a
 * promotion has been left running. The clamp is reported rather than hidden,
 * because a number quietly measured over a different period than the reader
 * assumes is the kind of thing that gets acted on.
 */
export const MAX_MEASURE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MeasurementWindow = {
  start: Date;
  end: Date;
  clamped: boolean;
};

/**
 * The window we will actually measure, clamped to the most recent
 * MAX_MEASURE_DAYS. The end stays put and the start moves forward, so a long
 * promotion is measured over its most recent stretch rather than its oldest.
 */
export function measurementWindow(start: Date, end: Date): MeasurementWindow {
  const maxMs = MAX_MEASURE_DAYS * DAY_MS;
  if (end.getTime() - start.getTime() <= maxMs) {
    return { start, end, clamped: false };
  }
  return { start: new Date(end.getTime() - maxMs), end, clamped: true };
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Derived from the window and the clock, never stored. A stored status needs a
 * job to flip it and is wrong in between runs.
 */
export function promotionStatus(
  promo: Pick<PromotionWindow, 'startsAt' | 'endsAt'>,
  now: Date,
): PromotionStatus {
  if (now.getTime() < promo.startsAt.getTime()) return 'scheduled';
  if (promo.endsAt !== null && now.getTime() >= promo.endsAt.getTime()) {
    return 'ended';
  }
  return 'active';
}

/** A null product name means the promotion covers the whole store. */
export function appliesTo(
  promo: Pick<PromotionWindow, 'productName'>,
  productName: string,
): boolean {
  return promo.productName === null || promo.productName === productName;
}

/** The promo price for a list price, clamped so a bad percent cannot invent one. */
export function discountedPrice(listPrice: number, percent: number): number {
  const safe = Math.min(Math.max(percent, 0), 100);
  return roundCents(listPrice * (1 - safe / 100));
}

function totalsFor(
  promo: Pick<PromotionWindow, 'productName'>,
  sales: readonly SaleLike[],
  from: Date,
  to: Date,
): PerformanceTotals {
  let units = 0;
  let revenue = 0;

  for (const sale of sales) {
    const at = sale.occurredAt.getTime();
    if (at < from.getTime() || at >= to.getTime()) continue;
    if (!appliesTo(promo, sale.productName)) continue;

    units += sale.quantity;
    revenue += sale.total;
  }

  return { units, revenue: roundCents(revenue) };
}

function changePercent(current: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((current - before) / before) * 100);
}

/**
 * The window against an equal-length baseline immediately preceding it.
 *
 * Equal length matters: comparing a two-week promotion against the previous
 * month would flatter or punish it purely on duration.
 */
export function comparePerformance(
  promo: Pick<PromotionWindow, 'productName'>,
  sales: readonly SaleLike[],
  windowStart: Date,
  windowEnd: Date,
): PerformanceComparison {
  const span = windowEnd.getTime() - windowStart.getTime();
  const baselineStart = new Date(windowStart.getTime() - span);

  const windowTotals = totalsFor(promo, sales, windowStart, windowEnd);
  const baselineTotals = totalsFor(promo, sales, baselineStart, windowStart);

  return {
    window: windowTotals,
    baseline: baselineTotals,
    unitsChangePercent: changePercent(windowTotals.units, baselineTotals.units),
    revenueChangePercent: changePercent(
      windowTotals.revenue,
      baselineTotals.revenue,
    ),
  };
}
