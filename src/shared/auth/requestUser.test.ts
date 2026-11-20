import type { Request } from 'express';
import { describe, expect, test } from 'vitest';
import { UnauthorizedError } from '../errors/index.js';
import { optionalUserSub, requireUserSub } from './requestUser.js';

const signedIn = (sub: string) =>
  ({ auth: { payload: { sub }, header: {}, token: 't' } }) as Request;
const signedOut = () => ({}) as Request;

describe('requireUserSub', () => {
  test("returns the signed-in caller's sub", () => {
    expect(requireUserSub(signedIn('auth0|abc'))).toBe('auth0|abc');
  });

  test('throws a 401 when there is no signed-in caller', () => {
    expect(() => requireUserSub(signedOut())).toThrow(UnauthorizedError);
  });
});

describe('optionalUserSub', () => {
  test('returns the sub when signed in and null when not', () => {
    expect(optionalUserSub(signedIn('auth0|abc'))).toBe('auth0|abc');
    expect(optionalUserSub(signedOut())).toBeNull();
  });
});
