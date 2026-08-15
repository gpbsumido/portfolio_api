import { describe, expect, test } from 'vitest';
import { buildVersionConditions } from './repository.js';

/**
 * The version filter builds SQL that casts a slice of app_version to int, and
 * both sides of that cast can go wrong.
 *
 * The parameter side is what these tests cover: parseInt on a version that
 * isn't a number yields NaN, and pg refuses to bind NaN to an int comparison,
 * so ?v=dev&mode=major took the whole request down instead of returning
 * nothing. Everywhere else in this API a malformed query param quietly
 * produces an empty result rather than a 400 (?v=abc with no mode already
 * returns 200 with an empty summary), so the fix is to match nothing, not to
 * reject the request.
 *
 * The row side - a stored app_version Postgres cannot parse - can only really
 * be proved by Postgres. That lives in sql-smoke.test.ts, which runs when a
 * DATABASE_URL is present. What is checked here is that the emitted SQL never
 * casts a segment it hasn't first tested, so the guard can't be dropped
 * without a test going red in CI, where there is no database.
 */

function boundNaNs({ params }: { params: unknown[] }): unknown[] {
  return params.filter((p) => typeof p === 'number' && Number.isNaN(p));
}

describe('version filters survive input that is not a version', () => {
  test.each(['dev', 'v5.0.0', '', 'nightly'])(
    'major mode binds no NaN for %j',
    (v) => {
      expect(boundNaNs(buildVersionConditions(v, 'major'))).toEqual([]);
    },
  );

  test.each(['dev', '4', 'v5.0', '4.x'])('minor mode binds no NaN for %j', (v) => {
    expect(boundNaNs(buildVersionConditions(v, 'minor'))).toEqual([]);
  });

  test('a version that is not a number matches nothing rather than everything', () => {
    const { conditions, params } = buildVersionConditions('dev', 'major');

    // Whatever the fragment says, it must not be empty. An empty string would
    // drop the filter entirely and quietly widen the query to every version.
    expect(conditions.trim()).not.toBe('');
    expect(params).toEqual([]);
  });

  test('the minor filter keeps its own parameter numbering', () => {
    const { nextParam } = buildVersionConditions('4.11', 'minor', 1);

    expect(nextParam).toBe(3);
  });

  test('a filter that matches nothing still reports the parameters it used', () => {
    // getByPage appends its own $n after this one, so a fragment that binds no
    // parameters has to leave nextParam where it found it or the sample-count
    // placeholder points at the wrong slot.
    const { params, nextParam } = buildVersionConditions('dev', 'minor', 1);

    expect(nextParam).toBe(1 + params.length);
  });
});

describe('version filters never cast a segment they have not checked', () => {
  test('major guards the segment it casts', () => {
    const { conditions } = buildVersionConditions('4', 'major');

    expect(conditions).toMatch(/split_part\(app_version, '\.', 1\)\s*~/);
  });

  test('minor guards both segments it casts', () => {
    const { conditions } = buildVersionConditions('4.11', 'minor');

    expect(conditions).toMatch(/split_part\(app_version, '\.', 1\)\s*~/);
    expect(conditions).toMatch(/split_part\(app_version, '\.', 2\)\s*~/);
  });

  test('exact mode compares as text and needs no guard', () => {
    const { conditions, params } = buildVersionConditions('4.11.1', undefined);

    expect(conditions).not.toContain('::int');
    expect(params).toEqual(['4.11.1']);
  });
});
