// Row shapes as they come back from Postgres (snake_case), and the camelCase
// DTOs the BFF and frontend consume. The mapper lives in repository.ts.

export type Visibility = 'private' | 'public';

export type BudgetRow = {
  id: string;
  owner_sub: string;
  name: string;
  cycle_start_day: number;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
};

export type PersonRow = {
  id: string;
  budget_id: string;
  name: string;
  user_sub: string | null;
  created_at: string;
};

export type MemberRow = {
  id: string;
  budget_id: string;
  user_sub: string;
  role: string;
  created_at: string;
  email?: string | null;
};

export type Split = { personId: string; amountCents: number };

export type ExpenseRow = {
  id: string;
  budget_id: string;
  category_id: string;
  amount_cents: number;
  occurred_at: string;
  person_id: string | null;
  tags: string[];
  splits: Split[] | null;
  note: string | null;
  vendor: string | null;
  created_by_sub: string | null;
  created_at: string;
  updated_at: string;
};

export type JoinRequestRow = {
  id: string;
  budget_id: string;
  requester_sub: string;
  requester_name: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
};

export type Role = 'owner' | 'member';

/** Fields a member may change on an expense. */
export type ExpensePatch = {
  categoryId?: string;
  amountCents?: number;
  occurredAt?: string;
  personId?: string | null;
  tags?: string[];
  note?: string | null;
  vendor?: string | null;
  splits?: Split[] | null;
};

/** Fields supplied when creating an expense. */
export type NewExpense = {
  categoryId: string;
  amountCents: number;
  occurredAt: string;
  personId?: string | null;
  tags?: string[];
  note?: string | null;
  vendor?: string | null;
  splits?: Split[] | null;
};
