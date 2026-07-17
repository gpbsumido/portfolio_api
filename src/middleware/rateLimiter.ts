import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Creates an IP-based rate limiter.
 */
export function createIpLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: opts.message ?? 'Too many requests, please try again later.',
    },
  });
}

/**
 * Creates a rate limiter keyed by the authenticated user's sub claim,
 * falling back to the request IP when no auth is present.
 */
export function createUserLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) =>
      (req as any).auth?.payload?.sub ?? req.ip ?? 'unknown',
    message: {
      error: opts.message ?? 'Too many requests, please try again later.',
    },
  });
}

/** Pre-configured IP limiter for NBA proxy routes: 60 req / 5 min. */
export const nbaIpLimiter = createIpLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
});
