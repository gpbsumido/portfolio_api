/**
 * Migration: scheduled promotions
 *
 * The Pricing tab could model a discount but never run one, so it could predict
 * and never be wrong out loud. A promotion is a row with a window: it targets one
 * product or the whole store, carries a percent, and has a start and an optional
 * end.
 *
 * Two deliberate absences. There is no status column, because a stored status
 * needs a job to flip it and is wrong between runs -- status is derived from the
 * window and the clock. And nothing here mutates operator_inventory.price: the
 * discount is applied at read time, so the list price survives, which is the
 * number every margin calculation needs.
 *
 * store_id is NOT NULL. Fleet-wide campaigns are N rows for now; making this
 * nullable later is an easy migration, whereas guessing the grouping semantics
 * today is not.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('operator_promotions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    // Null means the promotion covers every product in the store.
    t.text('product_name').nullable();
    t.integer('percent').notNullable();
    t.timestamp('starts_at', { useTz: true }).notNullable();
    // Null means open-ended.
    t.timestamp('ends_at', { useTz: true }).nullable();
    t.text('actor').nullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // The Pricing tab's live-promotions read is "this store, newest first".
  await knex.schema.raw(
    'CREATE INDEX idx_operator_promotions_store ON operator_promotions (store_id, starts_at DESC)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('operator_promotions');
}
