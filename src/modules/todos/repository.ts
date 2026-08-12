import { pool } from '../../config/database.js';
import type { TodoRow } from './types.js';

/** Every todo, in the order the page renders them. */
export async function listTodos(): Promise<TodoRow[]> {
  const { rows } = await pool.query<TodoRow>(
    `SELECT * FROM todos ORDER BY phase ASC, position ASC, created_at ASC`,
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
      RETURNING *`,
    [id, done],
  );
  return rows[0] ?? null;
}
