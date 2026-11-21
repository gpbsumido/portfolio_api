import type { Request } from 'express';
import { UnauthorizedError } from '../errors/index.js';

/**
 * The signed-in caller's Auth0 sub. Throws a 401 if there isn't one, which on a
 * checkJwt route means the route was wired without it.
 */
export function requireUserSub(req: Request): string {
  const sub = req.auth?.payload.sub;
  if (!sub) throw new UnauthorizedError();
  return sub;
}

/** The caller's sub on routes that answer signed-in and signed-out visitors alike. */
export function optionalUserSub(req: Request): string | null {
  return req.auth?.payload.sub ?? null;
}
