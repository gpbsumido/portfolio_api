import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors/AppError.js';
import type { Role } from './types.js';
import type {
  UpdateBudgetInput,
  AddPersonInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  CreateJoinRequestInput,
} from './schemas.js';

const subOf = (req: Request): string =>
  (req as { auth?: { payload?: { sub?: string } } }).auth?.payload?.sub as string;

export class BudgetsController {
  /**
   * The caller's access to a budget, or a 404 if none — a budget you cannot see
   * should not tell you it exists. `owner` demands ownership, `member` allows
   * either role.
   */
  private async requireAccess(req: Request, budgetId: string, min: Role): Promise<Role> {
    const role = await repo.getAccess(budgetId, subOf(req));
    if (!role) throw new NotFoundError('Budget not found');
    if (min === 'owner' && role !== 'owner') throw new ForbiddenError('Owner only');
    return role;
  }

  /** GET /api/budgets — the budgets the caller can see (own one auto-created). */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userSub = subOf(req);
      await repo.findOrCreateOwnBudget(userSub);
      res.json({ budgets: await repo.listAccessibleBudgets(userSub) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/budgets/:budgetId — the full budget. */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId } = req.params as { budgetId: string };
      const role = await this.requireAccess(req, budgetId, 'member');
      const budget = await repo.getBudgetDetail(budgetId, role);
      if (!budget) throw new NotFoundError('Budget not found');
      res.json({ budget });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/budgets/:budgetId — settings, owner only. */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId } = req.params as { budgetId: string };
      await this.requireAccess(req, budgetId, 'owner');
      await repo.updateBudget(budgetId, req.body as UpdateBudgetInput);
      res.json({ budget: await repo.getBudgetDetail(budgetId, 'owner') });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/budgets/:budgetId/people — add a person to attribute to. */
  async addPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId } = req.params as { budgetId: string };
      await this.requireAccess(req, budgetId, 'member');
      const { name } = req.body as AddPersonInput;
      await repo.addPerson(budgetId, name);
      const role = await repo.getAccess(budgetId, subOf(req));
      res.status(201).json({ budget: await repo.getBudgetDetail(budgetId, role as Role) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/budgets/:budgetId/expenses — log a spend. */
  async createExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId } = req.params as { budgetId: string };
      const role = await this.requireAccess(req, budgetId, 'member');
      await repo.createExpense(budgetId, req.body as CreateExpenseInput, subOf(req));
      res.status(201).json({ budget: await repo.getBudgetDetail(budgetId, role) });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/budgets/:budgetId/expenses/:expenseId — edit a spend. */
  async updateExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId, expenseId } = req.params as { budgetId: string; expenseId: string };
      const role = await this.requireAccess(req, budgetId, 'member');
      const updated = await repo.updateExpense(budgetId, expenseId, req.body as UpdateExpenseInput);
      if (!updated) throw new NotFoundError('Expense not found');
      res.json({ budget: await repo.getBudgetDetail(budgetId, role) });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/budgets/:budgetId/expenses/:expenseId */
  async deleteExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId, expenseId } = req.params as { budgetId: string; expenseId: string };
      const role = await this.requireAccess(req, budgetId, 'member');
      const removed = await repo.deleteExpense(budgetId, expenseId);
      if (!removed) throw new NotFoundError('Expense not found');
      res.json({ budget: await repo.getBudgetDetail(budgetId, role) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/budgets/join-requests — ask to join a public budget by owner email. */
  async createJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ownerEmail, name } = req.body as CreateJoinRequestInput;
      const budget = await repo.findPublicBudgetByOwnerEmail(ownerEmail);
      // Same 404 whether no such budget exists or it is private — a public/private
      // flag should not become a way to probe which emails have a budget.
      if (!budget) throw new NotFoundError('No public budget found for that email');
      const requesterSub = subOf(req);
      if (budget.owner_sub === requesterSub) {
        throw new ConflictError('That is your own budget');
      }
      const request = await repo.createJoinRequest(budget.id, requesterSub, name);
      res.status(201).json({ request: { id: request.id, status: request.status } });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/budgets/:budgetId/join-requests/:requestId/approve — owner only. */
  async approveJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId, requestId } = req.params as { budgetId: string; requestId: string };
      await this.requireAccess(req, budgetId, 'owner');
      const request = await repo.getJoinRequest(budgetId, requestId);
      if (!request) throw new NotFoundError('Request not found');
      await repo.approveJoinRequest(request);
      res.json({ budget: await repo.getBudgetDetail(budgetId, 'owner') });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/budgets/:budgetId/join-requests/:requestId/deny — owner only. */
  async denyJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budgetId, requestId } = req.params as { budgetId: string; requestId: string };
      await this.requireAccess(req, budgetId, 'owner');
      await repo.denyJoinRequest(budgetId, requestId);
      res.json({ budget: await repo.getBudgetDetail(budgetId, 'owner') });
    } catch (err) {
      next(err);
    }
  }
}
