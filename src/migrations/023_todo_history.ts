import type { Knex } from 'knex';

/**
 * History and comments for the to-do list, plus the `reason` column they both
 * make sense alongside.
 *
 * The revert model is the one hard-to-reverse decision here, and it is git's
 * `revert` rather than git's `reset`. Restoring revision 3 writes a NEW revision
 * whose content matches 3; it never deletes revision 4. The history only grows.
 *
 * That matters because the feature exists to answer "what happened to this
 * item". A restore that quietly removed the thing being restored would break
 * exactly that question, and it is the failure you cannot notice afterwards,
 * because the evidence is what got deleted.
 *
 * Snapshots are whole rows rather than diffs. Revert becomes "write this back"
 * instead of replaying inverse patches, and at tens of rows the storage argument
 * for diffs does not apply.
 *
 * Comments are deliberately NOT part of revertable state. Reverting an item must
 * not delete the note explaining why it was reverted.
 */
export async function up(knex: Knex): Promise<void> {
  // Why the item exists at all, as opposed to `detail`, which says what to do.
  // They get read at different moments: the what while working, the why while
  // deciding whether to bother.
  await knex.schema.alterTable('todos', (t) => {
    t.text('reason');
  });

  await knex.schema.createTable('todo_revisions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('todo_id').notNullable().references('id').inTable('todos').onDelete('CASCADE');
    // Per-todo counter so the UI can say "revision 3" rather than a uuid.
    // Assigned inside the writing transaction, never read-then-written.
    t.integer('revision').notNullable();
    // created | updated | ticked | unticked | removed | reverted — enough to
    // render a readable timeline without diffing every adjacent pair.
    t.text('change_kind').notNullable();
    t.jsonb('snapshot').notNullable();
    // Points at the revision whose content was restored, so a revert reads as
    // one rather than looking like an ordinary edit.
    t.uuid('reverted_from').references('id').inTable('todo_revisions');
    t.text('actor');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['todo_id', 'revision'], { indexName: 'todo_revisions_todo_revision_uniq' });
    t.index(['todo_id', 'revision'], 'todo_revisions_todo_idx');
  });

  await knex.schema.createTable('todo_comments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('todo_id').notNullable().references('id').inTable('todos').onDelete('CASCADE');
    t.text('body').notNullable();
    t.text('actor');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Soft delete, so a thread does not silently lose a reply.
    t.timestamp('deleted_at', { useTz: true });

    t.index(['todo_id', 'created_at'], 'todo_comments_todo_idx');
  });

  // Backfill one revision per existing todo, so nothing renders an empty
  // timeline and looks like it was never touched.
  await knex.raw(`
    INSERT INTO todo_revisions (todo_id, revision, change_kind, snapshot, created_at)
    SELECT id, 1, 'created', to_jsonb(todos) - 'id', created_at
      FROM todos
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('todo_comments');
  await knex.schema.dropTableIfExists('todo_revisions');
  await knex.schema.alterTable('todos', (t) => {
    t.dropColumn('reason');
  });
}
