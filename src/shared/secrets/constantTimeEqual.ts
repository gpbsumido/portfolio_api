import { timingSafeEqual } from 'node:crypto';

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * A plain `===` on strings short-circuits at the first differing byte, so the
 * time it takes to fail tells an attacker how much of the prefix was right.
 * That turns guessing a secret from an infeasible search into a per-character
 * one. `timingSafeEqual` always reads both buffers in full.
 *
 * Length is checked first because timingSafeEqual throws on a mismatch. Length
 * does leak, but a secret's length is not the secret.
 *
 * Both call sites in the flags and operator modules had their own copy of this;
 * a security predicate implemented twice is one drift away from being wrong in
 * one place only.
 */
export function constantTimeEqual(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** Compares an `Authorization: Bearer <secret>` header against a secret. */
export function bearerMatches(
  header: string | undefined,
  expected: string | undefined,
): boolean {
  if (!header || !expected) return false;
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return constantTimeEqual(header.slice(prefix.length), expected);
}
