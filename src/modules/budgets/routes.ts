// ---------------------------------------------------------------------------
// Budgets module — Express router
//
// Every route needs a signed-in user (checkJwt) and their users row
// (upsertUser), because sharing resolves emails against that table. Per-route
// permission (owner vs member vs any signed-in) is enforced in the controller,
// which is the only place that has read the budget to decide.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { upsertUser } from '../../middleware/upsertUser.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { BudgetsController } from './controller.js';
import {
  updateBudgetSchema,
  addPersonSchema,
  createExpenseSchema,
  updateExpenseSchema,
  createJoinRequestSchema,
  budgetIdParamSchema,
  expenseParamSchema,
  requestParamSchema,
} from './schemas.js';

const router = Router();
const ctrl = new BudgetsController();

router.use(checkJwt, upsertUser);

router.get('/', (req, res, next) => ctrl.list(req, res, next));

// Asking to join is found by owner email, so it is not under a budget id.
router.post('/join-requests', validateBody(createJoinRequestSchema), (req, res, next) =>
  ctrl.createJoinRequest(req, res, next),
);

router.get('/:budgetId', validateParams(budgetIdParamSchema), (req, res, next) =>
  ctrl.get(req, res, next),
);

router.patch(
  '/:budgetId',
  validateParams(budgetIdParamSchema),
  validateBody(updateBudgetSchema),
  (req, res, next) => ctrl.update(req, res, next),
);

router.post(
  '/:budgetId/people',
  validateParams(budgetIdParamSchema),
  validateBody(addPersonSchema),
  (req, res, next) => ctrl.addPerson(req, res, next),
);

router.post(
  '/:budgetId/expenses',
  validateParams(budgetIdParamSchema),
  validateBody(createExpenseSchema),
  (req, res, next) => ctrl.createExpense(req, res, next),
);

router.patch(
  '/:budgetId/expenses/:expenseId',
  validateParams(expenseParamSchema),
  validateBody(updateExpenseSchema),
  (req, res, next) => ctrl.updateExpense(req, res, next),
);

router.delete('/:budgetId/expenses/:expenseId', validateParams(expenseParamSchema), (req, res, next) =>
  ctrl.deleteExpense(req, res, next),
);

router.post(
  '/:budgetId/join-requests/:requestId/approve',
  validateParams(requestParamSchema),
  (req, res, next) => ctrl.approveJoinRequest(req, res, next),
);

router.post(
  '/:budgetId/join-requests/:requestId/deny',
  validateParams(requestParamSchema),
  (req, res, next) => ctrl.denyJoinRequest(req, res, next),
);

export default router;
