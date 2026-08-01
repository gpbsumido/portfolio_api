/**
 * Migration: operator planogram
 *
 * One row per store holding the shelf layout as an ordered array of boxes
 * (each box holds an item id or is empty, plus a sensor-match flag). Stored as
 * JSONB because the client sends and receives the whole layout at once.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('operator_planograms', (t) => {
    t.uuid('store_id')
      .primary()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    t.jsonb('boxes').notNullable().defaultTo('[]');
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('operator_planograms');
}
