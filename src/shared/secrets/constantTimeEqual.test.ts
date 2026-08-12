import { describe, test, expect } from 'vitest';
import { constantTimeEqual, bearerMatches } from './constantTimeEqual.js';

describe('constantTimeEqual', () => {
  test('matches identical secrets', () => {
    expect(constantTimeEqual('s3cret', 's3cret')).toBe(true);
  });

  test('rejects a different secret of the same length', () => {
    expect(constantTimeEqual('s3cret', 's3crXt')).toBe(false);
  });

  test('rejects a correct prefix, which is what a timing leak would reveal', () => {
    expect(constantTimeEqual('s3c', 's3cret')).toBe(false);
  });

  test('does not throw on a length mismatch', () => {
    expect(() => constantTimeEqual('a', 'aaaaaaaaaa')).not.toThrow();
  });

  test('treats a missing value as no match rather than a match', () => {
    expect(constantTimeEqual(undefined, 's3cret')).toBe(false);
    expect(constantTimeEqual('s3cret', undefined)).toBe(false);
    expect(constantTimeEqual('', '')).toBe(false);
    expect(constantTimeEqual(undefined, undefined)).toBe(false);
  });
});

describe('bearerMatches', () => {
  test('matches a correct bearer header', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
  });

  test('rejects the wrong secret', () => {
    expect(bearerMatches('Bearer nope!!', 's3cret')).toBe(false);
  });

  test('rejects a header with no Bearer prefix', () => {
    expect(bearerMatches('s3cret', 's3cret')).toBe(false);
  });

  test('rejects when no secret is configured, rather than matching nothing', () => {
    expect(bearerMatches('Bearer anything', undefined)).toBe(false);
    expect(bearerMatches(undefined, 's3cret')).toBe(false);
  });
});
