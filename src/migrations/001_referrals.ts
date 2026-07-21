/**
 * Migration: referrals
 *
 * Backs the work-portfolio referral-links demo: shareable slugs that point at
 * a path on the site, plus a click log so the demo can show real counts.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('referrals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('slug', 64).notNullable().unique();
    t.text('target_path').notNullable().defaultTo('/');
    t.text('label');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('referral_clicks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('referral_id').notNullable().references('id').inTable('referrals').onDelete('CASCADE');
    t.string('ua_hash', 64);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_referral_clicks_referral_id ON referral_clicks(referral_id)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('referral_clicks');
  await knex.schema.dropTableIfExists('referrals');
}
