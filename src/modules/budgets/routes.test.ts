import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { EMAIL_CLAIM_NS } from '../../shared/auth/adminEmail.js';

let claims: Record<string, unknown> = {};

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({
  getAccess: vi.fn(),
  findOrCreateOwnBudget: vi.fn(),
  listAccessibleBudgets: vi.fn(),
  getBudgetDetail: vi.fn(),
  updateBudget: vi.fn(),
  addPerson: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  findPublicBudgetByOwnerEmail: vi.fn(),
  createJoinRequest: vi.fn(),
  getJoinRequest: vi.fn(),
  approveJoinRequest: vi.fn(),
  denyJoinRequest: vi.fn(),
}));

import budgetsRouter from './routes.js';
import * as repo from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const BUDGET = '11111111-1111-1111-1111-111111111111';
const EXPENSE = '22222222-2222-2222-2222-222222222222';
const REQUEST = '33333333-3333-3333-3333-333333333333';

const signedIn = (sub: string, email = 'me@example.com') => ({
  sub,
  [`${EMAIL_CLAIM_NS}email`]: email,
  [`${EMAIL_CLAIM_NS}email_verified`]: true,
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/budgets', budgetsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  claims = signedIn('auth0|me');
  vi.mocked(repo.getBudgetDetail).mockResolvedValue({ id: BUDGET } as never);
});

describe('GET /api/budgets', () => {
  test('provisions the caller a budget and lists what they can see', async () => {
    vi.mocked(repo.listAccessibleBudgets).mockResolvedValue([
      { id: BUDGET, name: 'My budget', role: 'owner' },
    ]);
    const res = await request(makeApp()).get('/api/budgets');
    expect(res.status).toBe(200);
    expect(repo.findOrCreateOwnBudget).toHaveBeenCalledWith('auth0|me');
    expect(res.body.budgets).toHaveLength(1);
  });
});

describe('GET /api/budgets/:budgetId', () => {
  test('404 when the caller has no access', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/budgets/${BUDGET}`);
    expect(res.status).toBe(404);
  });

  test('200 for a member', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('member');
    const res = await request(makeApp()).get(`/api/budgets/${BUDGET}`);
    expect(res.status).toBe(200);
    expect(res.body.budget.id).toBe(BUDGET);
  });
});

describe('PATCH /api/budgets/:budgetId', () => {
  test('a member cannot change settings', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('member');
    const res = await request(makeApp())
      .patch(`/api/budgets/${BUDGET}`)
      .send({ visibility: 'public' });
    expect(res.status).toBe(403);
    expect(repo.updateBudget).not.toHaveBeenCalled();
  });

  test('the owner can', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('owner');
    const res = await request(makeApp())
      .patch(`/api/budgets/${BUDGET}`)
      .send({ visibility: 'public' });
    expect(res.status).toBe(200);
    expect(repo.updateBudget).toHaveBeenCalledWith(BUDGET, { visibility: 'public' });
  });
});

describe('POST /api/budgets/:budgetId/expenses', () => {
  test('a member can log a spend', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('member');
    const res = await request(makeApp())
      .post(`/api/budgets/${BUDGET}/expenses`)
      .send({ categoryId: 'food', amountCents: 1200, occurredAt: '2026-09-15T00:00:00.000Z', vendor: 'Cafe' });
    expect(res.status).toBe(201);
    expect(repo.createExpense).toHaveBeenCalled();
  });

  test('validation rejects a non-positive amount', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('member');
    const res = await request(makeApp())
      .post(`/api/budgets/${BUDGET}/expenses`)
      .send({ categoryId: 'food', amountCents: 0, occurredAt: '2026-09-15T00:00:00.000Z' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE expense', () => {
  test('404 when the expense is not in the budget', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('member');
    vi.mocked(repo.deleteExpense).mockResolvedValue(null as never);
    const res = await request(makeApp()).delete(`/api/budgets/${BUDGET}/expenses/${EXPENSE}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/budgets/join-requests', () => {
  test('creates a request against the public budget found by owner email', async () => {
    vi.mocked(repo.findPublicBudgetByOwnerEmail).mockResolvedValue({
      id: BUDGET,
      owner_sub: 'auth0|owner',
    } as never);
    vi.mocked(repo.createJoinRequest).mockResolvedValue({ id: REQUEST, status: 'pending' } as never);
    const res = await request(makeApp())
      .post('/api/budgets/join-requests')
      .send({ ownerEmail: 'owner@example.com', name: 'Sam' });
    expect(res.status).toBe(201);
    expect(repo.createJoinRequest).toHaveBeenCalledWith(BUDGET, 'auth0|me', 'Sam');
  });

  test('404 when no public budget matches the email', async () => {
    vi.mocked(repo.findPublicBudgetByOwnerEmail).mockResolvedValue(null as never);
    const res = await request(makeApp())
      .post('/api/budgets/join-requests')
      .send({ ownerEmail: 'nobody@example.com', name: 'Sam' });
    expect(res.status).toBe(404);
  });

  test('409 when you ask to join your own budget', async () => {
    vi.mocked(repo.findPublicBudgetByOwnerEmail).mockResolvedValue({
      id: BUDGET,
      owner_sub: 'auth0|me',
    } as never);
    const res = await request(makeApp())
      .post('/api/budgets/join-requests')
      .send({ ownerEmail: 'me@example.com', name: 'Me' });
    expect(res.status).toBe(409);
  });
});

describe('approve / deny', () => {
  test('a member cannot approve a request', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('member');
    const res = await request(makeApp()).post(
      `/api/budgets/${BUDGET}/join-requests/${REQUEST}/approve`,
    );
    expect(res.status).toBe(403);
  });

  test('the owner approves an existing request', async () => {
    vi.mocked(repo.getAccess).mockResolvedValue('owner');
    vi.mocked(repo.getJoinRequest).mockResolvedValue({ id: REQUEST } as never);
    const res = await request(makeApp()).post(
      `/api/budgets/${BUDGET}/join-requests/${REQUEST}/approve`,
    );
    expect(res.status).toBe(200);
    expect(repo.approveJoinRequest).toHaveBeenCalled();
  });
});
