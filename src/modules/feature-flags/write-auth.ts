// ---------------------------------------------------------------------------
// Feature-flags module — write guard
//
// Writes used to need an Auth0 user, full stop. That worked while every flag
// was demo data, but the console now has three access rungs and the loosest one
// is meant to be usable signed-out — and a visitor with no session has no token
// to send, so those writes 401'd and the toggle sprang back.
//
// So: the open rung also accepts the shared secret paul-explore's BFF carries
// server-side, the same way the public operator demo writes without a user.
// Everything above that rung still needs a real identity, because attributing
// an admin's kill switch to the server would make the audit log a fiction and
// the allowlist pointless.
//
// Unknown flag keys fail closed onto the JWT path. A flag nobody has classified
// yet must not be writable by the service token just because it is unclassified.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { CANONICAL_FLAGS } from './seed.js';

export const FLAGS_TOKEN_HEADER = 'x-flags-token';

const ACCESS_BY_KEY = new Map(CANONICAL_FLAGS.map((flag) => [flag.key, flag.access]));

/** Constant-time compare, length-checked first so it cannot throw. */
function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Guards PATCH /:flagKey.
 *
 * @param expected - The shared secret, or undefined to disable the service path.
 * @param checkJwt - The user-auth middleware to fall back to.
 */
export function flagWriteAuth(
  expected: string | undefined,
  checkJwt: RequestHandler,
): RequestHandler {
  const secret = expected?.trim();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Express types params loosely; a repeated :flagKey would arrive as an
    // array, which is not a key we know and must not be treated as one.
    const key = req.params.flagKey;
    const access = typeof key === 'string' ? ACCESS_BY_KEY.get(key) : undefined;
    const provided = req.get(FLAGS_TOKEN_HEADER);

    if (secret && access === 'open' && provided) {
      if (matches(provided, secret)) {
        next();
        return;
      }
      // A wrong secret is a forgery attempt, not a signed-out visitor: say so
      // rather than falling through to the JWT path and reporting the wrong
      // thing.
      res.status(401).json({ error: 'invalid flags service token' });
      return;
    }

    checkJwt(req, res, next);
  };
}
