# Plan — Operator fleet aggregation endpoints (portfolio_api)

The paul-explore operator dashboard grew five features whose BFF aggregations
read the in-memory seed and never call this service. This adds the real SQL
endpoints so the BFF's live path returns real data. One cohesive PR: the five
endpoints share `routes.ts`, `controller.ts`, `repository.ts`, so stacking them
would only create conflicts.

## Endpoints (all GET, read-limiter, unauthenticated like the other reads)

| Path | Response | Source |
|------|----------|--------|
| `/api/operator/planner/benchmarks` | `{ benchmarks: {avgItemPrice, itemsPerOrder, sampleSize} \| null }` | fleet sales totals |
| `/api/operator/product-performance?range=7d\|30d\|90d` | `{ rangeId, days, products: Row[] }` | sales grouped by product in window + inventory products |
| `/api/operator/shrink-summary` | `{ stores: StoreShrink[], totals: ShrinkSummary }` | completed restock lines × inventory price × store |
| `/api/operator/search-index` | `{ stores: {id,name,status}[], products: {name,category}[] }` | stores + distinct inventory products |
| `/api/operator/finance` | `{ weeks: PayoutWeek[], totals, fees }` | sales bucketed into rolling 7-day windows |

## Where the work goes

- **`repository.ts`** — one grouped SQL query per endpoint, mirroring the proven
  patterns (`salesByStore` left-join-group, `filter (where …)`, `coalesce(…,0)::float8`,
  `GROUP BY` by ordinal, `date_trunc … AT TIME ZONE`):
  - `fleetSalesTotals()` → `{revenue, units, txns}`
  - `productSalesInWindow(since)` → `{productName, category, units, revenue}[]`
  - `distinctInventoryProducts()` → `{productName, category}[]`
  - `completedRestockLines()` → `{storeId, storeName, expectedQty, countedQty, removed, removalReason, price}[]`
  - `weeklyGrossBuckets(now, weeks)` → `{bucket, gross, txns}[]` (rolling 7-day via epoch/floor)
- **`aggregations.ts`** (new, pure) — mirrors the frontend's pure models so the
  numbers match: product-performance (category-relative index, avgPerDay, ranking),
  shrink (unexplained vs explained, coverage), finance (weekly payouts + FEE_MODEL).
  Pure + clock-injectable, unit-tested without a DB.
- **`controller.ts`** — five methods wiring repo → pure → DTO.
- **`routes.ts`** — five GET routes with `readLimiter`.
- **`types.ts`** — the new DTOs.

## Fee model

Duplicated deliberately (same call the promotions arithmetic already makes across
the two repos): `FEE_MODEL = { transactionRate: 0.04, transactionFlat: 0.10,
platformPerUnitMonthly: 60 }`, matching paul-explore's `operator-planner`/`operator-finance`.

## Tests

- **`operator.test.ts`** — add the five repo fns to the `vi.mock` object; a
  describe block per endpoint asserting the DTO shape from mocked repo rows
  (controller + routing + pure, no DB — this is the CI gate).
- **`aggregations.test.ts`** (new) — the pure helpers, hand-checkable numbers,
  mirroring the frontend's model tests.
- **`sql-smoke.test.ts`** — add the five real SELECTs (skips without DATABASE_URL;
  runs in the frontend's live-backend CI, which builds this branch from source).

## Contract parity

The response shapes match paul-explore's Zod schemas exactly
(`plannerBenchmarksResponseSchema`, `productPerformanceResponseSchema`,
`fleetShrinkResponseSchema`, `searchIndexResponseSchema`, `financeResponseSchema`),
so the BFF `getJson(path, schema)` validates without drift.

## Out of scope

No new tables/migrations — every endpoint reads existing tables
(operator_sales, operator_inventory, operator_stores, operator_restock_*).
