import type { Request, Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('upsertUser');

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
  const email =
    (req.auth?.payload?.email as string | undefined) ??
    (req.headers['x-user-email'] as string | undefined) ??
    null;

  if (!sub || !email) {
    log.warn('email not available from JWT or BFF header — sharing will not work for this user');
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
