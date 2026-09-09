import type { Knex } from 'knex';

/**
 * The ESPN fantasy leagues a ZeroProof league's commissioner has added for their
 * members to bet. This is additive: adding one makes its weekly matchups appear
 * on the board (its keys are unioned into the ingest list), and it does NOT
 * restrict the league to only those matchups — members still bet everything.
 * A unique (league_id, game, espn_league_id, season) makes adding idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_league_espn_leagues', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('league_id')
      .notNullable()
      .references('id')
      .inTable('zeroproof_leagues')
      .onDelete('CASCADE');
    // 'ffl' (football) | 'fba' (basketball) | ...
    t.text('game').notNullable();
    t.text('espn_league_id').notNullable();
    t.text('season').notNullable();
    // An optional human label, shown on the league page.
    t.text('label');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(
      ['league_id', 'game', 'espn_league_id', 'season'],
      'zeroproof_league_espn_leagues_key_uq',
    );
    t.index('league_id', 'zeroproof_league_espn_leagues_league_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_league_espn_leagues');
}
