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
  test('handles AppError with correct status and body', () => {
    const res = createMockRes();
    errorHandler(new NotFoundError('User not found'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'NotFoundError',
        message: 'User not found',
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
        details: { field: 'email' },
      }),
    );
  });

  test('handles ForbiddenError', () => {
    const res = createMockRes();
    errorHandler(new ForbiddenError(), req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('handles ZodError as 400', () => {
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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'ValidationError',
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
        error: 'UnauthorizedError',
        message: 'Invalid or missing token',
      }),
    );
  });

  test('handles unknown errors as 500', () => {
    const res = createMockRes();
    errorHandler(new Error('something broke'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'InternalServerError',
        statusCode: 500,
      }),
    );
  });

  test('hides error message in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = createMockRes();
    errorHandler(new Error('secret details'), req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'An unexpected error occurred',
      }),
    );
    process.env.NODE_ENV = originalEnv;
  });
});
