import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/index.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('errorHandler');

interface ErrorResponse {
  /** Human-readable message. The frontend reads this and shows it to the user. */
  error: string;
  /** Same human-readable message, for clients that read `message` instead. */
  message: string;
  /** Machine-readable name for the error kind, e.g. "NotFoundError". */
  code: string;
  statusCode: number;
  details?: unknown;
}

/**
 * Builds the one error shape the whole API answers with. `error` and `message`
 * both carry the human sentence (different frontends read different keys), and
 * `code` carries the machine name. Keeping the sentence in `error` is the whole
 * point: it used to hold the class name, so every thrown AppError surfaced to
 * the user as "NotFoundError" or "ConflictError" instead of what went wrong.
 */
function body(
  humanMessage: string,
  code: string,
  statusCode: number,
  details?: unknown,
): ErrorResponse {
  const payload: ErrorResponse = {
    error: humanMessage,
    message: humanMessage,
    code,
    statusCode,
  };
  if (details !== undefined) payload.details = details;
  return payload;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Known application errors
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(body(err.message, err.name, err.statusCode, err.details));
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    const first = details[0];
    const summary = first
      ? first.path
        ? `${first.path}: ${first.message}`
        : first.message
      : 'Some of the details you entered are not valid';
    res.status(400).json(body(summary, 'ValidationError', 400, details));
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
    const status = tooBig ? 413 : 400;
    res
      .status(status)
      .json(
        body(
          'Your upload is too large or has too many files. Please try a smaller one.',
          'PayloadTooLarge',
          status,
        ),
      );
    return;
  }

  // Auth errors (from express-oauth2-jwt-bearer)
  if (
    err instanceof Error &&
    (('status' in err && (err as Record<string, unknown>).status === 401) ||
      err.name === 'UnauthorizedError')
  ) {
    res
      .status(401)
      .json(
        body(
          'Your session has expired or the sign-in token is invalid. Please sign in again.',
          'UnauthorizedError',
          401,
        ),
      );
    return;
  }

  // Unknown errors. Never surface the raw text to the client in production —
  // it can carry stack traces, DB errors or secrets. It is always logged.
  const isProduction = process.env.NODE_ENV === 'production';
  log.error({ err }, 'unhandled error');

  const message = isProduction
    ? 'Something went wrong on our end. Please try again.'
    : err instanceof Error
      ? err.message
      : 'Something went wrong on our end. Please try again.';
  res.status(500).json(body(message, 'InternalServerError', 500));
}
