/**
 * Migration: auditable restock sessions
 *
 * Restocking was a single UPDATE that set current_stock = capacity and wrote one
 * activity row saying "restocked to full capacity". That cannot express the
 * things an operator actually needs to know: six yogurts thrown out because they
 * expired, a sensor reading eight where the shelf held five, a case damaged in
 * the van. Shrinkage and miscounts are where the margin goes, and there was
 * nowhere to record either.
 *
 * A restock is now a session with one line per product touched. Lines accumulate
 * while the restocker works the shelf; completing the session is the only thing
 * that writes operator_inventory, in one transaction, so the audit trail can
 * never be bypassed.
 *
 * counted_qty is deliberately nullable. Null means the restocker chose to skip
 * counting that slot, which is a recorded decision rather than missing data --
 * it is what lets a line be classified as matches-expected, correction, or
 * not-counted.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('operator_restock_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    t.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.text('actor').nullable();
    t.text('notes').nullable();
  });

  // The resume lookup and the history read are both "this store, newest first".
  await knex.schema.raw(
    'CREATE INDEX idx_operator_restock_sessions_store ON operator_restock_sessions (store_id, started_at DESC)',
  );

  await knex.schema.createTable('operator_restock_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('session_id')
      .notNullable()
      .references('id')
      .inTable('operator_restock_sessions')
      .onDelete('CASCADE');
    t.uuid('item_id')
      .notNullable()
      .references('id')
      .inTable('operator_inventory')
      .onDelete('CASCADE');
    t.integer('expected_qty').notNullable().defaultTo(0);
    t.integer('counted_qty').nullable();
    t.integer('added').notNullable().defaultTo(0);
    t.integer('removed').notNullable().defaultTo(0);
    t.text('removal_reason').nullable();
    t.integer('resulting_stock').nullable();
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // One line per product per session, so tapping a slot repeatedly upserts
    // instead of growing the table.
    t.unique(['session_id', 'item_id']);
  });

  await knex.schema.raw(
    'CREATE INDEX idx_operator_restock_lines_session ON operator_restock_lines (session_id)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('operator_restock_lines');
  await knex.schema.dropTableIfExists('operator_restock_sessions');
}
