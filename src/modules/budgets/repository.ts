import { pool } from '../../config/database.js';
import type {
  BudgetRow,
  PersonRow,
  MemberRow,
  ExpenseRow,
  JoinRequestRow,
  Role,
  NewExpense,
  ExpensePatch,
} from './types.js';

// ---------------------------------------------------------------------------
// camelCase DTOs the BFF and frontend consume
// ---------------------------------------------------------------------------

const toPerson = (r: PersonRow) => ({ id: r.id, name: r.name, userSub: r.user_sub });
const toMember = (r: MemberRow) => ({
  id: r.id,
  userSub: r.user_sub,
  email: r.email ?? null,
  role: r.role,
});
const toExpense = (r: ExpenseRow) => ({
  id: r.id,
  categoryId: r.category_id,
  amountCents: r.amount_cents,
  occurredAt: new Date(r.occurred_at).toISOString(),
  personId: r.person_id,
  tags: r.tags ?? [],
  splits: r.splits ?? undefined,
  note: r.note ?? undefined,
  vendor: r.vendor ?? undefined,
});
const toJoinRequest = (r: JoinRequestRow) => ({
  id: r.id,
  name: r.requester_name,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
});

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * The caller's relationship to a budget: 'owner', 'member', or null when they
 * have no access. Every mutation checks this first — the BFF decides what to
 * render, this decides what a caller is allowed to touch.
 */
export async function getAccess(budgetId: string, userSub: string): Promise<Role | null> {
  const owner = await pool.query(`SELECT 1 FROM budgets WHERE id = $1 AND owner_sub = $2`, [
    budgetId,
    userSub,
  ]);
  if (owner.rowCount) return 'owner';
  const member = await pool.query(
    `SELECT 1 FROM budget_members WHERE budget_id = $1 AND user_sub = $2`,
    [budgetId, userSub],
  );
  return member.rowCount ? 'member' : null;
}

/**
 * The budget the caller owns, created on first read so a signed-in user always
 * has one. A person row for the owner comes with it, so their own spend has
 * something to attribute to from the start.
 */
export async function findOrCreateOwnBudget(userSub: string): Promise<BudgetRow> {
  const existing = await pool.query<BudgetRow>(`SELECT * FROM budgets WHERE owner_sub = $1`, [
    userSub,
  ]);
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query<BudgetRow>(
    `INSERT INTO budgets (owner_sub) VALUES ($1) RETURNING *`,
    [userSub],
  );
  const budget = created.rows[0];
  await pool.query(
    `INSERT INTO budget_people (budget_id, name, user_sub)
     SELECT $1, COALESCE((SELECT email FROM users WHERE sub = $2), 'You'), $2`,
    [budget.id, userSub],
  );
  return budget;
}

