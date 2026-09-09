import type { Knex } from 'knex';

/**
 * Resolution health per ESPN league key (game:leagueId:season). The sync cron
 * fetches each configured league; here it records whether that fetch worked, so
 * a commissioner can see on their league page that an added ESPN league can't be
 * reached (private, wrong id/season, or ESPN down) instead of it just silently
 * never appearing. Keyed by the ESPN key, not the row that added it — the same
 * key's health is identical wherever it's referenced (a league, the registry, or
 * the env fallback), so it's stored once.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_espn_league_health', (t) => {
    t.text('game').notNullable();
    t.text('league_id').notNullable();
    t.text('season').notNullable();
    // Every resolve attempt stamps this.
    t.timestamp('last_checked_at', { useTz: true }).notNullable();
    // The last attempt that succeeded — null if it has never resolved.
    t.timestamp('last_ok_at', { useTz: true });
    // The error from the most recent attempt, or null when currently healthy.
    t.text('last_error');

    t.primary(['game', 'league_id', 'season']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_espn_league_health');
}
