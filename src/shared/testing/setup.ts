import { vi, afterAll } from 'vitest';

// Set required env vars before any module imports trigger env validation
process.env.NEXT_PUBLIC_AUTH0_AUDIENCE = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || 'test-audience';
process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL || 'https://test.auth0.com/';

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
