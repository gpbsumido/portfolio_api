import { pool } from '../../config/database.js';
import { PLAUSIBLE_MAX } from './types.js';
import type {
  VitalRow,
  MetricSummary,
  PageMetrics,
  VersionMetrics,
  VersionConditions,
} from './types.js';

const VALID_METRICS = new Set(['LCP', 'CLS', 'FCP', 'INP', 'TTFB']);
const VALID_RATINGS = new Set(['good', 'needs-improvement', 'poor']);
const MIN_PAGE_SAMPLES = 10;

/**
 * Fewest samples a single metric on a page needs before its P75 is trustworthy
 * enough to show. The page floor above counts every metric together, so a page
 * can clear it while one metric has three samples - and a P75 over three
 * samples is two slow phones and a guess. This floor is per metric, so the
 * cells with real data survive and only the thin ones drop.
 */
const MIN_METRIC_SAMPLES = 10;

export { VALID_METRICS, VALID_RATINGS };

/**
 * Versions whose every segment is a number, so string_to_array(...)::int[] can
 * sort them. Anything else raises out of the cast and fails the statement, and
 * because that cast sits in an ORDER BY it does so with no version filter in
 * play at all. Whatever is written into app_version, one row of it must not be
 * able to take an endpoint down.
 */
export const SORTABLE_VERSION = "app_version ~ '^[0-9]+([.][0-9]+)*$'";

/**
 * The same check for one segment of a version, for the filters that cast a
 * segment rather than the whole string.
 *
 * @param index 1-based segment position, matching split_part
 */
function segmentIsNumeric(index: number): string {
  return `split_part(app_version, '.', ${index}) ~ '^[0-9]+$'`;
}

// A bad version matches nothing rather than raising, and rather than dropping
// the filter and quietly returning every version instead of none.
const MATCHES_NOTHING = 'AND FALSE';

/**
 * SQL to narrow web_vitals to one version, exact or by major/minor prefix.
 *
 * A version that isn't a number can arrive from either side: stored in the
 * column, or passed as ?v. Both used to reach the ::int cast, which raises for
 * the whole statement. So the SQL checks a segment before casting it, and a ?v
 * that isn't a number matches nothing - which is what a malformed query param
 * already does on these endpoints.
 *
 * @param v version to filter on, or undefined for no filter
 * @param mode 'major', 'minor', or anything else for an exact match
 * @param startParam 1-based placeholder number to start from
 */
export function buildVersionConditions(
  v: string | undefined,
  mode: string | undefined,
  startParam = 1,
): VersionConditions {
  if (!v) return { conditions: '', params: [], nextParam: startParam };

  if (mode === 'major') {
    const major = Number.parseInt(v, 10);
    if (Number.isNaN(major)) {
      return { conditions: MATCHES_NOTHING, params: [], nextParam: startParam };
    }
    return {
      conditions: `AND app_version != 'unknown'
         AND ${segmentIsNumeric(1)}
         AND split_part(app_version, '.', 1)::int = $${startParam}`,
      params: [major],
      nextParam: startParam + 1,
    };
  }

  if (mode === 'minor') {
    const parts = v.split('.');
    const major = Number.parseInt(parts[0], 10);
    const minor = Number.parseInt(parts[1], 10);
    if (Number.isNaN(major) || Number.isNaN(minor)) {
      return { conditions: MATCHES_NOTHING, params: [], nextParam: startParam };
    }
    return {
      conditions: `AND app_version != 'unknown'
         AND ${segmentIsNumeric(1)}
         AND ${segmentIsNumeric(2)}
         AND split_part(app_version, '.', 1)::int = $${startParam}
         AND split_part(app_version, '.', 2)::int = $${startParam + 1}`,
      params: [major, minor],
      nextParam: startParam + 2,
    };
  }

  return {
    conditions: `AND app_version = $${startParam}`,
    params: [v],
    nextParam: startParam + 1,
  };
}

/**
 * WHERE fragment keeping only physically-plausible samples. CLS is a unitless
 * score, the other four are milliseconds, so the ceiling is chosen per row by
 * metric. Static SQL with no parameters, so it drops into any read query
 * without disturbing the caller's $n numbering. This is what stops one
 * impossible value (a background-tab load reported as a multi-minute LCP) from
 * living in a percentile forever, given the table is aggregated with no bound.
 */
export function plausibleValueCondition(): string {
  return `AND value >= 0
     AND value <= CASE WHEN metric = 'CLS' THEN ${PLAUSIBLE_MAX.cls} ELSE ${PLAUSIBLE_MAX.timing} END`;
}

/** Days of history the current-health views (summary, by-page) aggregate. */
export const WINDOW_DAYS = 28;

/**
 * WHERE fragment restricting to the recent window. The summary and by-page
 * views answer "how is the site doing now", so they read the last WINDOW_DAYS
 * rather than the whole table - otherwise a P75 computed over years of rows can
 * never reflect a fix that shipped last week. by-version keeps full history on
 * purpose, to compare releases. `days` is an internal constant but is
 * interpolated into SQL, so it is floored to a whole number as a guard.
 */
export function recentWindowCondition(days: number = WINDOW_DAYS): string {
  const whole = Math.max(0, Math.trunc(days));
  return `AND created_at >= NOW() - INTERVAL '${whole} days'`;
}

/**
 * HAVING fragment dropping a grouped metric that hasn't got enough samples to
 * trust its percentile. Interpolates a whole-number floor with no parameter, so
 * it drops onto a GROUP BY without disturbing the caller's $n numbering - the
 * same shape as recentWindowCondition. `min` is an internal constant but is
 * interpolated into SQL, so it is floored to a whole number as a guard.
 */
