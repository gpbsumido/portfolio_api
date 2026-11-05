import { pool } from '../../config/database.js';
import type { PracticeReview, PracticeReviewRow } from './types.js';

const COLUMNS = 'kind, item_id, step, due_at, last_reviewed_at, reviews';

const toReview = (r: PracticeReviewRow): PracticeReview => ({
  kind: r.kind,
  itemId: r.item_id,
  step: r.step,
  dueAt: r.due_at.toISOString(),
  lastReviewedAt: r.last_reviewed_at.toISOString(),
  reviews: r.reviews,
});

// A write only lands if it's at least as recent as what's stored, so a stale
// tab or an old browser import can't roll a newer attempt back.
const KEEP_LATEST = `
  ON CONFLICT (user_sub, kind, item_id) DO UPDATE SET
    step = EXCLUDED.step,
    due_at = EXCLUDED.due_at,
    last_reviewed_at = EXCLUDED.last_reviewed_at,
    reviews = EXCLUDED.reviews,
    updated_at = now()
  WHERE practice_reviews.last_reviewed_at <= EXCLUDED.last_reviewed_at`;

/** Every review the user has, both kinds. */
export async function listReviews(userSub: string): Promise<PracticeReview[]> {
  const { rows } = await pool.query<PracticeReviewRow>(
    `SELECT ${COLUMNS} FROM practice_reviews WHERE user_sub = $1 ORDER BY kind, item_id`,
    [userSub],
  );
  return rows.map(toReview);
}

/**
 * Stores one review and returns whatever is stored afterwards: this one, or
 * the newer one that was already there.
 */
export async function saveReview(userSub: string, review: PracticeReview): Promise<PracticeReview> {
  const written = await pool.query<PracticeReviewRow>(
    `INSERT INTO practice_reviews (user_sub, ${COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ${KEEP_LATEST}
     RETURNING ${COLUMNS}`,
    [userSub, review.kind, review.itemId, review.step, review.dueAt, review.lastReviewedAt, review.reviews],
  );
  if (written.rows[0]) return toReview(written.rows[0]);

  const kept = await pool.query<PracticeReviewRow>(
    `SELECT ${COLUMNS} FROM practice_reviews WHERE user_sub = $1 AND kind = $2 AND item_id = $3`,
    [userSub, review.kind, review.itemId],
  );
  return toReview(kept.rows[0]);
}

/** Merges a batch in one statement, then returns the user's full set. */
export async function importReviews(userSub: string, reviews: PracticeReview[]): Promise<PracticeReview[]> {
  await pool.query(
    `INSERT INTO practice_reviews (user_sub, ${COLUMNS})
     SELECT $1::text, * FROM unnest($2::text[], $3::text[], $4::int[], $5::timestamptz[], $6::timestamptz[], $7::int[])
     ${KEEP_LATEST}`,
    [
      userSub,
      reviews.map((r) => r.kind),
      reviews.map((r) => r.itemId),
      reviews.map((r) => r.step),
      reviews.map((r) => r.dueAt),
      reviews.map((r) => r.lastReviewedAt),
      reviews.map((r) => r.reviews),
    ],
  );
  return listReviews(userSub);
}
