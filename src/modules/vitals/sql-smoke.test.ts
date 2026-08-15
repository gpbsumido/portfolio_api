import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

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

afterAll(async () => {
  if (!DATABASE_URL) return;
  const { pool } = await import('../../config/database.js');
  await pool.end();
});

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

    await expect(selectSampleVersions(`TRUE ${conditions}`, params)).resolves.toEqual([
      '4.11.1',
      '4.9.0',
    ]);
  });

  test('the minor filter skips versions Postgres cannot parse', async () => {
    const { buildVersionConditions } = await import('./repository.js');
    const { conditions, params } = buildVersionConditions('4.11', 'minor', SAMPLE.length + 1);

    await expect(selectSampleVersions(`TRUE ${conditions}`, params)).resolves.toEqual(['4.11.1']);
  });

  test.each(['dev', 'v5.0.0', ''])(
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
