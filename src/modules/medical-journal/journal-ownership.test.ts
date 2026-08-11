import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MedJournalRepository } from './repository.js';
import { pool } from '../../config/database.js';

const VICTIM_ENTRY = '11111111-1111-1111-1111-111111111111';
const ATTACKER = 'auth0|attacker';

type Call = [string, unknown[]?];

/** Captures every statement issued inside the transaction. */
function stubClient(onQuery: (sql: string) => { rowCount: number; rows: unknown[] }) {
  const calls: Call[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      return onQuery(sql);
    }),
    release: vi.fn(),
  };
  (pool as unknown as { connect: unknown }).connect = vi.fn().mockResolvedValue(client);
  return { calls, client };
}

const sqlFor = (calls: Call[], fragment: string) =>
  calls.find(([sql]) => sql.replace(/\s+/g, ' ').includes(fragment));

// The mocked pool object is shared across files in a worker, so anything
// stubbed onto it here has to come back off or unrelated suites inherit it.
const hadConnect = 'connect' in (pool as object);
const originalConnect = (pool as unknown as { connect?: unknown }).connect;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (hadConnect) {
    (pool as unknown as { connect?: unknown }).connect = originalConnect;
  } else {
    delete (pool as unknown as { connect?: unknown }).connect;
  }
});

describe('medical journal ownership', () => {
  test('deleting an entry only removes feedback belonging to the caller', async () => {
    const { calls } = stubClient(() => ({ rowCount: 1, rows: [] }));

    await new MedJournalRepository().delete(VICTIM_ENTRY, ATTACKER);

    const feedbackDelete = sqlFor(calls, 'DELETE FROM feedback');
    expect(feedbackDelete).toBeDefined();
    expect(feedbackDelete?.[0]).toMatch(/user_sub/);
    expect(feedbackDelete?.[1]).toContain(ATTACKER);
  });

  test('saving against an entry id the caller does not own is rejected', async () => {
    // UPDATE matches nothing: the id belongs to someone else.
    const { calls } = stubClient((sql) =>
      sql.includes('UPDATE med_journal')
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [] },
    );

    const save = new MedJournalRepository().saveOrUpdate(
      {
        id: VICTIM_ENTRY,
        feedbackText: 'injected clinical note',
        rotation: 'Surgery',
      } as never,
      ATTACKER,
    );

    await expect(save).rejects.toThrow();
    // and crucially, nothing was written against the victim's entry
    expect(sqlFor(calls, 'INSERT INTO feedback')).toBeUndefined();
  });
});
