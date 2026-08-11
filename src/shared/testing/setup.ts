import { vi, afterAll } from 'vitest';

// Set required env vars before any module imports trigger env validation
process.env.NEXT_PUBLIC_AUTH0_AUDIENCE = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || 'test-audience';
process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL || 'https://test.auth0.com/';

/**
 * The operator write guard reads this at import time, so a developer who has a
 * real token in their .env would watch every write-route test 401 while CI,
 * which has no .env, stayed green. A suite whose result depends on whose laptop
 * it runs on is worse than no suite, so the guard is off by default here and
 * the tests that care about it set it explicitly.
 */
// Without this the suite emits ~100k characters of pool debug chatter, which
// pushes the failure summary out of anything that reads the tail of a run.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

process.env.OPERATOR_SERVICE_TOKEN = '';

// Mock the database pool so tests don't need a real DB connection
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  },
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
}));

afterAll(async () => {
  // Pool is mocked, but call end() for symmetry
  const { pool } = await import('../../config/database.js');
  await pool.end();
});
