const express = require("express");
const { pool } = require("../config/database");
const { checkJwt } = require("../middleware/auth");

const router = express.Router();

// only these five names are valid — anything else is a misconfigured reporter
const VALID_METRICS = new Set(["LCP", "CLS", "FCP", "INP", "TTFB"]);
const VALID_RATINGS = new Set(["good", "needs-improvement", "poor"]);

// pages with fewer than this many samples are excluded from the by-page breakdown
// to avoid one-visit noise skewing the numbers
const MIN_PAGE_SAMPLES = 5;

// POST /api/vitals
// open ingestion, no auth — vitals are non-sensitive and anonymous collection is fine
router.post("/", async (req, res) => {
  const { metric, value, rating, page, nav_type, app_version = "unknown" } = req.body;

  if (!metric || value === undefined || value === null || !rating || !page) {
    return res
      .status(400)
      .json({ error: "metric, value, rating, and page are required" });
  }

  if (!VALID_METRICS.has(metric)) {
    return res.status(400).json({
      error: `metric must be one of: ${[...VALID_METRICS].join(", ")}`,
    });
  }

  if (!VALID_RATINGS.has(rating)) {
    return res.status(400).json({
      error: `rating must be one of: ${[...VALID_RATINGS].join(", ")}`,
    });
  }

  if (typeof value !== "number") {
    return res.status(400).json({ error: "value must be a number" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO web_vitals (metric, value, rating, page, nav_type, app_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [metric, value, rating, page, nav_type ?? null, app_version],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /vitals failed:", err.message);
    res.status(500).json({ error: "Failed to store vital" });
  }
});

// GET /api/vitals/summary
// P75 value + rating distribution + total count per metric — auth required
// optional ?v=X.Y.Z filters to rows from that version onwards (semver-aware)
router.get("/summary", checkJwt, async (req, res) => {
  const { v } = req.query;
  // semver filter: cast "X.Y.Z" to int[] for correct ordering (e.g. 0.10.0 > 0.9.0)
  // unknown rows are pre-feature data and are excluded when a version filter is active
  const whereClause = v
    ? `WHERE app_version != 'unknown'
         AND string_to_array(app_version, '.')::int[] >= string_to_array($1, '.')::int[]`
    : "";
  const params = v ? [v] : [];

  try {
    const result = await pool.query(
      `SELECT
        metric,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        COUNT(*) FILTER (WHERE rating = 'good')              AS good,
        COUNT(*) FILTER (WHERE rating = 'needs-improvement') AS needs_improvement,
        COUNT(*) FILTER (WHERE rating = 'poor')              AS poor,
        COUNT(*)                                             AS total
      FROM web_vitals
      ${whereClause}
      GROUP BY metric`,
      params,
    );

    // pivot rows into { LCP: { p75, good, needsImprovement, poor, total }, ... }
    const summary = {};
    for (const row of result.rows) {
      summary[row.metric] = {
        p75: parseFloat(row.p75),
        good: parseInt(row.good, 10),
        needsImprovement: parseInt(row.needs_improvement, 10),
        poor: parseInt(row.poor, 10),
        total: parseInt(row.total, 10),
      };
    }

    res.json({ summary });
  } catch (err) {
    console.error("GET /vitals/summary failed:", err.message);
    res.status(500).json({ error: "Failed to fetch vitals summary" });
  }
});

// GET /api/vitals/by-page
// same aggregation but grouped by page first; pages under MIN_PAGE_SAMPLES are excluded
// so one-off visits don't show up as permanent data points — auth required
// optional ?v=X.Y.Z filters to rows from that version onwards (semver-aware)
router.get("/by-page", checkJwt, async (req, res) => {
  const { v } = req.query;
  const versionFilter = v
    ? `AND app_version != 'unknown'
       AND string_to_array(app_version, '.')::int[] >= string_to_array($1, '.')::int[]`
    : "";
  // MIN_PAGE_SAMPLES is $1 without a version, $2 with one
  const minSamplesParam = v ? "$2" : "$1";
  const params = v ? [v, MIN_PAGE_SAMPLES] : [MIN_PAGE_SAMPLES];

  try {
    const result = await pool.query(
      `
      WITH page_totals AS (
        SELECT page, COUNT(*) AS total
        FROM web_vitals
        WHERE TRUE ${versionFilter}
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
      WHERE TRUE ${versionFilter}
      GROUP BY w.page, w.metric, pt.total
      ORDER BY pt.total DESC, w.page, w.metric
      `,
      params,
    );

    // reshape flat rows into [{page, total, metrics: {LCP: {p75, count}, ...}}]
    // sorted by total samples so busiest pages come first
    const pageMap = {};
    for (const row of result.rows) {
      if (!pageMap[row.page]) {
        pageMap[row.page] = {
          page: row.page,
          total: parseInt(row.page_total, 10),
          metrics: {},
        };
      }
      pageMap[row.page].metrics[row.metric] = {
        p75: parseFloat(row.p75),
        count: parseInt(row.count, 10),
      };
    }

    res.json({ byPage: Object.values(pageMap) });
  } catch (err) {
    console.error("GET /vitals/by-page failed:", err.message);
    res.status(500).json({ error: "Failed to fetch vitals by page" });
  }
});

// GET /api/vitals/versions
// distinct app_version values, newest first by semver — auth required
// unknown rows are excluded (pre-feature data, not meaningful as a selectable version)
router.get("/versions", checkJwt, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT app_version
      FROM web_vitals
      WHERE app_version != 'unknown'
      ORDER BY string_to_array(app_version, '.')::int[] DESC
    `);
    res.json({ versions: result.rows.map((r) => r.app_version) });
  } catch (err) {
    console.error("GET /vitals/versions failed:", err.message);
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

module.exports = router;
