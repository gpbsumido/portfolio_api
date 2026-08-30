import type { Knex } from 'knex';

/**
 * Volunteer arrival check-in: sites, the arrivals recorded at them, and the
 * failed-attempt counters that stop a six-digit code being brute-forced.
 *
 * Sites are scoped by `owner_sub` and arrivals by `volunteer_sub` (Auth0
 * subjects) with no FK to `users`, matching the card_wallets/nba_playoff_brackets
 * pattern -- checking in shouldn't depend on a social `users` row existing.
 *
 * There is deliberately no secret column. Codes are derived from
 * CHECKIN_CODE_SECRET and the per-site `code_salt`, so a database dump alone
 * cannot generate a working code.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('checkin_sites', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('owner_sub').notNullable();
    t.text('name').notNullable();
    // Rotatable per site. Not a secret on its own -- it is combined with
    // CHECKIN_CODE_SECRET, which never leaves the server.
    t.text('code_salt').notNullable();
    t.integer('period_seconds').notNullable().defaultTo(120);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('archived_at', { useTz: true });

    t.index(['owner_sub', 'created_at'], 'checkin_sites_owner_created_idx');
  });

  await knex.schema.createTable('checkin_arrivals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('site_id').notNullable().references('id').inTable('checkin_sites').onDelete('CASCADE');
    t.text('volunteer_sub').notNullable();
    // Denormalised for the organizer's roster, so showing who arrived doesn't
    // need a second lookup against a users table that may not have the row.
    t.text('volunteer_email');
    // The code window that was spent. Unique per volunteer per site, which is
    // what makes a repeated submit return the first arrival instead of a second.
    t.bigInteger('window_start').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['site_id', 'volunteer_sub', 'window_start'], {
      indexName: 'checkin_arrivals_once_per_window_uniq',
    });
    // The roster reads a site's arrivals newest-first.
    t.index(['site_id', 'created_at'], 'checkin_arrivals_site_created_idx');
  });

  await knex.schema.createTable('checkin_attempts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('site_id').notNullable().references('id').inTable('checkin_sites').onDelete('CASCADE');
    t.text('volunteer_sub').notNullable();
    t.bigInteger('window_start').notNullable();
    t.integer('failed_count').notNullable().defaultTo(0);
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One counter per volunteer per window, upserted on each wrong guess.
    t.unique(['site_id', 'volunteer_sub', 'window_start'], {
      indexName: 'checkin_attempts_window_uniq',
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('checkin_attempts');
  await knex.schema.dropTableIfExists('checkin_arrivals');
  await knex.schema.dropTableIfExists('checkin_sites');
}
