import type { Knex } from 'knex';

/**
 * Resolution health for real-sports ingestion, per (source, stage). `source` is
 * a sport key (e.g. `basketball_nba`); `stage` is which vendor call it is —
 * 'odds' (the board sync) or 'results' (the settle). Split by stage because a
 * sport can post odds fine but fail to return scores, or vice versa. The sync and
 * settle crons write it as they fetch, so an operator can see on the admin page
 * which sports aren't syncing or settling — the ops-side counterpart of the
 * per-league ESPN health a commissioner sees.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_ingest_health', (t) => {
    t.text('source').notNullable();
    t.text('stage').notNullable();
    t.timestamp('last_checked_at', { useTz: true }).notNullable();
    t.timestamp('last_ok_at', { useTz: true });
    t.text('last_error');

    t.primary(['source', 'stage']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_ingest_health');
}
