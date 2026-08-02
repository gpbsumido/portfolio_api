// ---------------------------------------------------------------------------
// Operator module — pure analytics helpers
//
// The DB returns sparse, truncated period sums; these fill them into a fixed
// set of windows (7 days / 8 weeks / 12 months / 5 years) with labels. Kept
// pure and clock-injectable so the bucket boundaries are testable.
//
// Every boundary here used to be Date.UTC, which put a Toronto store's day
// boundary at 8pm the previous evening. Boundaries now resolve in a caller-
// supplied IANA zone, and the DB truncates in the same zone, so the join key
// between a period row and its bucket is simply the instant they both land on.
// ---------------------------------------------------------------------------

import type { PeriodRow } from './repository.js';
import { weekdayOf, zonedInstant, zonedParts } from './timezone.js';
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

const PERIOD_COUNT: Record<SalesGranularity, number> = {
  day: 7,
  week: 8,
  month: 12,
  year: 5,
};

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The oldest-first list of period-start instants for a granularity, ending in
 * the period `now` falls in.
 *
 * Steps are taken on the local calendar rather than by subtracting fixed
 * milliseconds, which is what keeps a 23-hour spring-forward day from shifting
 * every earlier bucket by an hour.
 */
function periodStarts(
  granularity: SalesGranularity,
  now: Date,
  timeZone: string,
): Date[] {
  const count = PERIOD_COUNT[granularity];
  const { year, month, day } = zonedParts(now, timeZone);
  const starts: Date[] = [];

  for (let i = count - 1; i >= 0; i--) {
    if (granularity === 'day') {
      starts.push(zonedInstant(year, month, day - i, 0, timeZone));
    } else if (granularity === 'week') {
      const mondayOffset = (weekdayOf(zonedParts(now, timeZone)) + 6) % 7;
      starts.push(
        zonedInstant(year, month, day - mondayOffset - i * 7, 0, timeZone),
      );
    } else if (granularity === 'month') {
      starts.push(zonedInstant(year, month - i, 1, 0, timeZone));
    } else {
      starts.push(zonedInstant(year - i, 1, 1, 0, timeZone));
    }
  }
  return starts;
}

/** The start of the visible window (the oldest bucket's start). */
export function windowStart(
  granularity: SalesGranularity,
  now: Date,
  timeZone: string,
): Date {
  return periodStarts(granularity, now, timeZone)[0];
}

function labelOf(
  granularity: SalesGranularity,
  date: Date,
  timeZone: string,
): string {
  const parts = zonedParts(date, timeZone);

  if (granularity === 'day') return DAY_LABELS[weekdayOf(parts)];
  if (granularity === 'week') {
    return `${MONTH_LABELS[parts.month - 1]} ${parts.day}`;
  }
  if (granularity === 'month') {
    return `${MONTH_LABELS[parts.month - 1]} ${String(parts.year).slice(2)}`;
  }
  return String(parts.year);
}

/**
 * Fills the sparse DB period rows into the fixed set of buckets for the
 * granularity, oldest first, with labels and cents-rounded revenue.
 *
 * Rows are keyed by the exact instant their truncated period starts at, which
 * lines up with `periodStarts` because both truncate in the same zone.
 */
export function buildBuckets(
  granularity: SalesGranularity,
  rows: readonly PeriodRow[],
  now: Date,
  timeZone: string,
): SalesPeriodBucket[] {
  const byInstant = new Map<number, PeriodRow>();
  for (const row of rows) {
    byInstant.set(new Date(row.period).getTime(), row);
  }

  return periodStarts(granularity, now, timeZone).map((start) => {
    const row = byInstant.get(start.getTime());
    return {
      label: labelOf(granularity, start, timeZone),
      start: start.toISOString(),
      revenue: roundCents(row?.revenue ?? 0),
      units: row?.units ?? 0,
    };
  });
}
