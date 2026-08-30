import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { deriveCode, PERIOD_SECONDS, verifyCode, windowAt } from './codes.js';

/**
 * The codes are the whole security story: possessing one is meant to be
 * evidence of having stood in front of the display in the last couple of
 * minutes. These tests pin the properties that claim depends on.
 */
const SALT = 'site-salt-aaa';
const OTHER_SALT = 'site-salt-bbb';

// A fixed instant so the window arithmetic is exact rather than clock-dependent.
const AT = Date.UTC(2026, 7, 30, 9, 0, 0);

const originalSecret = process.env.CHECKIN_CODE_SECRET;

beforeEach(() => {
  process.env.CHECKIN_CODE_SECRET = 'test-secret-not-a-real-one';
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CHECKIN_CODE_SECRET;
  else process.env.CHECKIN_CODE_SECRET = originalSecret;
});

describe('windowAt', () => {
  test('holds steady inside one period and advances at the boundary', () => {
    const start = windowAt(AT);
    expect(windowAt(AT + (PERIOD_SECONDS - 1) * 1000)).toBe(start);
    expect(windowAt(AT + PERIOD_SECONDS * 1000)).toBe(start + 1);
  });
});

describe('deriveCode', () => {
  test('is six digits', () => {
    expect(deriveCode(SALT, windowAt(AT))).toMatch(/^\d{6}$/);
  });

  test('keeps leading zeros rather than shortening the code', () => {
    // Whichever window happens to produce a small number must still render six
    // characters, or a volunteer types five and is told they are wrong.
    const codes = Array.from({ length: 500 }, (_, i) => deriveCode(SALT, i));
    codes.forEach((code) => {
      expect(code).toHaveLength(6);
    });
  });

  test('is stable for the same site and window', () => {
    expect(deriveCode(SALT, 100)).toBe(deriveCode(SALT, 100));
  });

  test('differs across windows, so an old code cannot be replayed', () => {
    expect(deriveCode(SALT, 100)).not.toBe(deriveCode(SALT, 101));
  });

  test('differs across sites, so one site cannot check in another', () => {
    expect(deriveCode(SALT, 100)).not.toBe(deriveCode(OTHER_SALT, 100));
  });
});

describe('verifyCode', () => {
  test('accepts the code currently on the display', () => {
    const code = deriveCode(SALT, windowAt(AT));
    expect(verifyCode({ salt: SALT, code, atMs: AT })).toBe(windowAt(AT));
  });

  test('still accepts the previous code, because typing takes time', () => {
    const previous = deriveCode(SALT, windowAt(AT) - 1);
    expect(verifyCode({ salt: SALT, code: previous, atMs: AT })).toBe(windowAt(AT) - 1);
  });

  test('rejects the code from two windows ago', () => {
    const stale = deriveCode(SALT, windowAt(AT) - 2);
    expect(verifyCode({ salt: SALT, code: stale, atMs: AT })).toBeNull();
  });

  test('rejects a code from the future', () => {
    const ahead = deriveCode(SALT, windowAt(AT) + 1);
    expect(verifyCode({ salt: SALT, code: ahead, atMs: AT })).toBeNull();
  });

  test('rejects another site s current code', () => {
    const elsewhere = deriveCode(OTHER_SALT, windowAt(AT));
    expect(verifyCode({ salt: SALT, code: elsewhere, atMs: AT })).toBeNull();
  });

  test('rejects malformed input without throwing', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 34 56']) {
      expect(verifyCode({ salt: SALT, code, atMs: AT })).toBeNull();
    }
  });

  test('refuses to run at all when no secret is configured', () => {
    delete process.env.CHECKIN_CODE_SECRET;
    // Failing closed matters more than a helpful message: a derivable code with
    // an empty key would look like it worked while proving nothing.
    expect(() => deriveCode(SALT, 1)).toThrow();
  });
});
