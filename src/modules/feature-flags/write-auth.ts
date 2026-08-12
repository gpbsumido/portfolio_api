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

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { constantTimeEqual } from '../../shared/secrets/constantTimeEqual.js';
import { CANONICAL_FLAGS } from './seed.js';

export const FLAGS_TOKEN_HEADER = 'x-flags-token';

/** Auth0 RBAC permission required to write an admin-tier flag. */
export const FLAG_ADMIN_PERMISSION = 'write:flags';

const ACCESS_BY_KEY = new Map(CANONICAL_FLAGS.map((flag) => [flag.key, flag.access]));

/**
 * Admin-tier flags gate shipped features, so being signed in is not the bar.
 *
 * An unclassified key is treated as admin too: the upstream flag set is wider
 * than the local seed, and a key this map has never heard of is exactly the one
 * we know least about. Falling back to the loosest rung there would mean the
 * classification protects only the flags it can already see.
 */
function requiresAdmin(key: string | undefined): boolean {
  if (typeof key !== 'string') return true;
  const access = ACCESS_BY_KEY.get(key);
  return access === undefined || access === 'admin';
}

function hasAdminPermission(req: Request): boolean {
  const permissions = (req.auth?.payload as Record<string, unknown> | undefined)?.permissions;
  return Array.isArray(permissions) && permissions.includes(FLAG_ADMIN_PERMISSION);
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
      if (constantTimeEqual(provided, secret)) {
        next();
        return;
      }
      // A wrong secret is a forgery attempt, not a signed-out visitor: say so
      // rather than falling through to the JWT path and reporting the wrong
      // thing.
      res.status(401).json({ error: 'invalid flags service token' });
      return;
    }

    // Authenticate first, then check the tier: the permission lives on the
    // token, so there is nothing to inspect until checkJwt has populated it.
    checkJwt(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (requiresAdmin(typeof key === 'string' ? key : undefined) && !hasAdminPermission(req)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions',
        });
        return;
      }
      next();
    });
  };
}
