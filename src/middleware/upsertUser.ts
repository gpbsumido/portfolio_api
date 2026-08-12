import type { Request, Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('upsertUser');

/**
 * Namespace the post-login Action writes the email claims under. Auth0 requires
 * custom claims to be namespaced; unprefixed ones are silently dropped.
 */
const EMAIL_CLAIM_NS = 'https://paulsumido.com/';

/**
 * Module-level cache: sub → email for subs seen this process lifetime.
 * Skips the DB upsert when the sub+email pair hasn't changed.
 */
const _seenUsers = new Map<string, string>();

/**
 * Express middleware that upserts a `users` row from the Auth0 JWT payload.
 * Must be placed after checkJwt so req.auth is populated.
 */
export async function upsertUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sub = req.auth?.payload?.sub;
  const payload = req.auth?.payload as Record<string, unknown> | undefined;

  // Namespaced claims only, set by the post-login Action. The x-user-email
  // header used to be the fallback, but a header is caller-controlled: since
  // users.email is what calendar sharing resolves an invite against, trusting
  // it let anyone claim an address nobody had registered yet and receive the
  // shares meant for it. Auth0 drops non-namespaced custom claims, so the bare
  // `email` claim can't be relied on either, and it carries no verified flag.
  const claimedEmail = payload?.[`${EMAIL_CLAIM_NS}email`];
  const claimedVerified = payload?.[`${EMAIL_CLAIM_NS}email_verified`];
  const email =
    typeof claimedEmail === 'string' && claimedVerified === true
      ? claimedEmail.trim().toLowerCase()
      : null;

  if (!sub || !email) {
    log.warn('no verified email claim on the token — sharing will not work for this user');
    return next();
  }

  if (_seenUsers.get(sub) === email) {
    return next();
  }

  try {
    await query(
      `INSERT INTO users (sub, email, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
      [sub, email],
    );
    _seenUsers.set(sub, email);
  } catch (err) {
    log.error({ err }, 'DB upsert failed (non-fatal)');
  }

  next();
}
