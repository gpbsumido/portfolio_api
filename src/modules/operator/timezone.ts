// ---------------------------------------------------------------------------
// Operator module — timezone resolution and zone-aware calendar math
//
// Every bucket boundary in this module used to be UTC, which meant a Toronto
// store's day started at 8pm the evening before and a Vancouver store's at 5pm.
// Sales made in the busiest part of the afternoon landed in the next day's
// column. This module is the one place that knows how to turn an instant into
// a local wall clock and back again.
//
// Deliberately no date library. The only question zone-aware bucketing actually
// asks is "given this instant and this zone, what is the local Y/M/D/H", and
// Intl.DateTimeFormat.formatToParts answers exactly that using the tzdata
// already in the runtime. Pulling in Luxon or date-fns-tz would ship a second
// copy of tzdata on a release cadence we don't control, to do the same job.
//
// The catch is that constructing a formatter is genuinely expensive while
// calling one is not, so formatters are built once per zone and cached.
// ---------------------------------------------------------------------------

import type { SalesGranularity } from './types.js';

/**
 * The zone the overwhelming majority of each province observes.
 *
 * This is a default, not the truth. BC, QC and NU each span more than one zone
 * (NU spans three), so a province code can never be right for every store --
 * hence the nullable `timezone` override column added in migration 016.
 */
export const PROVINCE_ZONE: Record<string, string> = {
  AB: 'America/Edmonton',
  BC: 'America/Vancouver',
  MB: 'America/Winnipeg',
  NB: 'America/Moncton',
  NL: 'America/St_Johns',
  NS: 'America/Halifax',
  NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
  ON: 'America/Toronto',
  PE: 'America/Halifax',
  QC: 'America/Toronto',
  SK: 'America/Regina',
  YT: 'America/Whitehorse',
};

export const FALLBACK_ZONE = 'UTC';

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached formatter for a zone. Building one is the expensive part. */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;

  const built = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(timeZone, built);
  return built;
}

/** Whether the runtime's tzdata recognises this zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone for a province, falling back to UTC rather than guessing. */
export function timezoneForProvince(province: string): string {
  return PROVINCE_ZONE[province] ?? FALLBACK_ZONE;
}

/**
 * The zone for a store: the stored override when it is set and real, otherwise
 * the province default. Tolerates the column being absent so the API keeps
 * working on a database where migration 016 has not been run yet.
 */
export function resolveStoreTimezone(store: {
  province: string;
  timezone?: string | null;
}): string {
  if (store.timezone && isValidTimeZone(store.timezone)) return store.timezone;
  return timezoneForProvince(store.province);
}

/** The local wall clock in a zone at a given instant. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** How far the zone is from UTC at a given instant, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * The instant at which a given local wall clock occurs in a zone.
 *
 * Two passes, because the offset we need depends on the instant we are trying
 * to find. The first guess uses the offset at the naive-UTC reading, the second
 * corrects it using the offset actually in force there -- which is what makes
 * the 23- and 25-hour DST days come out right.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour);
  const firstPass = naive - offsetMsAt(new Date(naive), timeZone);
  return new Date(naive - offsetMsAt(new Date(firstPass), timeZone));
}

/** Local midnight of the day an instant falls in. */
export function dayStartInZone(instant: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(instant, timeZone);
  return zonedInstant(year, month, day, 0, timeZone);
}

/** The day of the week (0 = Sunday) for a local calendar date. */
export function weekdayOf(parts: ZonedParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * The start of the period an instant falls in, in the given zone. Weeks start
 * on Monday, matching the existing bucket convention.
 */
export function startOfPeriodInZone(
  granularity: SalesGranularity,
  instant: Date,
  timeZone: string,
): Date {
  const parts = zonedParts(instant, timeZone);

  if (granularity === 'day') {
    return zonedInstant(parts.year, parts.month, parts.day, 0, timeZone);
  }

  if (granularity === 'week') {
    const mondayOffset = (weekdayOf(parts) + 6) % 7;
    return zonedInstant(parts.year, parts.month, parts.day - mondayOffset, 0, timeZone);
  }

  if (granularity === 'month') {
    return zonedInstant(parts.year, parts.month, 1, 0, timeZone);
  }

  return zonedInstant(parts.year, 1, 1, 0, timeZone);
}
