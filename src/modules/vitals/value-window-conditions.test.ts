import { describe, expect, test } from 'vitest';
import {
  metricSampleFloor,
  plausibleValueCondition,
  recentWindowCondition,
  WINDOW_DAYS,
} from './repository.js';
import { PLAUSIBLE_MAX } from './types.js';

/**
 * The summary and by-page views aggregate a P75 over the whole table with no
 * time bound and no value bound, so one impossible sample - a background-tab
 * load reported as a multi-minute LCP - is a permanent member of the percentile
 * and never ages out. These two fragments are the fix: keep only plausible
 * values, and (for the current-health views) only recent rows. The SQL runs
 * against a real Postgres in sql-smoke.test.ts; this file pins the shape, which
 * is what CI can check without a database.
 */
describe('plausibleValueCondition', () => {
  test('bounds the value below zero and above a per-metric ceiling', () => {
    const sql = plausibleValueCondition();
    expect(sql).toMatch(/value\s*>=\s*0/);
    expect(sql).toMatch(/value\s*<=/);
  });

  test('uses the CLS ceiling for CLS and the timing ceiling otherwise', () => {
    const sql = plausibleValueCondition();
    expect(sql).toContain("metric = 'CLS'");
    expect(sql).toContain(String(PLAUSIBLE_MAX.cls));
    expect(sql).toContain(String(PLAUSIBLE_MAX.timing));
  });

  test('binds no parameters, so it composes into any read query', () => {
    // A static fragment keeps the callers' $n numbering untouched.
    expect(plausibleValueCondition()).not.toContain('$');
  });
});

describe('recentWindowCondition', () => {
  test('restricts to the last WINDOW_DAYS by default', () => {
    const sql = recentWindowCondition();
    expect(sql).toContain('created_at');
    expect(sql).toContain(`INTERVAL '${WINDOW_DAYS} days'`);
  });

  test('honours an explicit window', () => {
    expect(recentWindowCondition(7)).toContain("INTERVAL '7 days'");
  });

  test('only ever interpolates a whole number of days', () => {
    // days is an internal constant, but the fragment is interpolated into SQL,
    // so a fractional or junk value must never reach the string verbatim.
    expect(recentWindowCondition(28.9)).toContain("INTERVAL '28 days'");
  });
});

describe('metricSampleFloor', () => {
  test('drops a grouped metric below the sample floor', () => {
    const sql = metricSampleFloor(10);
    expect(sql).toMatch(/HAVING\s+COUNT\(\*\)\s*>=\s*10/);
  });

  test('binds no parameters, so it composes onto any GROUP BY', () => {
    expect(metricSampleFloor()).not.toContain('$');
  });

  test('only ever interpolates a whole number', () => {
    // The floor is an internal constant, but it is interpolated into SQL, so a
    // fractional or junk value must never reach the string verbatim.
    expect(metricSampleFloor(10.9)).toMatch(/>=\s*10\b/);
    expect(metricSampleFloor(-3)).toMatch(/>=\s*0\b/);
  });
});
