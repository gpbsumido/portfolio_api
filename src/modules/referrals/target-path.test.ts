import { describe, test, expect } from 'vitest';
import { createReferralSchema } from './schemas.js';

const parse = (targetPath: string) =>
  createReferralSchema.safeParse({ targetPath }).success;

describe('referral targetPath', () => {
  test('accepts an ordinary site path', () => {
    expect(parse('/work-portfolio')).toBe(true);
    expect(parse('/thoughts/security')).toBe(true);
    expect(parse('/nba?tab=picks')).toBe(true);
  });

  test('rejects a protocol-relative URL', () => {
    // startsWith('/') alone lets this through, and once the frontend resolves
    // it the visitor leaves the site entirely -- having arrived on a link that
    // looked like ours.
    expect(parse('//evil.example')).toBe(false);
    expect(parse('//evil.example/login')).toBe(false);
  });

  test('rejects a backslash variant, which some clients normalise to //', () => {
    expect(parse('/\\evil.example')).toBe(false);
    expect(parse('\\\\evil.example')).toBe(false);
  });

  test('rejects an absolute URL', () => {
    expect(parse('https://evil.example')).toBe(false);
  });

  test('rejects a scheme smuggled into the path', () => {
    expect(parse('/javascript:alert(1)')).toBe(false);
  });
});
