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

/**
 * Creates a limiter keyed by a caller-supplied key rather than the IP.
 *
 * For traffic that reaches us server-side from a BFF, the IP is the BFF's, so
 * an IP-keyed limit puts every visitor in one bucket. Passing the key in lets
 * the operator module count against its forwarded visitor id instead.
 */
export function createKeyedLimiter(opts: {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  message?: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: opts.keyGenerator,
    message: {
      error: opts.message ?? 'Too many requests, please try again later.',
    },
  });
}
