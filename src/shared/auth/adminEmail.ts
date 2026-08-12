import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../errors/AppError.js';

/**
 * Namespace the Auth0 post-login Action writes the email claims under. Auth0
 * silently drops non-namespaced custom claims, so the bare `email` claim is not
 * something to rely on — and it carries no verified flag.
 */
export const EMAIL_CLAIM_NS = 'https://paulsumido.com/';

/**
 * Whether a request comes from the site owner.
 *
 * An email allowlist rather than an Auth0 permission: the verified claims
 * already ride on the access token, so this needs one env var instead of
 * another dashboard round-trip, and it mirrors the check the BFF already makes.
 *
 * The verification check is the point. An unverified address can be typed in by
 * anyone at signup, so treating it as identity would make the allowlist
 * decorative. Unset means nobody, not everybody: a list that silently opens up
 * when it is misconfigured is worse than one that locks you out, because only
 * one of those is noisy enough to notice.
 */
export function isAdminRequest(req: Request): boolean {
  const payload = (req as { auth?: { payload?: Record<string, unknown> } }).auth?.payload;
  if (!payload) return false;

  const email = payload[`${EMAIL_CLAIM_NS}email`];
  const verified = payload[`${EMAIL_CLAIM_NS}email_verified`];
  if (typeof email !== 'string' || verified !== true) return false;

  const allowed = (process.env.ADMIN_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.trim().toLowerCase());
}

/** Route guard. Place after checkJwt, which populates req.auth. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!isAdminRequest(req)) {
    next(new ForbiddenError('Admin access required'));
    return;
  }
  next();
}
