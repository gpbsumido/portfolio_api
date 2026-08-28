import type { Knex } from 'knex';

/**
 * Sourced fantasy valuation adjustments for the Draft Lab extension: injuries,
 * ripple beneficiaries (RB2 up when RB1 is out), and depth-chart/coaching
 * context. A daily research push posts new pending rows; approval happens in the
 * extension and only ever flips `status` — it never edits the researched fact.
 *
 * (Supersedes the misplaced legacy `migrations/012_draft_adjustments.sql`, which
 * lived in the pre-baseline SQL dir that `pnpm migrate` no longer reads.)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('draft_adjustments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('player_name').notNullable();
    t.text('team');
    t.text('position');
    t.text('category').notNullable().defaultTo('injury'); // injury | ripple | camp | context
    t.text('note').notNullable();
    t.text('source_url');
    t.decimal('delta_pct').notNullable(); // e.g. -90, +15
    t.text('beneficiary_of'); // the injured player a ripple flows from
    t.text('confidence').notNullable().defaultTo('med'); // high | med | low
    t.text('status').notNullable().defaultTo('pending'); // pending | approved | rejected
    t.date('batch_date').notNullable(); // the daily run that produced it
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One row per player+category per daily batch, so a re-run upserts instead
    // of piling up duplicates.
    t.unique(['player_name', 'category', 'batch_date'], { indexName: 'draft_adjustments_dedup' });
    // The extension reads the current picture by status, newest batch first.
    t.index(['status', 'batch_date'], 'draft_adjustments_status_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('draft_adjustments');
}
