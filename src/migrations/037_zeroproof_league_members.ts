import type { Knex } from 'knex';

/**
 * ZeroProof league membership: one player in one league, with the league-scoped
 * wallet they bet from. A unique (league_id, user_sub) makes joining idempotent,
 * the way accolade awards use their unique pair. `final_balance_cents`/`rank`
 * are stamped when the league settles.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_league_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('league_id')
      .notNullable()
      .references('id')
      .inTable('zeroproof_leagues')
      .onDelete('CASCADE');
    t.text('user_sub').notNullable();
    t.uuid('wallet_id')
      .notNullable()
      .references('id')
      .inTable('zeroproof_wallets')
      .onDelete('CASCADE');
    t.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Snapshot stamped at settlement, so a settled board never re-derives.
    t.bigInteger('final_balance_cents');
    t.integer('rank');

    t.unique(['league_id', 'user_sub'], 'zeroproof_league_members_league_user_uq');
    t.index(['league_id'], 'zeroproof_league_members_league_idx');
    t.index(['user_sub'], 'zeroproof_league_members_user_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_league_members');
}
