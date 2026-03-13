const { pool } = require('../config/database');

/**
 * Module-level cache: sub -> email for subs seen in this process lifetime.
 * Skips the DB upsert when the sub+email pair hasn't changed, avoiding an
 * unnecessary write on every authenticated request. Cleared on process restart
 * (deploy), which is fine — the DB row is always authoritative.
 * @type {Map<string, string>}
 */
const _seenUsers = new Map();

/**
 * Express middleware that upserts a `users` row from the Auth0 JWT payload.
 *
 * Reads `req.auth.payload.sub` and `req.auth.payload.email`. If email is missing
 * (e.g. the openid+email scope was not granted), logs a warning and calls next()
 * without touching the DB. A DB error also just logs and calls next() so it never
 * blocks a calendar request.
 *
 * Must be placed after checkJwt in the middleware chain so req.auth is populated.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function upsertUser(req, res, next) {
  const sub = req.auth?.payload?.sub;
  // prefer the JWT claim; fall back to X-User-Email forwarded by the BFF from
  // the Auth0 session (handles cases where email is absent from the access token)
  const email = req.auth?.payload?.email ?? req.headers['x-user-email'] ?? null;

  if (!email) {
    console.warn('[upsertUser] email not available from JWT or BFF header — sharing will not work for this user');
    return next();
  }

  // skip the write if we've already seen this sub+email pair this process lifetime
  if (_seenUsers.get(sub) === email) {
    return next();
  }

  try {
    await pool.query(
      `INSERT INTO users (sub, email, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
      [sub, email],
    );
    _seenUsers.set(sub, email);
  } catch (err) {
    console.error('[upsertUser] DB upsert failed (non-fatal):', err.message);
  }

  next();
}

module.exports = upsertUser;