/** Every budget the caller can see: the one they own plus any they joined. */
export async function listAccessibleBudgets(
  userSub: string,
): Promise<{ id: string; name: string; role: Role }[]> {
  const { rows } = await pool.query<{ id: string; name: string; role: Role }>(
    `SELECT b.id, b.name, 'owner' AS role FROM budgets b WHERE b.owner_sub = $1
     UNION
     SELECT b.id, b.name, 'member' AS role
       FROM budget_members m JOIN budgets b ON b.id = m.budget_id
      WHERE m.user_sub = $1
      ORDER BY role DESC`,
    [userSub],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Reads that assemble the full budget
// ---------------------------------------------------------------------------

export async function getBudgetRow(budgetId: string): Promise<BudgetRow | null> {
  const { rows } = await pool.query<BudgetRow>(`SELECT * FROM budgets WHERE id = $1`, [budgetId]);
  return rows[0] ?? null;
}

/** The owner's email — the address others use to ask to join. */
export async function getOwnerEmail(budgetId: string): Promise<string | null> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT u.email FROM budgets b JOIN users u ON u.sub = b.owner_sub WHERE b.id = $1`,
    [budgetId],
  );
  return rows[0]?.email ?? null;
}

/**
 * The whole budget as the frontend reads it. Join requests are only assembled
 * for the owner; a member has no business seeing who else is asking.
 */
export async function getBudgetDetail(budgetId: string, role: Role) {
  const [budget, ownerEmail, people, members, expenses] = await Promise.all([
    getBudgetRow(budgetId),
    getOwnerEmail(budgetId),
    pool.query<PersonRow>(`SELECT * FROM budget_people WHERE budget_id = $1 ORDER BY created_at`, [
      budgetId,
    ]),
    pool.query<MemberRow>(
      `SELECT m.*, u.email FROM budget_members m JOIN users u ON u.sub = m.user_sub
        WHERE m.budget_id = $1 ORDER BY m.created_at`,
      [budgetId],
    ),
    pool.query<ExpenseRow>(
      `SELECT * FROM budget_expenses WHERE budget_id = $1 ORDER BY occurred_at DESC`,
      [budgetId],
    ),
  ]);
  if (!budget) return null;

  const joinRequests =
    role === 'owner'
      ? (
          await pool.query<JoinRequestRow>(
            `SELECT * FROM budget_join_requests WHERE budget_id = $1 AND status = 'pending' ORDER BY created_at`,
            [budgetId],
          )
        ).rows.map(toJoinRequest)
      : [];

  return {
    id: budget.id,
    name: budget.name,
    cycleStartDay: budget.cycle_start_day,
    visibility: budget.visibility,
    ownerEmail,
    role,
    people: people.rows.map(toPerson),
    members: members.rows.map(toMember),
    expenses: expenses.rows.map(toExpense),
    joinRequests,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function updateBudget(
  budgetId: string,
  patch: { name?: string; cycleStartDay?: number; visibility?: string },
): Promise<BudgetRow | null> {
  const values: unknown[] = [budgetId];
  const sets: string[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.cycleStartDay !== undefined) set('cycle_start_day', patch.cycleStartDay);
  if (patch.visibility !== undefined) set('visibility', patch.visibility);
  if (sets.length === 0) return getBudgetRow(budgetId);

  const { rows } = await pool.query<BudgetRow>(
    `UPDATE budgets SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function addPerson(budgetId: string, name: string): Promise<PersonRow> {
  const { rows } = await pool.query<PersonRow>(
    `INSERT INTO budget_people (budget_id, name) VALUES ($1, $2) RETURNING *`,
    [budgetId, name],
  );
  return rows[0];
}

export async function createExpense(
  budgetId: string,
  input: NewExpense,
  createdBySub: string,
): Promise<ExpenseRow> {
  const { rows } = await pool.query<ExpenseRow>(
    `INSERT INTO budget_expenses
       (budget_id, category_id, amount_cents, occurred_at, person_id, tags, splits, note, vendor, created_by_sub)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
     RETURNING *`,
    [
      budgetId,
      input.categoryId,
      input.amountCents,
      input.occurredAt,
      input.personId ?? null,
      JSON.stringify(input.tags ?? []),
      input.splits ? JSON.stringify(input.splits) : null,
      input.note ?? null,
      input.vendor ?? null,
      createdBySub,
    ],
  );
  return rows[0];
}

const EXPENSE_COLUMNS: Record<keyof ExpensePatch, { col: string; json?: boolean }> = {
  categoryId: { col: 'category_id' },
  amountCents: { col: 'amount_cents' },
  occurredAt: { col: 'occurred_at' },
  personId: { col: 'person_id' },
  tags: { col: 'tags', json: true },
  splits: { col: 'splits', json: true },
  note: { col: 'note' },
  vendor: { col: 'vendor' },
};

export async function updateExpense(
  budgetId: string,
  expenseId: string,
  patch: ExpensePatch,
): Promise<ExpenseRow | null> {
  const values: unknown[] = [budgetId, expenseId];
  const sets: string[] = [];
  for (const key of Object.keys(patch) as (keyof ExpensePatch)[]) {
    const spec = EXPENSE_COLUMNS[key];
    if (!spec) continue;
    const raw = patch[key];
    values.push(spec.json && raw != null ? JSON.stringify(raw) : (raw ?? null));
    sets.push(`${spec.col} = $${values.length}${spec.json ? '::jsonb' : ''}`);
  }
  if (sets.length === 0) return null;

  const { rows } = await pool.query<ExpenseRow>(
    `UPDATE budget_expenses SET ${sets.join(', ')}, updated_at = NOW()
      WHERE budget_id = $1 AND id = $2 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteExpense(
  budgetId: string,
  expenseId: string,
): Promise<ExpenseRow | null> {
  const { rows } = await pool.query<ExpenseRow>(
    `DELETE FROM budget_expenses WHERE budget_id = $1 AND id = $2 RETURNING *`,
    [budgetId, expenseId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Sharing: discovery by email, join requests, approval
// ---------------------------------------------------------------------------

/** A public budget owned by the given verified email, or null. */
export async function findPublicBudgetByOwnerEmail(email: string): Promise<BudgetRow | null> {
  const { rows } = await pool.query<BudgetRow>(
    `SELECT b.* FROM budgets b JOIN users u ON u.sub = b.owner_sub
      WHERE lower(u.email) = lower($1) AND b.visibility = 'public'`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * Record an ask to join. One outstanding request per person per budget — asking
 * again just refreshes it rather than stacking duplicates the owner has to
 * wade through.
 */
export async function createJoinRequest(
  budgetId: string,
  requesterSub: string,
  requesterName: string,
): Promise<JoinRequestRow> {
  const { rows } = await pool.query<JoinRequestRow>(
    `INSERT INTO budget_join_requests (budget_id, requester_sub, requester_name, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (budget_id, requester_sub)
       DO UPDATE SET requester_name = EXCLUDED.requester_name, status = 'pending', created_at = NOW()
     RETURNING *`,
    [budgetId, requesterSub, requesterName],
  );
  return rows[0];
}

export async function getJoinRequest(
  budgetId: string,
  requestId: string,
): Promise<JoinRequestRow | null> {
  const { rows } = await pool.query<JoinRequestRow>(
    `SELECT * FROM budget_join_requests WHERE id = $1 AND budget_id = $2`,
    [requestId, budgetId],
  );
  return rows[0] ?? null;
}

/**
 * Approve a request: mark it approved, add the requester as a member, and give
 * them a person row to attribute spend to — all in one transaction, so access
 * and attribution can never land half-applied.
 */
export async function approveJoinRequest(request: JoinRequestRow): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE budget_join_requests SET status = 'approved' WHERE id = $1`, [
      request.id,
    ]);
    await client.query(
      `INSERT INTO budget_members (budget_id, user_sub, role)
       VALUES ($1, $2, 'editor')
       ON CONFLICT (budget_id, user_sub) DO NOTHING`,
      [request.budget_id, request.requester_sub],
    );
    await client.query(
      `INSERT INTO budget_people (budget_id, name, user_sub) VALUES ($1, $2, $3)`,
      [request.budget_id, request.requester_name, request.requester_sub],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function denyJoinRequest(budgetId: string, requestId: string): Promise<void> {
  await pool.query(
    `UPDATE budget_join_requests SET status = 'denied' WHERE id = $1 AND budget_id = $2`,
    [requestId, budgetId],
  );
}
