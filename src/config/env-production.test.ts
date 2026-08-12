import { describe, test, expect, afterEach } from 'vitest';
import { requireServiceToken } from '../modules/operator/service-token.js';

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

/**
 * The operator guard skips itself when no secret is configured, which keeps a
 * fresh clone working but means a dropped variable silently disables the check
 * on every operator write. The cron service boots with DB vars only, so this
 * can't live in the env schema — it belongs where the web service builds the
 * guard, the same way auth.ts throws for missing Auth0 config.
 */
describe('operator service token in production', () => {
  test('building the guard without a secret throws in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => requireServiceToken(undefined)).toThrow(/OPERATOR_SERVICE_TOKEN/);
  });

  test('a blank secret is treated as missing', () => {
    process.env.NODE_ENV = 'production';

    expect(() => requireServiceToken('   ')).toThrow(/OPERATOR_SERVICE_TOKEN/);
  });

  test('a real secret builds fine in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => requireServiceToken('a-real-secret')).not.toThrow();
  });

  test('development still builds without a secret', () => {
    process.env.NODE_ENV = 'development';

    expect(() => requireServiceToken(undefined)).not.toThrow();
  });
});
