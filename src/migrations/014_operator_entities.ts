/**
 * Migration: operator entities
 *
 * Completes the operator store shape and adds the per-store read entities the
 * paul-explore dashboard needs: inventory, alerts, and an activity feed.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('operator_stores', (t) => {
    t.specificType('temperature', 'double precision').notNullable().defaultTo(4);
    t.specificType('uptime', 'double precision').notNullable().defaultTo(99);
    t.specificType('revenue_24h', 'double precision').notNullable().defaultTo(0);
    t.timestamp('last_ping', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('operator_inventory', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    t.text('product_name').notNullable();
    t.text('category').notNullable().defaultTo('');
    t.integer('current_stock').notNullable().defaultTo(0);
    t.integer('capacity').notNullable().defaultTo(1);
    t.specificType('price', 'double precision').notNullable().defaultTo(0);
    t.timestamp('last_restocked', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('operator_alerts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    t.text('severity').notNullable();
    t.text('category').notNullable();
    t.text('message').notNullable();
    t.timestamp('occurred_at', { useTz: true }).defaultTo(knex.fn.now());
    t.boolean('acknowledged').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('operator_activity', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('operator_stores')
      .onDelete('CASCADE');
    t.text('type').notNullable();
    t.text('description').notNullable();
    t.timestamp('occurred_at', { useTz: true }).defaultTo(knex.fn.now());
    t.text('actor');
  });

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_operator_inventory_store_id ON operator_inventory(store_id)',
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_operator_alerts_store_id ON operator_alerts(store_id)',
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_operator_activity_store_id ON operator_activity(store_id)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('operator_activity');
  await knex.schema.dropTableIfExists('operator_alerts');
  await knex.schema.dropTableIfExists('operator_inventory');
  await knex.schema.alterTable('operator_stores', (t) => {
    t.dropColumn('temperature');
    t.dropColumn('uptime');
    t.dropColumn('revenue_24h');
    t.dropColumn('last_ping');
  });
}
