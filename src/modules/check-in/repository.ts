import crypto from 'node:crypto';
import { pool } from '../../config/database.js';
import type { CheckinArrivalRow, CheckinSiteRow } from './types.js';

/** Sites the caller owns, newest first. */
export async function listSites(ownerSub: string): Promise<CheckinSiteRow[]> {
  const { rows } = await pool.query<CheckinSiteRow>(
    `SELECT * FROM checkin_sites
      WHERE owner_sub = $1 AND archived_at IS NULL
      ORDER BY created_at DESC`,
    [ownerSub],
  );
  return rows;
}

/** Creates a site with a fresh random salt, so its codes are unlike any other's. */
export async function createSite(ownerSub: string, name: string): Promise<CheckinSiteRow> {
  const { rows } = await pool.query<CheckinSiteRow>(
    `INSERT INTO checkin_sites (owner_sub, name, code_salt)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [ownerSub, name, crypto.randomBytes(16).toString('hex')],
  );
  return rows[0];
}

/**
 * A site the caller owns, or null.
 *
 * Ownership is in the WHERE clause rather than checked afterwards: a query that
 * can only ever return your own rows cannot leak someone else's by accident.
 */
export async function getOwnedSite(id: string, ownerSub: string): Promise<CheckinSiteRow | null> {
  const { rows } = await pool.query<CheckinSiteRow>(
    `SELECT * FROM checkin_sites
      WHERE id = $1 AND owner_sub = $2 AND archived_at IS NULL`,
    [id, ownerSub],
  );
  return rows[0] ?? null;
}

/**
 * Any live site by id, for the check-in path.
 *
 * A volunteer is not the owner, so this one is deliberately not ownership
 * scoped -- but it returns only what verification needs, and the caller still
 * has to produce a code derived from the salt.
 */
export async function getSite(id: string): Promise<CheckinSiteRow | null> {
  const { rows } = await pool.query<CheckinSiteRow>(
    `SELECT * FROM checkin_sites WHERE id = $1 AND archived_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Records an arrival, or returns the one already there.
 *
 * ON CONFLICT does the work: two taps of the button in the same window are one
 * arrival, decided by the database rather than by a read-then-write race.
 */
export async function recordArrival({
  siteId,
  volunteerSub,
  volunteerEmail,
  windowStart,
}: {
  siteId: string;
  volunteerSub: string;
  volunteerEmail: string | null;
  windowStart: number;
}): Promise<{ arrival: CheckinArrivalRow; created: boolean }> {
  const { rows } = await pool.query<CheckinArrivalRow>(
    `INSERT INTO checkin_arrivals (site_id, volunteer_sub, volunteer_email, window_start)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ON CONSTRAINT checkin_arrivals_once_per_window_uniq DO NOTHING
     RETURNING *`,
    [siteId, volunteerSub, volunteerEmail, windowStart],
  );

  if (rows[0]) return { arrival: rows[0], created: true };

  const existing = await pool.query<CheckinArrivalRow>(
    `SELECT * FROM checkin_arrivals
      WHERE site_id = $1 AND volunteer_sub = $2 AND window_start = $3`,
    [siteId, volunteerSub, windowStart],
  );
  return { arrival: existing.rows[0], created: false };
}

/** Arrivals at a site since a cutoff, newest first. */
export async function listArrivals(siteId: string, since: Date): Promise<CheckinArrivalRow[]> {
  const { rows } = await pool.query<CheckinArrivalRow>(
    `SELECT * FROM checkin_arrivals
      WHERE site_id = $1 AND created_at >= $2
      ORDER BY created_at DESC`,
    [siteId, since],
  );
  return rows;
}

/** How many wrong codes this volunteer has already tried in this window. */
export async function failedAttempts({
  siteId,
  volunteerSub,
  windowStart,
}: {
  siteId: string;
  volunteerSub: string;
  windowStart: number;
}): Promise<number> {
  const { rows } = await pool.query<{ failed_count: number }>(
    `SELECT failed_count FROM checkin_attempts
      WHERE site_id = $1 AND volunteer_sub = $2 AND window_start = $3`,
    [siteId, volunteerSub, windowStart],
  );
  return rows[0]?.failed_count ?? 0;
}

/** Counts one wrong guess, returning the new total. */
export async function recordFailedAttempt({
  siteId,
  volunteerSub,
  windowStart,
}: {
  siteId: string;
  volunteerSub: string;
  windowStart: number;
}): Promise<number> {
  const { rows } = await pool.query<{ failed_count: number }>(
    `INSERT INTO checkin_attempts (site_id, volunteer_sub, window_start, failed_count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT ON CONSTRAINT checkin_attempts_window_uniq
     DO UPDATE SET failed_count = checkin_attempts.failed_count + 1, updated_at = now()
     RETURNING failed_count`,
    [siteId, volunteerSub, windowStart],
  );
  return rows[0].failed_count;
}
