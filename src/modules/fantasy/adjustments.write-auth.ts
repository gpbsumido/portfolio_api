// Write guard for the adjustments endpoints.
//
// Unlike the feature-flags guard there is no signed-in user to fall back to:
// the only writers are Paul approving from the extension and the daily research
// job, both carrying the shared secret. So a wrong or missing token is simply a
// 401 — no JWT path. Unset secret disables writes entirely (fail closed) so a
// fresh clone or a misconfigured deploy can't be written to anonymously.

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { constantTimeEqual } from '../../shared/secrets/constantTimeEqual.js';

export const ADJ_TOKEN_HEADER = 'x-draft-adj-token';

export function adjWriteAuth(expected: string | undefined): RequestHandler {
  const secret = expected?.trim();
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!secret) {
      res.status(503).json({ error: 'adjustment writes are disabled (no service token configured)' });
      return;
    }
    const provided = req.get(ADJ_TOKEN_HEADER);
    if (provided && constantTimeEqual(provided, secret)) {
      next();
      return;
    }
    res.status(401).json({ error: 'invalid or missing draft-adjustments service token' });
  };
}