export function metricSampleFloor(min: number = MIN_METRIC_SAMPLES): string {
  const whole = Math.max(0, Math.trunc(min));
  return `HAVING COUNT(*) >= ${whole}`;
}

export class VitalsRepository {
  async insert(input: {
    metric: string;
    value: number;
    rating: string;
    page: string;
    nav_type: string | null;
    app_version: string;
  }): Promise<VitalRow> {
    const result = await pool.query<VitalRow>(
      `INSERT INTO web_vitals (metric, value, rating, page, nav_type, app_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.metric, input.value, input.rating, input.page, input.nav_type, input.app_version],
    );
    return result.rows[0];
  }

  async getSummary(
    v: string | undefined,
    mode: string | undefined,
  ): Promise<Record<string, MetricSummary>> {
    const { conditions, params } = buildVersionConditions(v, mode);

    const result = await pool.query(
      `SELECT
        metric,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        COUNT(*) FILTER (WHERE rating = 'good')              AS good,
        COUNT(*) FILTER (WHERE rating = 'needs-improvement') AS needs_improvement,
        COUNT(*) FILTER (WHERE rating = 'poor')              AS poor,
        COUNT(*)                                             AS total
      FROM web_vitals
      WHERE TRUE ${conditions} ${plausibleValueCondition()} ${recentWindowCondition()}
      GROUP BY metric`,
      params,
    );

    const summary: Record<string, MetricSummary> = {};
    for (const row of result.rows) {
      summary[row.metric as string] = {
        p75: parseFloat(row.p75 as string),
        good: parseInt(row.good as string, 10),
        needsImprovement: parseInt(row.needs_improvement as string, 10),
        poor: parseInt(row.poor as string, 10),
        total: parseInt(row.total as string, 10),
      };
    }
    return summary;
  }

  async getByPage(
    v: string | undefined,
    mode: string | undefined,
  ): Promise<PageMetrics[]> {
    const {
      conditions,
      params: versionParams,
      nextParam,
    } = buildVersionConditions(v, mode);
    const minSamplesParam = `$${nextParam}`;
    const params = [...versionParams, MIN_PAGE_SAMPLES];

    const result = await pool.query(
      `
      WITH page_totals AS (
        SELECT page, COUNT(*) AS total
        FROM web_vitals
        WHERE TRUE ${conditions} ${plausibleValueCondition()} ${recentWindowCondition()}
        GROUP BY page
        HAVING COUNT(*) >= ${minSamplesParam}
      )
      SELECT
        w.page,
        w.metric,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY w.value) AS p75,
        COUNT(*)                                               AS count,
        pt.total                                               AS page_total
      FROM web_vitals w
      JOIN page_totals pt ON pt.page = w.page
      WHERE TRUE ${conditions} ${plausibleValueCondition()} ${recentWindowCondition()}
      GROUP BY w.page, w.metric, pt.total
      ${metricSampleFloor()}
      ORDER BY pt.total DESC, w.page, w.metric
      `,
      params,
    );

    const pageMap: Record<string, PageMetrics> = {};
    for (const row of result.rows) {
      const page = row.page as string;
      if (!pageMap[page]) {
        pageMap[page] = {
          page,
          total: parseInt(row.page_total as string, 10),
          metrics: {},
        };
      }
      pageMap[page].metrics[row.metric as string] = {
        p75: parseFloat(row.p75 as string),
        count: parseInt(row.count as string, 10),
      };
    }

    return Object.values(pageMap);
  }

  async getByVersion(
    v: string | undefined,
    mode: string | undefined,
  ): Promise<VersionMetrics[]> {
    const { conditions, params } = buildVersionConditions(v, mode);
    const limit = mode === 'minor' ? 30 : 10;

    const versionsResult = await pool.query(
      `
      SELECT app_version
      FROM web_vitals
      WHERE app_version != 'unknown' AND ${SORTABLE_VERSION} ${conditions}
      GROUP BY app_version
      ORDER BY string_to_array(app_version, '.')::int[] DESC
      LIMIT ${limit}
    `,
      params,
    );
    const versions = versionsResult.rows.map((r: any) => r.app_version as string);
    if (versions.length === 0) return [];

    const result = await pool.query(
      `SELECT
        app_version,
        metric,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        COUNT(*) AS total
      FROM web_vitals
      WHERE app_version = ANY($1) ${plausibleValueCondition()}
      GROUP BY app_version, metric`,
      [versions],
    );

    const versionMap: Record<string, VersionMetrics> = {};
    for (const row of result.rows) {
      const ver = row.app_version as string;
      if (!versionMap[ver]) {
        versionMap[ver] = { version: ver, metrics: {} };
      }
      versionMap[ver].metrics[row.metric as string] = {
        p75: parseFloat(row.p75 as string),
        total: parseInt(row.total as string, 10),
      };
    }

    return versions
      .slice()
      .reverse()
      .map((ver) => versionMap[ver])
      .filter(Boolean);
  }

  async getVersions(): Promise<string[]> {
    const result = await pool.query(`
      SELECT app_version
      FROM web_vitals
      WHERE app_version != 'unknown' AND ${SORTABLE_VERSION}
      GROUP BY app_version
      ORDER BY string_to_array(app_version, '.')::int[] DESC
    `);
    return result.rows.map((r: any) => r.app_version as string);
  }
}
