import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * Calendar is the one module on Knex, and it built its own connection: its own
 * TLS rule that never verified the server and ignored DB_CA_CERT, and a pool
 * that held two connections open from boot. Everything else goes through
 * config/pool.js, which is where the TLS decision is supposed to live.
 */
const originalCaCert = process.env.DB_CA_CERT;

afterEach(() => {
  if (originalCaCert === undefined) delete process.env.DB_CA_CERT;
  else process.env.DB_CA_CERT = originalCaCert;
  vi.resetModules();
});

async function loadWithCaCert(caCert: string) {
  process.env.DB_CA_CERT = caCert;
  vi.resetModules();
  const shared = await import('../../../config/pool.js');
  const { db } = await import('./repository.js');
  return { sharedSsl: shared.ssl, knexConfig: db.client.config };
}

describe("calendar's database connection", () => {
  test('verifies the server with the same CA as the shared pool', async () => {
    const { sharedSsl, knexConfig } = await loadWithCaCert('-----BEGIN CERTIFICATE-----test');

    expect(sharedSsl).toMatchObject({ rejectUnauthorized: true });
    expect(knexConfig.connection.ssl).toEqual(sharedSsl);
  });

  test('holds no idle connections open from boot', async () => {
    const { knexConfig } = await loadWithCaCert('-----BEGIN CERTIFICATE-----test');

    expect(knexConfig.pool.min).toBe(0);
  });
});
