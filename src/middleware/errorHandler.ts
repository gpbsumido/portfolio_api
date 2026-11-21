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

/**
 * SQLSTATE codes that mean the request was wrong rather than the server. The
 * message is ours on purpose: Postgres's own text names tables and constraints.
 */
const POSTGRES_CLIENT_ERRORS = new Map([
  [
    '22P02',
    {
      status: 400,
      code: 'ValidationError',
      message: 'One of the ids or values in that request is not in a valid format.',
    },
  ],
  [
    '23503',
    {
      status: 400,
      code: 'ValidationError',
      message: 'That refers to something that does not exist.',
    },
  ],
  ['23505', { status: 409, code: 'ConflictError', message: 'That already exists.' }],
]);

/** Reads a string property off something thrown, without trusting its shape. */
function stringField(thrown: unknown, key: string): string | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const field: unknown = Reflect.get(thrown, key);
  return typeof field === 'string' ? field : undefined;
}

/** The error this one wraps, if it wraps one. */
function causeOf(thrown: unknown): unknown {
  return thrown instanceof Error ? thrown.cause : undefined;
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

  // Body-parser tags bad JSON and oversized bodies with a `type`. Both are the
  // caller's mistake and used to fall through to the 500 below.
  const bodyParserType = stringField(err, 'type');
  if (bodyParserType === 'entity.too.large') {
    res
      .status(413)
      .json(body('That request is too large.', 'PayloadTooLarge', 413));
    return;
  }
  if (bodyParserType === 'entity.parse.failed') {
    res
      .status(400)
      .json(body('That request body is not valid JSON.', 'BadRequest', 400));
    return;
  }

  // Postgres rejecting what the caller sent. pg and Knex throw the driver error
  // as is; Drizzle wraps it in DrizzleQueryError and keeps it on `cause`.
  const postgresError =
    POSTGRES_CLIENT_ERRORS.get(stringField(err, 'code') ?? '') ??
    POSTGRES_CLIENT_ERRORS.get(stringField(causeOf(err), 'code') ?? '');
  if (postgresError) {
    log.warn({ err }, 'postgres rejected the request');
    res
      .status(postgresError.status)
      .json(body(postgresError.message, postgresError.code, postgresError.status));
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
