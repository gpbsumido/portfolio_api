import type { Knex } from 'knex';

/**
 * Admin to-do list, surfaced at /to-do in paul-explore.
 *
 * The rows live here rather than in either repo on purpose: the list is a
 * record of what has NOT been fixed yet, and both repos are public. Committing
 * it would publish the gaps to anyone reading the source.
 *
 * `project` is free text rather than an enum so adding a repo needs no
 * migration. No owner column: this is a single-owner table gated by an email
 * allowlist, and an owner column would imply a multi-user model that nothing
 * enforces.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('todos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('project').notNullable();
    t.integer('phase').notNullable().defaultTo(1);
    t.integer('position').notNullable().defaultTo(0);
    t.text('title').notNullable();
    t.text('detail');
    t.boolean('blocking').notNullable().defaultTo(false);
    t.text('command');
    t.text('pr_repo');
    t.integer('pr_number');
    t.boolean('done').notNullable().defaultTo(false);
    t.timestamp('done_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // The page reads in this order every time.
    t.index(['phase', 'position'], 'todos_phase_position_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('todos');
}
