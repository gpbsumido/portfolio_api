import { describe, test, expect } from 'vitest';
import { dbSslConfig, verifiesServer } from '../../utils/dbSsl.js';

const prod = { nodeEnv: 'production', caCert: undefined, rejectUnauthorized: undefined };

describe('dbSslConfig', () => {
  test('verifies the server when a CA is supplied', () => {
    const config = dbSslConfig({ ...prod, caCert: '-----BEGIN CERTIFICATE-----\nabc' });

    expect(verifiesServer(config)).toBe(true);
  });

  test('turns escaped newlines back into real ones', () => {
    const config = dbSslConfig({
      ...prod,
      caCert: '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----',
    });

    expect(config).not.toBe(false);
    expect((config as { ca: string }).ca).toContain('\n');
    expect((config as { ca: string }).ca).not.toContain('\\n');
  });

  test('honours an explicit opt-in when the chain is already trusted', () => {
    const config = dbSslConfig({ ...prod, rejectUnauthorized: 'true' });

    expect(verifiesServer(config)).toBe(true);
  });

  test('keeps the previous unverified behaviour in production when nothing is configured', () => {
    // Deliberate: this is what shipped, and failing closed here would take the
    // database down on deploy rather than fixing anything.
    const config = dbSslConfig(prod);

    expect(config).not.toBe(false);
    expect(verifiesServer(config)).toBe(false);
  });

  test('does not require TLS outside production', () => {
    expect(dbSslConfig({ ...prod, nodeEnv: 'development' })).toBe(false);
  });

  test('a CA wins over environment, so local can verify too', () => {
    const config = dbSslConfig({
      nodeEnv: 'development',
      caCert: '-----BEGIN CERTIFICATE-----\nabc',
      rejectUnauthorized: undefined,
    });

    expect(verifiesServer(config)).toBe(true);
  });

  test('whitespace-only CA is treated as absent', () => {
    expect(verifiesServer(dbSslConfig({ ...prod, caCert: '   ' }))).toBe(false);
  });
});
