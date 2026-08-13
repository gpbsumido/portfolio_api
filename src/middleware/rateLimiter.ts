import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { lazyRateLimitStore } from './rateLimitStore.js';

import type { Request } from 'express';

/**
 * Each limiter gets its own store instance with its own prefix.
 *
 * Sharing one instance is rejected by express-rate-limit and would be wrong
 * anyway: keys come from the caller rather than the route, so a shared backend
 * counts the same visitor into one bucket across every limiter — hitting one
 * endpoint would silently spend another's budget.
 */
let limiterSeq = 0;
const nextStore = (label: string) => lazyRateLimitStore(`${label}${++limiterSeq}`);

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
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: nextStore('ip'),
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
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: nextStore('user'),
    keyGenerator: (req: Request) =>
      (req as any).auth?.payload?.sub ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
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
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: nextStore('keyed'),
    keyGenerator: opts.keyGenerator,
    message: {
      error: opts.message ?? 'Too many requests, please try again later.',
    },
  });
}
