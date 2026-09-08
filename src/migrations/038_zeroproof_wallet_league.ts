import type { Knex } from 'knex';

/**
 * Tag wallets to a league so bets scope for free, and let a user hold an active
 * wallet in many leagues at once.
 *
 * The old `one_active_per_mode` index would have blocked a second active
 * league wallet (both are mode='league'). It's replaced by two indexes: the
 * season/challenge single-active rule stays, and league wallets are unique per
 * (user_sub, league_id) instead.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('zeroproof_wallets', (t) => {
    t.uuid('league_id').references('id').inTable('zeroproof_leagues').onDelete('CASCADE');
  });

  await knex.raw('DROP INDEX IF EXISTS zeroproof_wallets_one_active_per_mode');
  await knex.raw(
    `CREATE UNIQUE INDEX zeroproof_wallets_one_active_per_mode
       ON zeroproof_wallets (user_sub, mode)
       WHERE status = 'active' AND mode <> 'league'`,
  );
  await knex.raw(
    `CREATE UNIQUE INDEX zeroproof_wallets_one_active_per_league
       ON zeroproof_wallets (user_sub, league_id)
       WHERE status = 'active' AND mode = 'league'`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS zeroproof_wallets_one_active_per_league');
  await knex.raw('DROP INDEX IF EXISTS zeroproof_wallets_one_active_per_mode');
  await knex.raw(
    `CREATE UNIQUE INDEX zeroproof_wallets_one_active_per_mode
       ON zeroproof_wallets (user_sub, mode)
       WHERE status = 'active'`,
  );
  await knex.schema.alterTable('zeroproof_wallets', (t) => {
    t.dropColumn('league_id');
  });
}
