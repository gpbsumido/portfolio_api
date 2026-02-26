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
  const { metric, value, rating, page, nav_type } = req.body;

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
      `INSERT INTO web_vitals (metric, value, rating, page, nav_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [metric, value, rating, page, nav_type ?? null],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /vitals failed:", err.message);
    res.status(500).json({ error: "Failed to store vital" });
  }
});

// GET /api/vitals/summary
// P75 value + rating distribution + total count per metric — auth required
router.get("/summary", checkJwt, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        metric,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        COUNT(*) FILTER (WHERE rating = 'good')              AS good,
        COUNT(*) FILTER (WHERE rating = 'needs-improvement') AS needs_improvement,
        COUNT(*) FILTER (WHERE rating = 'poor')              AS poor,
        COUNT(*)                                             AS total
      FROM web_vitals
      GROUP BY metric
    `);

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
router.get("/by-page", checkJwt, async (req, res) => {
  try {
    const result = await pool.query(
      `
      WITH page_totals AS (
        SELECT page, COUNT(*) AS total
        FROM web_vitals
        GROUP BY page
        HAVING COUNT(*) >= $1
      )
      SELECT
        w.page,
        w.metric,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY w.value) AS p75,
        COUNT(*)                                               AS count,
        pt.total                                               AS page_total
      FROM web_vitals w
      JOIN page_totals pt ON pt.page = w.page
      GROUP BY w.page, w.metric, pt.total
      ORDER BY pt.total DESC, w.page, w.metric
      `,
      [MIN_PAGE_SAMPLES],
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

module.exports = router;
