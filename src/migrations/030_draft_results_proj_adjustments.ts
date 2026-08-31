import type { Knex } from 'knex';

/**
 * Record the manual projection adjustments (the Tiers-tab +/- point tweaks) that
 * were in effect when a draft finished, batched into the same draft-result
 * write. Nullable JSONB, default empty — existing rows and clients that send
 * none are unaffected.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('draft_results', (t) => {
    t.jsonb('proj_adjustments').notNullable().defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('draft_results', (t) => {
    t.dropColumn('proj_adjustments');
  });
}
