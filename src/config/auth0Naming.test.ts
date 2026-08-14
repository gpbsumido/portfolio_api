import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Auth0 config is read from names without the NEXT_PUBLIC_ prefix.
 *
 * That prefix is a Next.js build-time convention meaning "inline this into the
 * browser bundle". Express has never heard of it, so wearing it here was wrong
 * rather than dangerous — the danger is the copy. The moment one of those names
 * is pasted into the frontend's environment, everything under the prefix ships
 * to every visitor, and a name that already exists somewhere is exactly the
 * kind of thing that gets pasted.
 *
 * The old names are still accepted so a deploy can be renamed without a window
 * where the API cannot validate a token. This asserts the new ones are what the
 * code actually prefers, and that the fallback stays a fallback.
 */
const CONFIG = join(process.cwd(), 'src', 'config');

const auth = readFileSync(join(CONFIG, 'auth.ts'), 'utf8');

describe('Auth0 environment naming', () => {
  test('prefers the unprefixed names', () => {
    expect(auth).toMatch(/env\.AUTH0_AUDIENCE\s*\?\?/);
    expect(auth).toMatch(/env\.AUTH0_ISSUER_BASE_URL\s*\?\?/);
  });

  test('still falls back to the old ones, so a rename needs no downtime', () => {
    expect(auth).toContain('env.NEXT_PUBLIC_AUTH0_AUDIENCE');
    expect(auth).toContain('env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL');
  });

  test('tells you the correct names when the config is missing', () => {
    // The error message is the one place someone reads a variable name and
    // then types it, so it must not teach the prefixed form.
    const message = /Auth0 config missing: set ([^']+)'/.exec(auth)?.[1] ?? '';
    expect(message).toContain('AUTH0_AUDIENCE');
    expect(message).not.toContain('NEXT_PUBLIC_');
  });

  test('.env.example documents the unprefixed names', () => {
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    expect(example).toMatch(/^AUTH0_AUDIENCE=/m);
    expect(example).toMatch(/^AUTH0_ISSUER_BASE_URL=/m);
    // The prefixed pair must not reappear as something to copy.
    expect(example).not.toMatch(/^NEXT_PUBLIC_AUTH0_/m);
  });
});
