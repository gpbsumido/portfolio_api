import type { Knex } from 'knex';

/**
 * ZeroProof accolade awards: who earned which badge, and when.
 *
 * The catalog of accolades lives in code; this table is only the ledger of
 * awards. A unique (user_sub, accolade_id) makes awarding idempotent — the
 * profile can re-evaluate and re-award on every view without duplicating.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_accolade_awards', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('user_sub').notNullable();
    t.text('accolade_id').notNullable();
    t.timestamp('awarded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['user_sub', 'accolade_id'], 'zeroproof_accolade_awards_user_accolade_uq');
    t.index(['user_sub'], 'zeroproof_accolade_awards_user_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_accolade_awards');
}
