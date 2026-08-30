import crypto from 'node:crypto';
import { constantTimeEqual } from '../../shared/secrets/constantTimeEqual.js';

/**
 * The rotating arrival codes.
 *
 * A code is derived, never stored: HMAC over the site's salt and the current
 * time window, truncated to six digits the way TOTP does it. That means there
 * is no per-site secret column to encrypt, leak, or rotate — regenerating a
 * site's salt invalidates its codes, and rotating CHECKIN_CODE_SECRET
 * invalidates every site's at once.
 *
 * What a valid code proves: whoever typed it could read the display at that
 * site within the last two windows. It does not prove they were the only one
 * who could -- a code photographed and sent to someone off-site still works
 * until it rolls over. That gap is inherent to any human-readable code and is
 * documented rather than papered over.
 */

/** How long one code lives. Jamal's "changes every couple of minutes". */
export const PERIOD_SECONDS = 120;

const CODE_DIGITS = 6;

/**
 * How many past windows still verify. One, so a volunteer who starts typing as
 * the code turns over is not told they are wrong -- and no more than one, since
 * every extra window doubles how long a relayed code stays useful.
 */
const GRACE_WINDOWS = 1;

/**
 * Read at call time rather than at import, so a deploy that adds the secret
 * doesn't need a rebuild and the tests can set it per case.
 */
function secret(): string {
  const value = process.env.CHECKIN_CODE_SECRET;
  if (!value) {
    // Fail closed. An empty key still produces a derivable six-digit number,
    // which would look exactly like a working check-in while proving nothing.
    throw new Error('CHECKIN_CODE_SECRET is not set, so arrival codes cannot be derived');
  }
  return value;
}

/** The window number an instant falls in. */
export function windowAt(atMs: number, periodSeconds = PERIOD_SECONDS): number {
  return Math.floor(atMs / 1000 / periodSeconds);
}

/** Seconds until the current code is replaced, for the display countdown. */
export function secondsRemaining(atMs: number, periodSeconds = PERIOD_SECONDS): number {
  const elapsed = Math.floor(atMs / 1000) % periodSeconds;
  return periodSeconds - elapsed;
}

/**
 * The six-digit code for one site in one window.
 *
 * Dynamic truncation (RFC 4226) rather than taking the first bytes, so every
 * digit depends on the whole MAC.
 */
export function deriveCode(salt: string, window: number): string {
  const mac = crypto.createHmac('sha256', secret()).update(`${salt}:${window}`).digest();

  const offset = mac[mac.length - 1] & 0x0f;
  const truncated =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  // padStart, not a bare number: a code that renders as five characters is one
  // the volunteer will type wrong.
  return String(truncated % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, '0');
}

/**
 * Checks a submitted code against the windows that are still live.
 *
 * Returns the window it matched, which the caller records so the same code
 * cannot be spent twice, or null when nothing matches.
 */
export function verifyCode({
  salt,
  code,
  atMs,
  periodSeconds = PERIOD_SECONDS,
}: {
  salt: string;
  code: string;
  atMs: number;
  periodSeconds?: number;
}): number | null {
  const submitted = code.trim();
  if (!/^\d{6}$/.test(submitted)) return null;

  const current = windowAt(atMs, periodSeconds);
  for (let back = 0; back <= GRACE_WINDOWS; back += 1) {
    const window = current - back;
    // Constant-time so a timing signal can't be used to walk the digits.
    if (constantTimeEqual(submitted, deriveCode(salt, window))) return window;
  }
  return null;
}
