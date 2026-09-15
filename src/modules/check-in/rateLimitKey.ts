import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Rate-limit key for the arrival endpoint: Auth0 sub first, IP last.
 *
 * Every request here is signed in, so the sub is the real bucket. The IP is a
 * last resort. It goes through ipKeyGenerator because an IPv6 user is handed a
 * whole /64, and keying on the full address would let one person mint
 * effectively unlimited buckets by varying the low bits, which is the bypass
 * this limiter exists to prevent. v4 addresses pass through unchanged. Skipping
 * the helper is what express-rate-limit v8 flags as ERR_ERL_KEY_GEN_IPV6.
 */
export function submitRateLimitKeyOf(req: Request): string {
  const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub;
  return sub ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown');
}
