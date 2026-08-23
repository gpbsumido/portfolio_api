import type { Knex } from 'knex';

/**
 * The Fantasy TCG economy: a coin wallet per user and the cards they've pulled.
 *
 * Both are scoped by `user_sub` (the Auth0 subject) with no FK to `users`, matching
 * the nba_playoff_brackets pattern — a card wallet shouldn't depend on the social
 * `users` row having been upserted first. Card contents are denormalised onto each
 * pull so the collection renders without regenerating anything from ESPN.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('card_wallets', (t) => {
    t.text('user_sub').primary();
    t.integer('balance').notNullable().defaultTo(0);
    // UTC date (YYYY-MM-DD) of the last daily claim, so the grant is idempotent per day.
    t.text('last_claim_date');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('card_pulls', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('user_sub').notNullable();
    t.text('card_id').notNullable();
    t.text('sport').notNullable();
    t.integer('player_id').notNullable();
    t.text('player_name').notNullable();
    t.integer('points').notNullable();
    t.text('rarity').notNullable();
    t.text('period_id').notNullable();
    t.text('title').notNullable();
    t.text('subtitle').notNullable();
    t.text('image_url').notNullable();
    t.text('opponent');
    t.boolean('home');
    t.timestamp('pulled_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // The collection reads a user's pulls newest-first.
    t.index(['user_sub', 'pulled_at'], 'card_pulls_user_pulled_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('card_pulls');
  await knex.schema.dropTableIfExists('card_wallets');
}
