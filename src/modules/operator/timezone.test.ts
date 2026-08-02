import { describe, expect, test } from 'vitest';

import {
  dayStartInZone,
  isValidTimeZone,
  PROVINCE_ZONE,
  resolveStoreTimezone,
  startOfPeriodInZone,
  timezoneForProvince,
  zonedParts,
} from './timezone.js';

// Canada's DST flips on the second Sunday in March and the first Sunday in
// November. In 2026 that is Mar 8 and Nov 1 -- the two days that are not 24
// hours long, and the reason flooring epoch-ms by 86.4e6 is wrong.
const SPRING_FORWARD = '2026-03-08';
const FALL_BACK = '2026-11-01';

describe('timezoneForProvince', () => {
  test('maps every province code to a zone the runtime recognises', () => {
    const codes = Object.keys(PROVINCE_ZONE);
    expect(codes).toHaveLength(13);

    for (const code of codes) {
      const zone = timezoneForProvince(code);
      expect(isValidTimeZone(zone), `${code} -> ${zone}`).toBe(true);
    }
  });

  test('puts Ontario and British Columbia in different zones', () => {
    expect(timezoneForProvince('ON')).toBe('America/Toronto');
    expect(timezoneForProvince('BC')).toBe('America/Vancouver');
  });

  test('falls back to UTC for an unknown province rather than guessing', () => {
    expect(timezoneForProvince('XX')).toBe('UTC');
  });
});

describe('resolveStoreTimezone', () => {
  test('prefers the stored column over the province default', () => {
    const zone = resolveStoreTimezone({
      province: 'BC',
      timezone: 'America/Edmonton',
    });
    expect(zone).toBe('America/Edmonton');
  });

  test('falls back to the province default when the column is null', () => {
    expect(resolveStoreTimezone({ province: 'BC', timezone: null })).toBe('America/Vancouver');
  });

  test('falls back when the column is missing entirely', () => {
    expect(resolveStoreTimezone({ province: 'ON' })).toBe('America/Toronto');
  });

  test('ignores a stored zone the runtime does not recognise', () => {
    const zone = resolveStoreTimezone({
      province: 'ON',
      timezone: 'Mars/Olympus_Mons',
    });
    expect(zone).toBe('America/Toronto');
  });
});

describe('isValidTimeZone', () => {
  test('accepts a real IANA zone and rejects a bogus one', () => {
    expect(isValidTimeZone('America/Halifax')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('zonedParts', () => {
  test('reads the local wall clock, not the UTC one', () => {
    // 03:00 UTC on Jun 15 is still the evening of Jun 14 in Vancouver.
    const parts = zonedParts(new Date('2026-06-15T03:00:00Z'), 'America/Vancouver');
    expect(parts).toMatchObject({ year: 2026, month: 6, day: 14, hour: 20 });
  });

  test('reads midnight as hour 0 rather than 24', () => {
    const parts = zonedParts(new Date('2026-06-15T07:00:00Z'), 'America/Vancouver');
    expect(parts).toMatchObject({ day: 15, hour: 0 });
  });
});

describe('dayStartInZone', () => {
  test('resolves local midnight to the right instant in summer', () => {
    // EDT is UTC-4, so Toronto midnight on Jun 15 is 04:00Z.
    const start = dayStartInZone(new Date('2026-06-15T18:00:00Z'), 'America/Toronto');
    expect(start.toISOString()).toBe('2026-06-15T04:00:00.000Z');
  });

  test('resolves local midnight to the right instant in winter', () => {
    // EST is UTC-5, so Toronto midnight on Jan 15 is 05:00Z.
    const start = dayStartInZone(new Date('2026-01-15T18:00:00Z'), 'America/Toronto');
    expect(start.toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  test('a spring-forward day is 23 hours, not 24', () => {
    const start = dayStartInZone(new Date(`${SPRING_FORWARD}T18:00:00Z`), 'America/Toronto');
    const next = dayStartInZone(new Date('2026-03-09T18:00:00Z'), 'America/Toronto');
    const hours = (next.getTime() - start.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  test('a fall-back day is 25 hours, not 24', () => {
    const start = dayStartInZone(new Date(`${FALL_BACK}T18:00:00Z`), 'America/Toronto');
    const next = dayStartInZone(new Date('2026-11-02T18:00:00Z'), 'America/Toronto');
    const hours = (next.getTime() - start.getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });

  test('a timestamp just before local midnight stays on its own day', () => {
    // 23:30 Vancouver on Jun 14 is 06:30Z on Jun 15 -- the exact case the UTC
    // floor got wrong.
    const instant = new Date('2026-06-15T06:30:00Z');
    const start = dayStartInZone(instant, 'America/Vancouver');
    expect(zonedParts(start, 'America/Vancouver')).toMatchObject({
      day: 14,
      hour: 0,
    });
  });
});

describe('startOfPeriodInZone', () => {
  test('day starts on local midnight', () => {
    const start = startOfPeriodInZone('day', new Date('2026-06-15T18:00:00Z'), 'America/Toronto');
    expect(start.toISOString()).toBe('2026-06-15T04:00:00.000Z');
  });

  test('week starts on the local Monday', () => {
    // Jun 15 2026 is a Monday; Jun 17 should snap back to it.
    const start = startOfPeriodInZone('week', new Date('2026-06-17T18:00:00Z'), 'America/Toronto');
    expect(zonedParts(start, 'America/Toronto')).toMatchObject({
      month: 6,
      day: 15,
      hour: 0,
    });
  });

  test('week containing a Sunday snaps back to the previous Monday', () => {
    // Jun 21 2026 is a Sunday -- the off-by-one a naive getDay() would make.
    const start = startOfPeriodInZone('week', new Date('2026-06-21T18:00:00Z'), 'America/Toronto');
    expect(zonedParts(start, 'America/Toronto')).toMatchObject({
      month: 6,
      day: 15,
    });
  });

  test('month starts on the first of the local month', () => {
    const start = startOfPeriodInZone('month', new Date('2026-06-15T18:00:00Z'), 'America/Toronto');
    expect(zonedParts(start, 'America/Toronto')).toMatchObject({
      month: 6,
      day: 1,
      hour: 0,
    });
  });

  test('year starts on Jan 1 of the local year', () => {
    const start = startOfPeriodInZone('year', new Date('2026-06-15T18:00:00Z'), 'America/Toronto');
    expect(zonedParts(start, 'America/Toronto')).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
    });
  });

  test('a month boundary lands on a different instant per zone', () => {
    const at = new Date('2026-06-15T18:00:00Z');
    const toronto = startOfPeriodInZone('month', at, 'America/Toronto');
    const vancouver = startOfPeriodInZone('month', at, 'America/Vancouver');
    const hours = (toronto.getTime() - vancouver.getTime()) / 3_600_000;
    expect(hours).toBe(-3);
  });
});
