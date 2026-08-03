import type { Request } from 'express';
import { describe, expect, test } from 'vitest';

import {
  UNKNOWN_ACTOR,
  actorOf,
  rateLimitKeyOf,
  visitorIdOf,
} from './visitor.js';

function req(opts: { visitor?: string; sub?: string; ip?: string }): Request {
  return {
    get: (name: string) =>
      name.toLowerCase() === 'x-operator-visitor' ? opts.visitor : undefined,
    ip: opts.ip,
    auth: opts.sub ? { payload: { sub: opts.sub } } : undefined,
  } as unknown as Request;
}

describe('visitorIdOf', () => {
  test('accepts an opaque id the BFF forwarded', () => {
    expect(visitorIdOf(req({ visitor: 'v_7f3aQ-x1' }))).toBe('v_7f3aQ-x1');
  });

  test('is null when the header is absent or blank', () => {
    expect(visitorIdOf(req({}))).toBeNull();
    expect(visitorIdOf(req({ visitor: '   ' }))).toBeNull();
  });

  test('rejects anything that is not an opaque token', () => {
    // Bounded on purpose: this ends up in the audit trail and in the limiter's
    // key space, and a caller should not be able to stuff either.
    expect(visitorIdOf(req({ visitor: 'a'.repeat(65) }))).toBeNull();
    expect(visitorIdOf(req({ visitor: 'has spaces' }))).toBeNull();
    expect(visitorIdOf(req({ visitor: 'semi;colon' }))).toBeNull();
  });
});

describe('rateLimitKeyOf', () => {
  test('counts against the visitor when one was forwarded', () => {
    expect(rateLimitKeyOf(req({ visitor: 'v_abc', ip: '1.2.3.4' }))).toBe(
      'v_abc',
    );
  });

  test('falls back to a signed-in subject', () => {
    expect(rateLimitKeyOf(req({ sub: 'auth0|123', ip: '1.2.3.4' }))).toBe(
      'auth0|123',
    );
  });

  test('falls back to the IP last, because it is the BFF and not the visitor', () => {
    expect(rateLimitKeyOf(req({ ip: '1.2.3.4' }))).toBe('1.2.3.4');
  });

  test('gives two visitors from one IP separate budgets', () => {
    // The whole point. Every request arrives from the same egress IPs, so an
    // IP-keyed limit put every visitor in one bucket.
    const a = rateLimitKeyOf(req({ visitor: 'v_a', ip: '1.2.3.4' }));
    const b = rateLimitKeyOf(req({ visitor: 'v_b', ip: '1.2.3.4' }));
    expect(a).not.toBe(b);
  });
});

describe('actorOf', () => {
  test('prefers a real identity over a pseudonymous one', () => {
    expect(actorOf(req({ sub: 'auth0|123', visitor: 'v_abc' }))).toBe(
      'auth0|123',
    );
  });

  test('labels an anonymous session as anonymous rather than as a name', () => {
    // It must not read like a username. Two restocks sharing this came from the
    // same browser; nothing here knows who was holding the phone.
    expect(actorOf(req({ visitor: 'v_abc' }))).toBe('anonymous:v_abc');
  });

  test('admits when it has nothing', () => {
    expect(actorOf(req({}))).toBe(UNKNOWN_ACTOR);
  });

  test('never records the old hardcoded operator address', () => {
    for (const r of [req({}), req({ visitor: 'v_abc' }), req({ sub: 's' })]) {
      expect(actorOf(r)).not.toContain('operator@smartstore.example');
    }
  });
});
