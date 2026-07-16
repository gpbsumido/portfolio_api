import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/index.js';

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Known application errors
  if (err instanceof AppError) {
    const body: ErrorResponse = {
      error: err.name,
      message: err.message,
      statusCode: err.statusCode,
    };
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      statusCode: 400,
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Auth errors (from express-oauth2-jwt-bearer)
  if (
    err instanceof Error &&
    (('status' in err && (err as Record<string, unknown>).status === 401) ||
      err.name === 'UnauthorizedError')
  ) {
    res.status(401).json({
      error: 'UnauthorizedError',
      message: 'Invalid or missing token',
      statusCode: 401,
    });
    return;
  }

  // Unknown errors
  const isProduction = process.env.NODE_ENV === 'production';
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: 'InternalServerError',
    message: isProduction
      ? 'An unexpected error occurred'
      : err instanceof Error
        ? err.message
        : 'Unknown error',
    statusCode: 500,
  });
}
