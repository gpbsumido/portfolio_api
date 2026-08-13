import { describe, test, expect, vi, beforeEach } from 'vitest';
// The pool is already mocked globally in shared/testing/setup.ts. Re-mocking it
// here would drop end()/on() and break teardown for this file only.
import { pool } from '../../config/database.js';
import { listTodos, setDone, createTodo, softDeleteTodo } from './repository.js';

const ID = '11111111-1111-1111-1111-111111111111';

/** The SQL of the nth call, whitespace-collapsed and lowercased. */
function sqlOf(call = 0): string {
  const [text] = vi.mocked(pool.query).mock.calls[call] as unknown as [string];
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function paramsOf(call = 0): unknown[] {
  const [, params] = vi.mocked(pool.query).mock.calls[call] as unknown as [string, unknown[]];
  return params;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
});

describe('reading the list', () => {
  test('deleted items are not listed', async () => {
    await listTodos();

    expect(sqlOf()).toContain('deleted_at is null');
  });
});

describe('creating', () => {
  test('a new item lands at the end of its phase rather than colliding', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: ID }] } as never);

    await createTodo({ title: 'Write it down', project: 'all', phase: 4, detail: null });

    // position comes from max+1 computed inside the insert. Reading the max in
    // a separate round trip would let two adds claim the same slot.
    const sql = sqlOf();
    expect(sql).toContain('max(position)');
    expect(sql).toContain('insert into todos');
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1);
  });

  test('the caller never supplies position', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: ID }] } as never);

    await createTodo({ title: 'Write it down', project: 'all', phase: 4, detail: null });

    expect(paramsOf()).toEqual(['all', 4, 'Write it down', null]);
  });
});

describe('deleting', () => {
  test('deleting sets deleted_at rather than removing the row', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: ID }] } as never);

    await softDeleteTodo(ID);

    const sql = sqlOf();
    expect(sql).toContain('set deleted_at = now()');
    expect(sql).not.toContain('delete from');
  });

  test('deleting something already deleted matches no row', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    expect(await softDeleteTodo(ID)).toBeNull();
    // The guard is what makes a second delete a 404 instead of a silent success.
    expect(sqlOf()).toContain('deleted_at is null');
  });
});

describe('ticking', () => {
  test('a deleted item cannot be ticked', async () => {
    await setDone(ID, true);

    expect(sqlOf()).toContain('deleted_at is null');
  });
});
