import { describe, test, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorHandler } from './errorHandler.js';
import {
  AppError,
  NotFoundError,
  ValidationError as AppValidationError,
  ForbiddenError,
} from '../shared/errors/index.js';

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next = vi.fn() as NextFunction;

describe('errorHandler', () => {
  test('puts the human message in error, and the class name in code', () => {
    const res = createMockRes();
    errorHandler(new NotFoundError('User not found'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    // The frontend reads `error`, so the sentence has to land there — not the
    // class name, which used to strand every message and show "NotFoundError".
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'User not found',
        message: 'User not found',
        code: 'NotFoundError',
        statusCode: 404,
      }),
    );
  });

  test('includes details when present on AppError', () => {
    const res = createMockRes();
    const err = new AppValidationError('Bad input', { field: 'email' });
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Bad input',
        code: 'ValidationError',
        details: { field: 'email' },
      }),
    );
  });

  test('handles ForbiddenError', () => {
    const res = createMockRes();
    errorHandler(new ForbiddenError(), req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden', code: 'ForbiddenError' }),
    );
  });

  test('summarizes a ZodError into a readable message', () => {
    const res = createMockRes();
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      },
    ]);
    errorHandler(zodErr, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    // The top-level line names the field, rather than a content-free
    // "Request validation failed" with the useful part buried in details.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'name: Expected string, received number',
        message: 'name: Expected string, received number',
        code: 'ValidationError',
        statusCode: 400,
        details: [{ path: 'name', message: 'Expected string, received number' }],
      }),
    );
  });

  test('handles auth errors as 401', () => {
    const res = createMockRes();
    const authErr = Object.assign(new Error('jwt expired'), {
      name: 'UnauthorizedError',
    });
    errorHandler(authErr, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Your session has expired or the sign-in token is invalid. Please sign in again.',
        code: 'UnauthorizedError',
      }),
    );
  });

  test('handles unknown errors as 500 with a friendly message', () => {
    const res = createMockRes();
    errorHandler(new Error('something broke'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'InternalServerError',
        statusCode: 500,
      }),
    );
  });

  test('does not leak internal error text to the client in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = createMockRes();
    errorHandler(new Error('secret details'), req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Something went wrong on our end. Please try again.',
        message: 'Something went wrong on our end. Please try again.',
      }),
    );
    process.env.NODE_ENV = originalEnv;
  });
});
