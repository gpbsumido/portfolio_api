import { describe, test, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from './validate.js';

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const next = vi.fn() as NextFunction;

const schema = z.object({ email: z.string().email('must be a valid email') });

describe('validate middleware', () => {
  test('rejects a bad body with a readable message naming the field', () => {
    const res = createMockRes();
    const req = { body: { email: 'nope' } } as Request;
    validateBody(schema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    // Not a content-free "Validation failed" — the field and reason lead.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'email: must be a valid email',
        message: 'email: must be a valid email',
        code: 'ValidationError',
        statusCode: 400,
        details: [{ field: 'email', message: 'must be a valid email' }],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next on a valid body', () => {
    const res = createMockRes();
    const onward = vi.fn() as NextFunction;
    const req = { body: { email: 'a@b.com' } } as Request;
    validateBody(schema)(req, res, onward);
    expect(onward).toHaveBeenCalledOnce();
  });

  test('validateParams uses the same shape', () => {
    const res = createMockRes();
    const req = { params: { email: 'nope' } } as unknown as Request;
    validateParams(schema)(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'email: must be a valid email',
        code: 'ValidationError',
      }),
    );
  });

  test('validateQuery uses the same shape', () => {
    const res = createMockRes();
    const req = { query: { email: 'nope' } } as unknown as Request;
    validateQuery(schema)(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'email: must be a valid email',
        code: 'ValidationError',
      }),
    );
  });
});
