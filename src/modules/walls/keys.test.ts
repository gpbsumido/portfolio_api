import { describe, test, expect } from 'vitest';
import {
  userSegment,
  userPrefix,
  wallPrefix,
  manifestKey,
  imageKey,
  wallIdFromPrefix,
} from './keys.js';

const SUB = 'auth0|abc123';

describe('walls S3 keys', () => {
  test('squashes an Auth0 sub into a URL-safe segment', () => {
    expect(userSegment(SUB)).toBe('auth0_abc123');
    expect(userSegment('google-oauth2|9|x')).toBe('google-oauth2_9_x');
  });

  test('builds a per-user prefix ending in a slash', () => {
    expect(userPrefix(SUB)).toBe('gallery-walls/auth0_abc123/');
  });

  test('builds a per-wall folder under the user prefix', () => {
    expect(wallPrefix(SUB, 'w1')).toBe('gallery-walls/auth0_abc123/w1/');
  });

  test('builds the manifest and image keys for a wall', () => {
    expect(manifestKey(SUB, 'w1')).toBe('gallery-walls/auth0_abc123/w1/manifest.json');
    expect(imageKey(SUB, 'w1', 'img9', 'jpg')).toBe(
      'gallery-walls/auth0_abc123/w1/images/img9.jpg',
    );
  });

  test('recovers a wallId from a ListObjects common prefix', () => {
    expect(wallIdFromPrefix('gallery-walls/auth0_abc123/w1/', SUB)).toBe('w1');
  });

  test('ignores common prefixes outside the user prefix or nested deeper', () => {
    expect(wallIdFromPrefix('gallery-walls/someone-else/w1/', SUB)).toBeNull();
    expect(wallIdFromPrefix('gallery-walls/auth0_abc123/w1/images/', SUB)).toBeNull();
  });
});
