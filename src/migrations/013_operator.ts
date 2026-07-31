/**
 * Migration: operator
 *
 * Backs the paul-explore operator dashboard with real tables so the fleet reads
 * and the sales analytics stop being in-memory demo data. Stores plus their
 * sales, with the analytics aggregation done in SQL (see modules/operator).
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('operator_stores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.text('location').notNullable().defaultTo('');
    t.string('province', 2).notNullable().defaultTo('ON');
    t.text('status').notNullable().defaultTo('online');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('operator_sales', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    t.text('product_name').notNullable();
    t.text('category').notNullable().defaultTo('');
    t.specificType('unit_price', 'double precision').notNullable().defaultTo(0);
    t.integer('quantity').notNullable().defaultTo(1);
    t.specificType('total', 'double precision').notNullable().defaultTo(0);
    t.timestamp('occurred_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // The analytics group by store and by time window, so index both.
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_operator_sales_store_id ON operator_sales(store_id)',
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_operator_sales_occurred_at ON operator_sales(occurred_at)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('operator_sales');
  await knex.schema.dropTableIfExists('operator_stores');
}
