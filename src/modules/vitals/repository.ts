import { pool } from '../../config/database.js';
import type {
  VitalRow,
  MetricSummary,
  PageMetrics,
  VersionMetrics,
  VersionConditions,
} from './types.js';

const VALID_METRICS = new Set(['LCP', 'CLS', 'FCP', 'INP', 'TTFB']);
const VALID_RATINGS = new Set(['good', 'needs-improvement', 'poor']);
const MIN_PAGE_SAMPLES = 5;

export { VALID_METRICS, VALID_RATINGS };

export function buildVersionConditions(
  v: string | undefined,
  mode: string | undefined,
  startParam = 1,
): VersionConditions {
  if (!v) return { conditions: '', params: [], nextParam: startParam };

  if (mode === 'major') {
    return {
      conditions: `AND app_version != 'unknown'
         AND split_part(app_version, '.', 1)::int = $${startParam}`,
      params: [parseInt(v, 10)],
      nextParam: startParam + 1,
    };
  }

  if (mode === 'minor') {
    const parts = v.split('.');
    return {
      conditions: `AND app_version != 'unknown'
         AND split_part(app_version, '.', 1)::int = $${startParam}
         AND split_part(app_version, '.', 2)::int = $${startParam + 1}`,
      params: [parseInt(parts[0], 10), parseInt(parts[1], 10)],
      nextParam: startParam + 2,
    };
  }

  return {
    conditions: `AND app_version = $${startParam}`,
    params: [v],
    nextParam: startParam + 1,
  };
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
      WHERE TRUE ${conditions}
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
        WHERE TRUE ${conditions}
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
      WHERE TRUE ${conditions}
      GROUP BY w.page, w.metric, pt.total
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
      WHERE app_version != 'unknown' ${conditions}
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
      WHERE app_version = ANY($1)
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
      WHERE app_version != 'unknown'
      GROUP BY app_version
      ORDER BY string_to_array(app_version, '.')::int[] DESC
    `);
    return result.rows.map((r: any) => r.app_version as string);
  }
}
