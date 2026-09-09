import type { Knex } from 'knex';

/**
 * Bind a ZeroProof league to one ESPN fantasy league. When set, the league's
 * members may only bet that ESPN league's matchups (enforced at placement).
 * All three columns are set together or not at all — an unbound league (the
 * default) bets anything, as before.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('zeroproof_leagues', (t) => {
    // ESPN game code ('ffl' | 'fba' | ...), league id, and season year.
    t.text('espn_game');
    t.text('espn_league_id');
    t.text('espn_season');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('zeroproof_leagues', (t) => {
    t.dropColumn('espn_game');
    t.dropColumn('espn_league_id');
    t.dropColumn('espn_season');
  });
}
