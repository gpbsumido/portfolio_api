import type { Knex } from 'knex';

/**
 * Soft delete for the to-do list.
 *
 * Removing an item from the page sets this rather than deleting the row. The
 * checkbox and the remove control sit next to each other, so a mis-click has to
 * stay recoverable — and the record of what was once planned is worth keeping
 * even when the item stops mattering.
 *
 * No deleted_by column: single-owner table gated by an email allowlist, same
 * reasoning as the original migration. An actor column would imply a
 * multi-user model nothing enforces.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('todos', (t) => {
    t.timestamp('deleted_at', { useTz: true });
  });

  // Partial, because every read filters on deleted_at is null. Indexing the
  // whole table would index rows nothing looks at.
  await knex.raw(
    `CREATE INDEX todos_active_idx ON todos (phase, position) WHERE deleted_at IS NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS todos_active_idx`);
  await knex.schema.alterTable('todos', (t) => {
    t.dropColumn('deleted_at');
  });
}
