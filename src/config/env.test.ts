import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

describe('envSchema', () => {
  it('accepts a cron-only environment without Auth0 config', () => {
    // The reset-feature-flags cron runs as its own Railway service with only
    // DB + cron vars set (see README) — it must not require the web service's
    // Auth0 config, or importing the DB layer exits 1 before the job can run.
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    });

    expect(result.success).toBe(true);
  });

  it('still accepts a full web environment with Auth0 config', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
      NEXT_PUBLIC_AUTH0_AUDIENCE: 'https://api.example.com',
      NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL: 'https://tenant.auth0.com',
    });

    expect(result.success).toBe(true);
  });
});
