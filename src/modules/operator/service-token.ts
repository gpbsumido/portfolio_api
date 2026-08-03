// ---------------------------------------------------------------------------
// Operator module — service-to-service write guard
//
// The operator dashboard is a public demo and has to stay usable without a
// login, so user auth on the writes is the wrong tool: it would 401 every
// restock coming from the demo. The hole that actually matters is different --
// anyone can point curl at the API and mutate the data directly, bypassing the
// app entirely.
//
// A shared secret closes that without touching visitors. paul-explore's BFF is
// the only thing that ever calls these endpoints server-side, so it can carry a
// header the browser never sees. Visitors keep full functionality because the
// BFF vouches for them; a direct caller gets a 401.
//
// This authenticates the SERVICE, not the person. It is deliberately not a
// replacement for user auth, and the tradeoffs are written up in the
// operator-dashboard notes rather than hidden here.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../../shared/errors/AppError.js';

export const OPERATOR_TOKEN_HEADER = 'x-operator-token';

/** Constant-time compare, length-checked first so it cannot throw. */
function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Guards a write route with the shared BFF secret.
 *
 * With no secret configured this is a no-op, which keeps a fresh clone and
 * local development working. That is safe rather than a silent hole: if there
 * is no secret then there is nothing for a caller to forge, and the deployment
 * that wants the protection is the one that sets the variable.
 */
export function requireServiceToken(expected: string | undefined) {
  const secret = expected?.trim();

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!secret) {
      next();
      return;
    }

    const provided = req.get(OPERATOR_TOKEN_HEADER);
    if (!provided || !matches(provided, secret)) {
      next(new UnauthorizedError('operator service token required'));
      return;
    }
    next();
  };
}
