import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import type { TodoRow, TodoRevisionRow, TodoCommentRow, ChangeKind } from './types.js';

/**
 * Runs fn inside a transaction, rolling back on any throw.
 *
 * Every to-do mutation goes through this, because the invariant worth
 * protecting is that nothing changes a todo without leaving a revision behind.
 * A second write path that skipped the recorder would make the history
 * *silently* incomplete, which is worse than having none — it looks complete.
 */
export async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Records what a todo looks like AFTER a change.
 *
 * After, not before: reverting restores a snapshot directly, so a
 * snapshot-before model would put every restore one step out of date. The bug
 * is invisible until someone reverts, which is the worst time to find it.
 *
 * The revision number is computed inside the insert rather than read and
 * written back, so two concurrent writes cannot claim the same one — and the
 * unique constraint on (todo_id, revision) turns any remaining race into a
 * loud failure rather than a duplicated timeline entry.
 */
export async function recordRevision(
  client: PoolClient,
  input: {
    todoId: string;
    changeKind: ChangeKind;
    snapshot: TodoRow;
    actor: string | null;
    revertedFrom?: string | null;
  },
): Promise<TodoRevisionRow> {
  const { rows } = await client.query<TodoRevisionRow>(
    `INSERT INTO todo_revisions (todo_id, revision, change_kind, snapshot, actor, reverted_from)
     SELECT $1, COALESCE(MAX(revision), 0) + 1, $2, $3::jsonb, $4, $5
       FROM todo_revisions
      WHERE todo_id = $1
     RETURNING *`,
    [
      input.todoId,
      input.changeKind,
      JSON.stringify(input.snapshot),
      input.actor,
      input.revertedFrom ?? null,
    ],
  );
  return rows[0];
}

/** The timeline for one item, oldest first, which is how it reads. */
export async function listRevisions(todoId: string): Promise<TodoRevisionRow[]> {
  const { rows } = await pool.query<TodoRevisionRow>(
    `SELECT * FROM todo_revisions WHERE todo_id = $1 ORDER BY revision ASC`,
    [todoId],
  );
  return rows;
}

/** Fields a revert restores. id and created_at are identity, not state. */
const RESTORED = [
  'project',
  'phase',
  'position',
  'title',
  'detail',
  'reason',
  'blocking',
  'command',
  'pr_repo',
  'pr_number',
  'done',
  'done_at',
  'deleted_at',
] as const;

/**
 * Restores an earlier revision as a NEW revision.
 *
 * git revert, not git reset. Revision 4 is untouched; reverting to 3 writes
 * revision 5 with the same content and `reverted_from` pointing at 3. Nothing
 * is ever unreachable, so "what happened to this item" stays answerable — which
 * is the entire reason the history exists.
 *
 * Restores every field rather than just `done`. A revert that only put the tick
 * back would be a lie about what it did.
 */
export async function revertTo(
  todoId: string,
  revision: number,
  actor: string | null,
): Promise<{ todo: TodoRow; revision: TodoRevisionRow } | null> {
  return inTransaction(async (client) => {
    const { rows: targets } = await client.query<TodoRevisionRow>(
      `SELECT * FROM todo_revisions WHERE todo_id = $1 AND revision = $2`,
      [todoId, revision],
    );
    const target = targets[0];
    if (!target) return null;

    const snapshot = target.snapshot as unknown as Record<string, unknown>;
    const assignments = RESTORED.map((col, i) => `${col} = $${i + 2}`).join(', ');
    const values = RESTORED.map((col) => snapshot[col] ?? null);

    const { rows: updated } = await client.query<TodoRow>(
      `UPDATE todos SET ${assignments}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [todoId, ...values],
    );
    const todo = updated[0];
    if (!todo) return null;

    const recorded = await recordRevision(client, {
      todoId,
      changeKind: 'reverted',
      snapshot: todo,
      actor,
      revertedFrom: target.id,
    });
    return { todo, revision: recorded };
  });
}

/** Comments, oldest first, excluding soft-deleted ones. */
export async function listComments(todoId: string): Promise<TodoCommentRow[]> {
  const { rows } = await pool.query<TodoCommentRow>(
    `SELECT * FROM todo_comments
      WHERE todo_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC`,
    [todoId],
  );
  return rows;
}

export async function addComment(
  todoId: string,
  body: string,
  actor: string | null,
): Promise<TodoCommentRow | null> {
  // Guard on the todo existing so a comment cannot be orphaned by a typo'd id.
  const { rows } = await pool.query<TodoCommentRow>(
    `INSERT INTO todo_comments (todo_id, body, actor)
     SELECT $1, $2, $3
      WHERE EXISTS (SELECT 1 FROM todos WHERE id = $1 AND deleted_at IS NULL)
     RETURNING *`,
    [todoId, body, actor],
  );
  return rows[0] ?? null;
}

export async function editComment(id: string, body: string): Promise<TodoCommentRow | null> {
  const { rows } = await pool.query<TodoCommentRow>(
    `UPDATE todo_comments
        SET body = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, body],
  );
  return rows[0] ?? null;
}

/** Soft delete, so a second delete is a 404 rather than a silent success. */
export async function removeComment(id: string): Promise<TodoCommentRow | null> {
  const { rows } = await pool.query<TodoCommentRow>(
    `UPDATE todo_comments
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
