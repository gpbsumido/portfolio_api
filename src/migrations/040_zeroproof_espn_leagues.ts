import type { Knex } from 'knex';

/**
 * The ESPN fantasy leagues to ingest, as data rather than an env var — so a
 * league can be added without a redeploy. The sync/settle crons read this table
 * unioned with the ESPN_FANTASY_LEAGUES env fallback. A unique
 * (game, league_id, season) makes adding idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_espn_leagues', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // 'ffl' (football) | 'fba' (basketball) | ...
    t.text('game').notNullable();
    t.text('league_id').notNullable();
    t.text('season').notNullable();
    // An optional human label, shown in the admin list.
    t.text('label');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['game', 'league_id', 'season'], 'zeroproof_espn_leagues_key_uq');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_espn_leagues');
}
