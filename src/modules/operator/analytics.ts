// ---------------------------------------------------------------------------
// Operator module — pure analytics helpers
//
// The DB returns sparse, truncated period sums; these fill them into a fixed
// set of windows (7 days / 8 weeks / 12 months / 5 years) with labels. Kept
// pure and clock-injectable so the bucket boundaries are testable.
// ---------------------------------------------------------------------------

import type { PeriodRow } from './repository.js';
import type { SalesGranularity, SalesPeriodBucket } from './types.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PERIOD_COUNT: Record<SalesGranularity, number> = {
  day: 7,
  week: 8,
  month: 12,
  year: 5,
};

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The oldest-first list of period-start Dates for a granularity, ending now. */
function periodStarts(granularity: SalesGranularity, now: Date): Date[] {
  const count = PERIOD_COUNT[granularity];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const starts: Date[] = [];

  for (let i = count - 1; i >= 0; i--) {
    if (granularity === 'day') {
      starts.push(new Date(Date.UTC(y, m, d - i)));
    } else if (granularity === 'week') {
      const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
      const mondayOffset = (dow + 6) % 7;
      starts.push(new Date(Date.UTC(y, m, d - mondayOffset) - i * 7 * MS_PER_DAY));
    } else if (granularity === 'month') {
      starts.push(new Date(Date.UTC(y, m - i, 1)));
    } else {
      starts.push(new Date(Date.UTC(y - i, 0, 1)));
    }
  }
  return starts;
}

/** The start of the visible window (the oldest bucket's start). */
export function windowStart(granularity: SalesGranularity, now: Date): Date {
  return periodStarts(granularity, now)[0];
}

/** A comparable key for matching a DB-truncated period to a fixed bucket. */
function keyOf(granularity: SalesGranularity, date: Date): string {
  const iso = date.toISOString();
  if (granularity === 'year') return iso.slice(0, 4);
  if (granularity === 'month') return iso.slice(0, 7);
  return iso.slice(0, 10);
}

function labelOf(granularity: SalesGranularity, date: Date): string {
  if (granularity === 'day') return DAY_LABELS[date.getUTCDay()];
  if (granularity === 'week') {
    return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  }
  if (granularity === 'month') {
    return `${MONTH_LABELS[date.getUTCMonth()]} ${String(
      date.getUTCFullYear(),
    ).slice(2)}`;
  }
  return String(date.getUTCFullYear());
}

/**
 * Fills the sparse DB period rows into the fixed set of buckets for the
 * granularity, oldest first, with labels and cents-rounded revenue.
 */
export function buildBuckets(
  granularity: SalesGranularity,
  rows: readonly PeriodRow[],
  now: Date,
): SalesPeriodBucket[] {
  const byKey = new Map<string, PeriodRow>();
  for (const row of rows) {
    byKey.set(keyOf(granularity, new Date(row.period)), row);
  }

  return periodStarts(granularity, now).map((start) => {
    const row = byKey.get(keyOf(granularity, start));
    return {
      label: labelOf(granularity, start),
      start: start.toISOString(),
      revenue: roundCents(row?.revenue ?? 0),
      units: row?.units ?? 0,
    };
  });
}
