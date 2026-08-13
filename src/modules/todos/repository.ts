import { pool } from '../../config/database.js';
import type { TodoRow, NewTodo } from './types.js';
import { inTransaction, recordRevision } from './history.js';

/** Every live todo, in the order the page renders them. */
export async function listTodos(): Promise<TodoRow[]> {
  const { rows } = await pool.query<TodoRow>(
    `SELECT * FROM todos
      WHERE deleted_at IS NULL
      ORDER BY phase ASC, position ASC, created_at ASC`,
  );
  return rows;
}

/**
 * Ticks or un-ticks an item.
 *
 * done_at is cleared on un-tick rather than left behind: a stale completion
 * timestamp on an open item is the kind of small lie that makes the whole list
 * untrustworthy.
 *
 * The revision is written in the same transaction as the change, so there is no
 * window where the todo moved and the history did not.
 */
export async function setDone(
  id: string,
  done: boolean,
  actor: string | null = null,
): Promise<TodoRow | null> {
  return updateTodo(id, { done }, actor);
}

/** Columns a patch may write, in the order the SET clause builds them. */
type TodoPatch = Partial<
  Pick<
    TodoRow,
    | 'title'
    | 'project'
    | 'phase'
    | 'detail'
    | 'reason'
    | 'blocking'
    | 'command'
    | 'pr_repo'
    | 'pr_number'
    | 'done'
  >
>;

/**
 * Edits an item, recording what it became.
 *
 * One function rather than one per field, so there is a single place that
 * writes a todo and a single place that records it. Every mutation on this
 * table funnels through here or through the create and remove paths, which is
 * the invariant the history depends on.
 *
 * The change kind distinguishes a tick from an edit, because a timeline where
 * everything says "updated" is a list of timestamps rather than a story.
 */
export async function updateTodo(
  id: string,
  patch: TodoPatch,
  actor: string | null = null,
): Promise<TodoRow | null> {
  return inTransaction(async (client) => {
    // Locked for the length of the transaction: the phase move below reads the
    // current phase to decide whether to renumber, and a concurrent edit
    // between the read and the write would renumber against a stale answer.
    const { rows: existing } = await client.query<TodoRow>(
      `SELECT * FROM todos WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    const before = existing[0];
    if (!before) return null;

    const values: unknown[] = [id];
    const sets: string[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    for (const column of [
      'title',
      'project',
      'detail',
      'reason',
      'blocking',
      'command',
      'pr_repo',
      'pr_number',
    ] as const) {
      if (patch[column] !== undefined) set(column, patch[column]);
    }

    if (patch.done !== undefined) {
      set('done', patch.done);
      // Derived here rather than accepted from the caller, so the flag and its
      // timestamp cannot disagree.
      sets.push(`done_at = CASE WHEN $${values.length} THEN NOW() ELSE NULL END`);
    }

    if (patch.phase !== undefined) {
      set('phase', patch.phase);
      if (patch.phase !== before.phase) {
        // Positions are only ordered within a phase, so carrying one across
        // would land the item on a number another row already holds and make
        // the order of the two arbitrary. Moving phase means joining the end of
        // the new one.
        values.push(patch.phase);
        sets.push(
          `position = (SELECT COALESCE(MAX(position), 0) + 1 FROM todos WHERE phase = $${values.length})`,
        );
      }
    }

    const { rows } = await client.query<TodoRow>(
      `UPDATE todos SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`,
      values,
    );
    const todo = rows[0];
    if (!todo) return null;

    const keys = Object.keys(patch);
    const changeKind =
      keys.length === 1 && keys[0] === 'done' ? (patch.done ? 'ticked' : 'unticked') : 'updated';

    await recordRevision(client, {
      todoId: todo.id,
      changeKind,
      snapshot: todo,
      actor,
    });
    return todo;
  });
}

/**
 * Adds an item to the end of its phase.
 *
 * position is computed inside the insert rather than read first and written
 * back: two adds landing together would otherwise both read the same max and
 * claim the same slot, and the ordering is the point of the page.
 *
 * The max deliberately counts soft-deleted rows too, so a position is never
 * reused — restoring something later cannot collide with what took its place.
 */
export async function createTodo(
  input: NewTodo,
  actor: string | null = null,
): Promise<TodoRow> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<TodoRow>(
      `INSERT INTO todos (project, phase, title, detail, reason, position)
       SELECT $1, $2, $3, $4, $5, COALESCE(MAX(position), 0) + 1
         FROM todos
        WHERE phase = $2
       RETURNING *`,
      [input.project, input.phase, input.title, input.detail, input.reason],
    );
    const todo = rows[0];

    await recordRevision(client, {
      todoId: todo.id,
      changeKind: 'created',
      snapshot: todo,
      actor,
    });
    return todo;
  });
}

/**
 * Hides an item without losing it.
 *
 * The deleted_at IS NULL guard is what lets a second delete answer 404 rather
 * than quietly succeeding and moving the timestamp.
 */
export async function softDeleteTodo(
  id: string,
  actor: string | null = null,
): Promise<TodoRow | null> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<TodoRow>(
      `UPDATE todos
          SET deleted_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING *`,
      [id],
    );
    const todo = rows[0];
    if (!todo) return null;

    await recordRevision(client, {
      todoId: todo.id,
      changeKind: 'removed',
      snapshot: todo,
      actor,
    });
    return todo;
  });
}
