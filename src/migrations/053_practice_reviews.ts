import type { Knex } from 'knex';

/**
 * Interview-prep review progress, one row per user per item.
 *
 * `kind` separates the two schedules paul-explore keeps: `problem` is a
 * LeetCode problem re-solved on a spaced ladder, `drill` is a recognition
 * card. `item_id` is the LeetCode slug in both cases. The client works out the
 * schedule; this table only remembers where each item sits on it.
 *
 * Keyed to `users.sub` with a cascade, so deleting an account takes its
 * practice history with it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('practice_reviews', (t) => {
    t.text('user_sub').notNullable().references('sub').inTable('users').onDelete('CASCADE');
    t.text('kind').notNullable();
    t.text('item_id').notNullable();
    t.integer('step').notNullable();
    t.timestamp('due_at', { useTz: true }).notNullable();
    t.timestamp('last_reviewed_at', { useTz: true }).notNullable();
    t.integer('reviews').notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['user_sub', 'kind', 'item_id']);
    t.check("kind in ('problem', 'drill')", [], 'practice_reviews_kind_check');
    t.check('step >= 0', [], 'practice_reviews_step_check');
    t.check('reviews >= 0', [], 'practice_reviews_reviews_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('practice_reviews');
}
