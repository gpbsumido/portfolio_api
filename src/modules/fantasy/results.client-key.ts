// Guard for POST /draft-results.
//
// Unlike the adjustments write-auth there is no shared secret and no signed-in
// user: every copy of the companion mints its own key (crypto.randomUUID) and
// sends it here. The key is an IDENTITY and a rate-limit bucket, not a grant —
// so the only check is that it is a well-formed UUID. Throttling (per key and
// per IP, wired in routes) is what actually stops abuse.

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const CLIENT_KEY_HEADER = 'x-draft-client-key';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reads and validates the install key; returns it, or null when malformed. */
export function readClientKey(req: Request): string | null {
  const raw = req.get(CLIENT_KEY_HEADER);
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

export function requireClientKey(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (readClientKey(req)) {
      next();
      return;
    }
    res.status(400).json({ error: `missing or malformed ${CLIENT_KEY_HEADER} (expected a UUID)` });
  };
}
