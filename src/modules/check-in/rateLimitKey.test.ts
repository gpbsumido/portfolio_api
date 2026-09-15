import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { submitRateLimitKeyOf } from './rateLimitKey.js';

const req = (o: { sub?: string; ip?: string }): Request =>
  ({
    auth: o.sub ? { payload: { sub: o.sub } } : undefined,
    ip: o.ip,
  }) as unknown as Request;

describe('submitRateLimitKeyOf', () => {
  it('keys by Auth0 sub when signed in', () => {
    expect(submitRateLimitKeyOf(req({ sub: 'auth0|1', ip: '1.2.3.4' }))).toBe('auth0|1');
  });

  it('normalizes an IPv6 fallback through ipKeyGenerator rather than keying the raw address', () => {
    const ipv6 = '2001:db8:85a3::8a2e:370:7334';
    expect(submitRateLimitKeyOf(req({ ip: ipv6 }))).toBe(ipKeyGenerator(ipv6));
    expect(submitRateLimitKeyOf(req({ ip: ipv6 }))).not.toBe(ipv6);
  });

  it('passes an IPv4 fallback through unchanged', () => {
    expect(submitRateLimitKeyOf(req({ ip: '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('satisfies the express-rate-limit v8 IPv6 guard: uses the ipKeyGenerator helper, not a bare req.ip', () => {
    // This is the exact heuristic express-rate-limit runs on the keyGenerator
    // source; when it holds, the limiter logs ERR_ERL_KEY_GEN_IPV6.
    const src = submitRateLimitKeyOf.toString();
    const tripsGuard = src.includes('req.ip') && !src.includes('ipKeyGenerator');
    expect(tripsGuard).toBe(false);
  });
});
