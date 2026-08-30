import type { Knex } from 'knex';

/**
 * Narrow the draft_adjustments dedup key from (player, category, batch_date) to
 * (player, category). The daily research push re-reports the same injury under a
 * new batch_date, which the old key treated as a new row — so a player piled up
 * one row per day. With the key on (player, category), a refresh UPDATEs the one
 * row (fact + batch_date) and only INSERTs genuinely new players; approvals are
 * preserved because the upsert leaves status untouched.
 *
 * Existing duplicates are collapsed first (the unique index can't be created
 * otherwise): keep the most recently touched row per (player, category), which
 * carries the latest fact and any approve/reject the user already made.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM draft_adjustments a
    USING draft_adjustments b
    WHERE a.player_name = b.player_name
      AND a.category = b.category
      AND (a.updated_at < b.updated_at
           OR (a.updated_at = b.updated_at AND a.id < b.id))
  `);
  await knex.raw('DROP INDEX IF EXISTS draft_adjustments_dedup');
  await knex.raw(
    'CREATE UNIQUE INDEX draft_adjustments_dedup ON draft_adjustments (player_name, category)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS draft_adjustments_dedup');
  await knex.raw(
    'CREATE UNIQUE INDEX draft_adjustments_dedup ON draft_adjustments (player_name, category, batch_date)',
  );
}
