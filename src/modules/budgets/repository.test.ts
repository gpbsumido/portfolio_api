import { describe, test, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../config/database.js';
import {
  getAccess,
  findOrCreateOwnBudget,
  createExpense,
  updateExpense,
  findPublicBudgetByOwnerEmail,
  createJoinRequest,
  approveJoinRequest,
} from './repository.js';
import type { JoinRequestRow } from './types.js';

const sqlOf = (calls: unknown[][], i: number) =>
  String(calls[i]?.[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const paramsOf = (calls: unknown[][], i: number) => calls[i]?.[1] as unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('getAccess', () => {
  test('returns owner when the caller owns the budget', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{}], rowCount: 1 } as never);
    expect(await getAccess('b1', 'u1')).toBe('owner');
    expect(sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 0)).toContain(
      'from budgets where id = $1 and owner_sub = $2',
    );
  });

  test('falls through to a membership check, then null', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await getAccess('b1', 'u1')).toBeNull();
    expect(sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 1)).toContain('budget_members');
  });
});

describe('findOrCreateOwnBudget', () => {
  test('creates a budget and a person row for the owner when none exists', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // select existing
      .mockResolvedValueOnce({ rows: [{ id: 'new' }], rowCount: 1 } as never) // insert budget
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // insert person
    const budget = await findOrCreateOwnBudget('u1');
    expect(budget.id).toBe('new');
    const calls = vi.mocked(pool.query).mock.calls as unknown[][];
    expect(sqlOf(calls, 1)).toContain('insert into budgets');
    expect(sqlOf(calls, 2)).toContain('insert into budget_people');
  });
});

describe('createExpense', () => {
  test('serialises tags and splits as json and passes vendor', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'e1' }], rowCount: 1 } as never);
    await createExpense(
      'b1',
      {
        categoryId: 'food',
        amountCents: 1200,
        occurredAt: '2026-09-15T00:00:00.000Z',
        tags: ['necessary'],
        splits: [{ personId: 'p1', amountCents: 1200 }],
        vendor: 'Cafe',
        note: 'lunch',
      },
      'u1',
    );
    const params = paramsOf(vi.mocked(pool.query).mock.calls as unknown[][], 0);
    expect(sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 0)).toContain(
      'insert into budget_expenses',
    );
    expect(params).toContain(JSON.stringify(['necessary']));
    expect(params).toContain(JSON.stringify([{ personId: 'p1', amountCents: 1200 }]));
    expect(params).toContain('Cafe');
    expect(params).toContain('lunch');
  });

  test('stores null splits when none are given', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'e1' }], rowCount: 1 } as never);
    await createExpense(
      'b1',
      { categoryId: 'food', amountCents: 500, occurredAt: '2026-09-15T00:00:00.000Z' },
      'u1',
    );
    const params = paramsOf(vi.mocked(pool.query).mock.calls as unknown[][], 0);
    // tags default '[]', splits null
    expect(params).toContain('[]');
    expect(params).toContain(null);
  });
});

describe('updateExpense', () => {
  test('builds a dynamic SET scoped to the budget and id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'e1' }], rowCount: 1 } as never);
    await updateExpense('b1', 'e1', { amountCents: 2000, tags: ['unnecessary'] });
    const sql = sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 0);
    expect(sql).toContain('update budget_expenses set');
    expect(sql).toContain('amount_cents =');
    expect(sql).toContain('tags = $');
    expect(sql).toContain('::jsonb');
    expect(sql).toContain('where budget_id = $1 and id = $2');
  });
});

describe('findPublicBudgetByOwnerEmail', () => {
  test('matches on lowered email and only public budgets', async () => {
    await findPublicBudgetByOwnerEmail('Owner@Example.com');
    const sql = sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 0);
    expect(sql).toContain("visibility = 'public'");
    expect(sql).toContain('lower(u.email) = lower($1)');
  });
});

describe('createJoinRequest', () => {
  test('upserts one request per person per budget', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'r1' }], rowCount: 1 } as never);
    await createJoinRequest('b1', 'u2', 'Sam');
    const sql = sqlOf(vi.mocked(pool.query).mock.calls as unknown[][], 0);
    expect(sql).toContain('insert into budget_join_requests');
    expect(sql).toContain('on conflict (budget_id, requester_sub)');
  });
});

describe('approveJoinRequest', () => {
  test('marks approved, adds a member, and adds a person in one transaction', async () => {
    const calls: unknown[][] = [];
    const client = {
      query: vi.fn(async (...args: unknown[]) => {
        calls.push(args);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    const request: JoinRequestRow = {
      id: 'r1',
      budget_id: 'b1',
      requester_sub: 'u2',
      requester_name: 'Sam',
      status: 'pending',
      created_at: '2026-09-15T00:00:00.000Z',
    };
    await approveJoinRequest(request);

    const statements = calls.map((_, i) => sqlOf(calls, i));
    expect(statements[0]).toBe('begin');
    expect(statements[1]).toContain("status = 'approved'");
    expect(statements[2]).toContain('insert into budget_members');
    expect(statements[2]).toContain('on conflict (budget_id, user_sub) do nothing');
    expect(statements[3]).toContain('insert into budget_people');
    expect(statements[4]).toBe('commit');
    expect(client.release).toHaveBeenCalled();
  });
});
