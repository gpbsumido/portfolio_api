import 'dotenv/config';
import { beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * The vitals version filters, executed by a real Postgres.
 *
 * Same gap as the operator smoke file: every other test here mocks the pool, and
 * a mocked pool will happily accept SQL no database would run. This one is
 * narrower than a syntax check though. `split_part(app_version, '.', 1)::int`
 * parses fine and runs fine, right up until it meets a row it cannot parse -
 * a dev build, a tagged 'v5.0.0', an empty string - and then the cast raises and
 * takes the whole query with it. One such row anywhere in the table was enough
 * to turn the summary, by-page and by-version endpoints into 500s for every
 * caller, which is the sort of thing only Postgres will tell you.
 *
 * Every statement here is a SELECT, for the same reason the operator file gives:
 * a DATABASE_URL on a laptop often points at the deployed database, and a suite
 * that writes to it would be a nasty surprise. So the unparseable versions come
 * from an inline VALUES list rather than from web_vitals. That gets the real
 * filter in front of a row it cannot parse without anyone having to store one,
 * and it means the test says the same thing on an empty database as on a full
 * one.
 */
beforeAll(() => {
  vi.doUnmock('../../config/database.js');
  vi.resetModules();
});

const DATABASE_URL = process.env.DATABASE_URL;

// No teardown here on purpose. This file borrows the app's own pool rather than
// building a second one, so it picks up whatever TLS the connection needs
// instead of restating it - and the shared setup already ends that pool once
// the file is done. Ending it here too is how you get "Called end on pool more
// than once", which fails the suite after every test in it has passed.

// Good versions mixed with the shapes that actually break the cast.
const SAMPLE = ['4.11.1', '4.9.0', '3.2.0', 'dev', 'v5.0.0', '', '4.x.1'];

const SAMPLE_RELATION = `(VALUES ${SAMPLE.map((_, i) => `($${i + 1}::varchar)`).join(', ')}) AS t(app_version)`;

async function selectSampleVersions(where: string, params: unknown[]): Promise<string[]> {
  const { pool } = await import('../../config/database.js');
  const result = await pool.query(
    `SELECT app_version FROM ${SAMPLE_RELATION} WHERE ${where}`,
    [...SAMPLE, ...params],
  );
  return result.rows.map((r) => r.app_version as string);
}

describe.skipIf(!DATABASE_URL)('vitals version SQL against a real database', () => {
  test('the major filter skips versions Postgres cannot parse', async () => {
    const { buildVersionConditions } = await import('./repository.js');
    const { conditions, params } = buildVersionConditions('4', 'major', SAMPLE.length + 1);

    // '4.x.1' belongs here: its major segment is 4, and major mode has no
    // business reading the segments after it.
    await expect(selectSampleVersions(`TRUE ${conditions}`, params)).resolves.toEqual([
      '4.11.1',
      '4.9.0',
      '4.x.1',
    ]);
  });

  test('the minor filter skips versions Postgres cannot parse', async () => {
    const { buildVersionConditions } = await import('./repository.js');
    const { conditions, params } = buildVersionConditions('4.11', 'minor', SAMPLE.length + 1);

    await expect(selectSampleVersions(`TRUE ${conditions}`, params)).resolves.toEqual(['4.11.1']);
  });

  test('an empty ?v filters nothing, the same as leaving it off', async () => {
    const { buildVersionConditions } = await import('./repository.js');
    const { conditions, params } = buildVersionConditions('', 'major', SAMPLE.length + 1);

    expect(conditions).toBe('');
    await expect(selectSampleVersions(`TRUE ${conditions}`, params)).resolves.toEqual(SAMPLE);
  });

  test.each(['dev', 'v5.0.0', 'nightly'])(
    'a filter built from %j returns nothing instead of raising',
    async (v) => {
      const { buildVersionConditions } = await import('./repository.js');
      const major = buildVersionConditions(v, 'major', SAMPLE.length + 1);
      const minor = buildVersionConditions(v, 'minor', SAMPLE.length + 1);

      await expect(selectSampleVersions(`TRUE ${major.conditions}`, major.params)).resolves.toEqual(
        [],
      );
      await expect(selectSampleVersions(`TRUE ${minor.conditions}`, minor.params)).resolves.toEqual(
        [],
      );
    },
  );

  test('the version sort survives a version that is not numeric', async () => {
    // getVersions and getByVersion order by string_to_array(...)::int[], which
    // raises on the same rows the filter does - and with no ?v at all, so those
    // two endpoints broke for every caller rather than only for a version query.
    const { SORTABLE_VERSION } = await import('./repository.js');

    await expect(
      selectSampleVersions(
        `${SORTABLE_VERSION} ORDER BY string_to_array(app_version, '.')::int[] DESC`,
        [],
      ),
    ).resolves.toEqual(['4.11.1', '4.9.0', '3.2.0']);
  });

  test('the real read queries still run against web_vitals', async () => {
    const { VitalsRepository } = await import('./repository.js');
    const repo = new VitalsRepository();

    await expect(repo.getSummary('4', 'major')).resolves.toBeDefined();
    await expect(repo.getByPage('4.11', 'minor')).resolves.toBeDefined();
    await expect(repo.getByVersion(undefined, undefined)).resolves.toBeDefined();
    await expect(repo.getVersions()).resolves.toBeDefined();
  });
});

describe.skipIf(!DATABASE_URL)('vitals value and window SQL against a real database', () => {
  test('the value bound keeps plausible samples and drops impossible ones', async () => {
    const { plausibleValueCondition } = await import('./repository.js');
    const { pool } = await import('../../config/database.js');

    // A real load timing, an impossible one, a real CLS, an impossible CLS, and
    // a negative. Only the two real ones survive - and the per-metric ceiling is
    // exercised, since a value of 50 is fine for a timing but garbage for CLS.
    const rows = `(VALUES
      ('LCP'::varchar, 1200::float8),
      ('LCP', 999999),
      ('CLS', 0.1),
      ('CLS', 50),
      ('FCP', -5)
    ) AS t(metric, value)`;
    const result = await pool.query(
      `SELECT metric, value FROM ${rows} WHERE TRUE ${plausibleValueCondition()} ORDER BY metric, value`,
    );

    expect(result.rows.map((r) => [r.metric, Number(r.value)])).toEqual([
      ['CLS', 0.1],
      ['LCP', 1200],
    ]);
  });

  test('the recent window keeps rows inside it and drops older ones', async () => {
    const { recentWindowCondition } = await import('./repository.js');
    const { pool } = await import('../../config/database.js');

    const rows = `(VALUES
      ('recent'::varchar, NOW() - INTERVAL '1 day'),
      ('old', NOW() - INTERVAL '400 days')
    ) AS t(label, created_at)`;
    const result = await pool.query(
      `SELECT label FROM ${rows} WHERE TRUE ${recentWindowCondition()} ORDER BY label`,
    );

    expect(result.rows.map((r) => r.label)).toEqual(['recent']);
  });
});

describe.skipIf(!DATABASE_URL)('by-page per-metric sample floor against a real database', () => {
  // A page can clear the page-total floor while one of its metrics has only a
  // handful of samples. A P75 over three samples is two slow phones and a
  // guess, and on the dashboard it reads as a real Poor-band score. This is the
  // page /research hit: its CLS cell showed 0.716 off a sample count too small
  // to trust. The floor is per metric so the trustworthy cells on a page stay
  // and only the thin ones drop.
  const PAGE = '/__sample_floor_probe__';

  async function seed(): Promise<void> {
    const { pool } = await import('../../config/database.js');
    await pool.query('DELETE FROM web_vitals WHERE page = $1', [PAGE]);
    // MIN_METRIC_SAMPLES is 10: LCP clears it with 12, CLS falls short at 3.
    const rows: string[] = [];
    const params: unknown[] = [PAGE];
    for (let i = 0; i < 12; i++) {
      params.push('LCP', 1200 + i, 'good');
      const b = params.length;
      rows.push(`($1, $${b - 2}, $${b - 1}, $${b}, 'navigate', '4.16.2')`);
    }
    for (let i = 0; i < 3; i++) {
      params.push('CLS', 0.05, 'good');
      const b = params.length;
      rows.push(`($1, $${b - 2}, $${b - 1}, $${b}, 'navigate', '4.16.2')`);
    }
    await pool.query(
      `INSERT INTO web_vitals (page, metric, value, rating, nav_type, app_version)
       VALUES ${rows.join(', ')}`,
      params,
    );
  }

  async function cleanup(): Promise<void> {
    const { pool } = await import('../../config/database.js');
    await pool.query('DELETE FROM web_vitals WHERE page = $1', [PAGE]);
  }

  test('a metric below the floor is dropped while a metric above it stays', async () => {
    const { VitalsRepository } = await import('./repository.js');
    await seed();
    try {
      const byPage = await new VitalsRepository().getByPage(undefined, undefined);
      const probe = byPage.find((p) => p.page === PAGE);

      expect(probe).toBeDefined();
      expect(probe?.metrics.LCP).toBeDefined();
      expect(probe?.metrics.CLS).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});
