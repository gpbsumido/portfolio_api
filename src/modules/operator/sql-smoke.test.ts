import 'dotenv/config';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * The operator aggregates, executed against a real Postgres.
 *
 * Every other test in this module mocks the repository, which is fast and keeps
 * CI free of a database — but it also means no SQL in this codebase is ever
 * parsed by Postgres before it reaches production. That gap shipped two broken
 * queries: making the time buckets timezone-aware left the GROUP BY repeating
 * an interpolated expression, Drizzle re-emitted it with different parameter
 * numbers, and Postgres rejected both as selecting an ungrouped column. The
 * unit tests were green throughout, because a mocked repository will happily
 * return rows for SQL no database would accept.
 *
 * So this file runs the real statements when a DATABASE_URL exists and skips
 * when one does not, which keeps CI unchanged while making the failure
 * reproducible for anyone with a database in front of them.
 *
 * Every query here is a SELECT. That matters because a developer's DATABASE_URL
 * often points at the deployed database, and a test suite that writes to it
 * would be a nasty surprise.
 */
// The shared setup mocks the database for every other file, which is the whole
// reason broken SQL was invisible. This file has to opt out of that.
beforeAll(() => {
  vi.doUnmock('../../config/database.js');
  vi.resetModules();
});

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!DATABASE_URL)('operator SQL against a real database', () => {
  const since = new Date(Date.now() - 86_400_000);

  test.each(['UTC', 'America/Toronto', 'America/St_Johns'])(
    'the hourly alert trend groups correctly in %s',
    async (zone) => {
      const { alertHourlyTrend } = await import('./repository.js');
      await expect(alertHourlyTrend(since, zone)).resolves.toBeDefined();
    },
  );

  test.each(['day', 'week', 'month', 'year'] as const)(
    'sales bucket by %s without an ungrouped-column error',
    async (granularity) => {
      const { salesByPeriod } = await import('./repository.js');
      await expect(
        salesByPeriod(granularity, since, 'America/Vancouver'),
      ).resolves.toBeDefined();
    },
  );

  test('the per-store sales ranking still runs', async () => {
    const { salesByStore } = await import('./repository.js');
    await expect(salesByStore(since)).resolves.toBeDefined();
  });

  test('the fleet stat rollups still run', async () => {
    const repo = await import('./repository.js');
    await expect(repo.alertStatsByStore()).resolves.toBeDefined();
    await expect(repo.inventoryStatsByStore()).resolves.toBeDefined();
  });

  test('promotion sales windows still run', async () => {
    const { listStores, salesInWindow } = await import('./repository.js');
    const stores = await listStores();
    if (stores.length === 0) return;
    await expect(
      salesInWindow(stores[0].id, since, new Date()),
    ).resolves.toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // The fleet aggregation endpoints
  // ---------------------------------------------------------------------------

  test('fleet sales totals (planner benchmarks) run', async () => {
    const { fleetSalesTotals } = await import('./repository.js');
    await expect(fleetSalesTotals()).resolves.toBeDefined();
  });

  test('product sales in window group without an ungrouped-column error', async () => {
    const { productSalesInWindow } = await import('./repository.js');
    await expect(productSalesInWindow(since)).resolves.toBeDefined();
  });

  test('distinct inventory products run', async () => {
    const { distinctInventoryProducts } = await import('./repository.js');
    await expect(distinctInventoryProducts()).resolves.toBeDefined();
  });

  test('completed restock lines join across sessions, stores and inventory', async () => {
    const { completedRestockLines } = await import('./repository.js');
    await expect(completedRestockLines()).resolves.toBeDefined();
  });

  test('weekly gross buckets group by the rolling-week ordinal', async () => {
    const { weeklyGrossBuckets } = await import('./repository.js');
    await expect(weeklyGrossBuckets(new Date(), 8)).resolves.toBeDefined();
  });
});
