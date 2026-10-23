import type { Knex } from 'knex';

/**
 * Admin-set answers for EVAR practice cases.
 *
 * The synthetic phantoms work their answers out from their own geometry, so a
 * row here is an override: a corrected value, or the hand-measured answers for
 * a real scan that has no geometry to work from. No row means the case keeps
 * its built-in answers.
 *
 * `double precision` rather than `numeric`, so node-postgres hands back numbers
 * instead of strings. A tenth of a millimetre is the finest anyone measures.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('evar_case_references', (t) => {
    t.text('case_id').primary();
    t.double('neck_diameter').notNullable();
    t.double('neck_length').notNullable();
    t.double('max_sac').notNullable();
    t.double('right_cia').notNullable();
    t.double('left_cia').notNullable();
    t.text('note');
    // The admin who last set it, kept for the record and never served publicly.
    t.text('updated_by');
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('evar_case_references');
}
