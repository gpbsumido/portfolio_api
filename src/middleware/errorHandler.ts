import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/index.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('errorHandler');

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

  // Multipart limits (from multer). These are client mistakes, not server
  // faults, and a 500 here would also log them as unhandled.
  if (err instanceof Error && err.name === 'MulterError') {
    const code = (err as Error & { code?: string }).code;
    const tooBig =
      code === 'LIMIT_FILE_SIZE' ||
      code === 'LIMIT_FILE_COUNT' ||
      code === 'LIMIT_PART_COUNT' ||
      code === 'LIMIT_FIELD_COUNT';
    res.status(tooBig ? 413 : 400).json({
      error: 'PayloadTooLarge',
      message: 'Upload exceeds the allowed size or file count',
      statusCode: tooBig ? 413 : 400,
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
  log.error({ err }, 'unhandled error');

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
