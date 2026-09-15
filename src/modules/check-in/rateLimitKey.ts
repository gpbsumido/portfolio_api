import type { Request } from 'express';

/**
 * Rate-limit key for the arrival endpoint: Auth0 sub first, IP last.
 */
export function submitRateLimitKeyOf(req: Request): string {
  const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub;
  return sub ?? req.ip ?? 'unknown';
}
