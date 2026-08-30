import type { Knex } from 'knex';

/**
 * Narrow the draft_adjustments dedup key from (player, category, batch_date) to
 * (player, category). The daily research push re-reports the same injury under a
 * new batch_date, which the old key treated as a new row — so a player piled up
 * one row per day. With the key on (player, category), a refresh UPDATEs the one
 * row (fact + batch_date) and only INSERTs genuinely new players; approvals are
 * preserved because the upsert leaves status untouched.
 *
 * Existing duplicates are collapsed first (the new unique can't be created
 * otherwise): keep the most recently touched row per (player, category), which
 * carries the latest fact and any approve/reject the user already made.
 *
 * DESTRUCTIVE: deletes duplicate adjustment rows (keeping the newest per
 * player+category) and drops the old dedup constraint. Intentional one-time
 * cleanup — the surviving row keeps the user's approve/reject.
 */
export async function up(knex: Knex): Promise<void> {
  // DESTRUCTIVE: collapses duplicate (player,category) rows to the newest and drops the old dedup constraint — intentional one-time cleanup; the surviving row keeps the user's approve/reject.
  await knex.raw(`
    DELETE FROM draft_adjustments a
    USING draft_adjustments b
    WHERE a.player_name = b.player_name
      AND a.category = b.category
      AND (a.updated_at < b.updated_at
           OR (a.updated_at = b.updated_at AND a.id < b.id))
  `);
  // 025 created this via knex t.unique(), which is a CONSTRAINT (its backing
  // index can't be dropped directly); drop the constraint, then the index name
  // is free. The DROP INDEX covers any environment where it's a plain index.
  await knex.raw('ALTER TABLE draft_adjustments DROP CONSTRAINT IF EXISTS draft_adjustments_dedup');
  await knex.raw('DROP INDEX IF EXISTS draft_adjustments_dedup');
  await knex.raw(
    'CREATE UNIQUE INDEX draft_adjustments_dedup ON draft_adjustments (player_name, category)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS draft_adjustments_dedup');
  await knex.raw(
    'ALTER TABLE draft_adjustments ADD CONSTRAINT draft_adjustments_dedup UNIQUE (player_name, category, batch_date)',
  );
}
