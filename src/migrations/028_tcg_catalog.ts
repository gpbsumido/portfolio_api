import type { Knex } from 'knex';

/**
 * A local copy of the TCGdex series/sets catalog.
 *
 * The lists in paul-explore were rendering straight from TCGdex, which meant
 * one page listing every series and then fetching each one -- a fan-out whose
 * cost is a multiple of however slow that API is. It timed out `next build`
 * (60s per page, three attempts, then the export dies) and, at request time,
 * rendered an empty list that ISR then cached for a day, which reads as stale
 * data rather than as an outage.
 *
 * Ingesting on a schedule moves the fan-out offline, where being slow costs
 * nothing. Ids are TCGdex's own, so a re-run upserts rather than duplicating.
 *
 * Every field TCGdex fills in late is nullable on purpose: a set that has just
 * been announced arrives with a name and little else, and pages reading those
 * blind is what started this.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tcg_series', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('logo');
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tcg_sets', (t) => {
    t.text('id').primary();
    t.text('serie_id').notNullable().references('id').inTable('tcg_series').onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('logo');
    t.text('symbol');
    // Absent on a set that has been announced but not detailed yet.
    t.integer('card_count_official');
    t.integer('card_count_total');
    // Upstream order within the serie, preserved so the page does not have to
    // invent one from ids that are not sortable.
    t.integer('position').notNullable().defaultTo(0);
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['serie_id', 'position'], 'tcg_sets_serie_position_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tcg_sets');
  await knex.schema.dropTableIfExists('tcg_series');
}
