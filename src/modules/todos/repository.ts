import { pool } from '../../config/database.js';
import type { TodoRow, NewTodo } from './types.js';

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
 */
export async function setDone(id: string, done: boolean): Promise<TodoRow | null> {
  const { rows } = await pool.query<TodoRow>(
    `UPDATE todos
        SET done = $2,
            done_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
            updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *`,
    [id, done],
  );
  return rows[0] ?? null;
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
export async function createTodo(input: NewTodo): Promise<TodoRow> {
  const { rows } = await pool.query<TodoRow>(
    `INSERT INTO todos (project, phase, title, detail, position)
     SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1
       FROM todos
      WHERE phase = $2
     RETURNING *`,
    [input.project, input.phase, input.title, input.detail],
  );
  return rows[0];
}

/**
 * Hides an item without losing it.
 *
 * The deleted_at IS NULL guard is what lets a second delete answer 404 rather
 * than quietly succeeding and moving the timestamp.
 */
export async function softDeleteTodo(id: string): Promise<TodoRow | null> {
  const { rows } = await pool.query<TodoRow>(
    `UPDATE todos
        SET deleted_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
