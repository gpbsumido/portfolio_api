import { describe, test, expect, vi, beforeEach } from 'vitest';
// The pool is already mocked globally in shared/testing/setup.ts. Re-mocking it
// here would drop end()/on()/connect() and break teardown for this file only.
import { pool } from '../../config/database.js';
import { listTodos, setDone, createTodo, softDeleteTodo } from './repository.js';

const ID = '11111111-1111-1111-1111-111111111111';

/** Whitespace-collapsed, lowercased SQL of one recorded call. */
const sqlOf = (calls: unknown[][], i: number) =>
  String(calls[i]?.[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * A stand-in for a checked-out client that records every statement.
 *
 * Mutations run inside a transaction now, so what matters is not just the SQL
 * but that the row change and its revision happen on the same client between
 * BEGIN and COMMIT. Recording the sequence is what makes that checkable.
 */
function fakeClient(rows: Record<string, unknown>[] = [{ id: ID }]) {
  const calls: unknown[][] = [];
  const query = vi.fn(async (...args: unknown[]) => {
    calls.push(args);
    const text = String(args[0]);
    if (/^\s*(begin|commit|rollback)/i.test(text)) return { rows: [] };
    return { rows };
  });
  return { client: { query, release: vi.fn() }, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
});

describe('reading the list', () => {
  test('deleted items are not listed', async () => {
    await listTodos();
    expect(sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 0)).toContain(
      'deleted_at is null',
    );
  });
});

describe('every mutation leaves a trace', () => {
  test('ticking records a revision in the same transaction', async () => {
    const { client, calls } = fakeClient();
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    await setDone(ID, true, 'owner@example.com');

    const statements = calls.map((_, i) => sqlOf(calls, i));
    expect(statements[0]).toBe('begin');
    expect(statements[1]).toContain('update todos');
    expect(statements[2]).toContain('insert into todo_revisions');
    expect(statements[3]).toBe('commit');
  });

  test('the revision records which way the tick went', async () => {
    const ticked = fakeClient();
    vi.mocked(pool.connect).mockResolvedValue(ticked.client as never);
    await setDone(ID, true);
    expect(ticked.calls[2]?.[1]).toContain('ticked');

    const unticked = fakeClient();
    vi.mocked(pool.connect).mockResolvedValue(unticked.client as never);
    await setDone(ID, false);
    expect(unticked.calls[2]?.[1]).toContain('unticked');
  });

  test('creating records a revision too', async () => {
    const { client, calls } = fakeClient();
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    await createTodo(
      { title: 'Write it down', project: 'all', phase: 4, detail: null, reason: null },
      null,
    );

    expect(sqlOf(calls, 1)).toContain('insert into todos');
    // position comes from max+1 inside the insert. Reading the max in a
    // separate round trip would let two adds claim the same slot.
    expect(sqlOf(calls, 1)).toContain('max(position)');
    expect(sqlOf(calls, 2)).toContain('insert into todo_revisions');
    expect(calls[2]?.[1]).toContain('created');
  });

  test('removing is a soft delete, and is recorded', async () => {
    const { client, calls } = fakeClient();
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    await softDeleteTodo(ID);

    expect(sqlOf(calls, 1)).toContain('set deleted_at = now()');
    expect(sqlOf(calls, 1)).not.toContain('delete from');
    // The guard is what makes a second delete a 404 rather than a silent success.
    expect(sqlOf(calls, 1)).toContain('deleted_at is null');
    expect(calls[2]?.[1]).toContain('removed');
  });

  test('a revision number is never read and written back', async () => {
    const { client, calls } = fakeClient();
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    await setDone(ID, true);

    // Computed inside the insert, so two concurrent writes cannot land on the
    // same number. The unique constraint catches whatever this does not.
    expect(sqlOf(calls, 2)).toContain('max(revision)');
  });

  test('nothing is committed when the revision fails', async () => {
    const calls: unknown[][] = [];
    const query = vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      if (/todo_revisions/i.test(String(args[0]))) throw new Error('revision insert failed');
      return { rows: [{ id: ID }] };
    });
    vi.mocked(pool.connect).mockResolvedValue({ query, release: vi.fn() } as never);

    await expect(setDone(ID, true)).rejects.toThrow('revision insert failed');

    // The whole point of the transaction: a change that could not be recorded
    // must not survive, or the history is quietly incomplete.
    expect(calls.map((_, i) => sqlOf(calls, i))).toContain('rollback');
  });
});

describe('a missing row', () => {
  test('ticking one that is not there returns null rather than recording', async () => {
    const { client, calls } = fakeClient([]);
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    expect(await setDone(ID, true)).toBeNull();
    expect(calls.some((_, i) => sqlOf(calls, i).includes('todo_revisions'))).toBe(false);
  });
});
