import type { NextFunction, Request, Response } from 'express';
import { describe, expect, test, vi } from 'vitest';

import { requireServiceToken } from './service-token.js';

function call(headerValue: string | undefined, expected: string | undefined) {
  const req = {
    get: (name: string) =>
      name.toLowerCase() === 'x-operator-token' ? headerValue : undefined,
  } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction;

  requireServiceToken(expected)(req, res, next);
  return next as unknown as ReturnType<typeof vi.fn>;
}

describe('requireServiceToken', () => {
  test('lets a request through when the token matches', () => {
    const next = call('s3cret', 's3cret');
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects a wrong token', () => {
    const next = call('nope', 's3cret');
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  test('rejects a missing token', () => {
    const next = call(undefined, 's3cret');
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  test('rejects a token of the wrong length without comparing content', () => {
    const next = call('short', 'a-much-longer-secret');
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  /**
   * The demo has to keep working for anyone who has not set the variable, and
   * an unset secret must never silently accept an attacker's guess either --
   * with no secret configured there is nothing to forge, so the guard is off.
   */
  test('is a no-op when no secret is configured', () => {
    const next = call(undefined, undefined);
    expect(next).toHaveBeenCalledWith();
  });

  test('is a no-op when the configured secret is blank', () => {
    const next = call(undefined, '   ');
    expect(next).toHaveBeenCalledWith();
  });
});
