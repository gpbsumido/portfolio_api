// ---------------------------------------------------------------------------
// Todos module — Express router
//
// Every route is admin-only. The list is a record of what has not been fixed
// yet, so it is gated at this boundary rather than relying on the BFF having
// checked: the BFF decides what to render, this decides what exists.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { requireAdmin } from '../../shared/auth/adminEmail.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { TodosController } from './controller.js';
import { updateTodoSchema, createTodoSchema, todoIdParamSchema } from './schemas.js';

const router = Router();
const ctrl = new TodosController();

router.use(checkJwt, requireAdmin);

router.get('/', (req, res, next) => ctrl.list(req, res, next));

router.post('/', validateBody(createTodoSchema), (req, res, next) => ctrl.create(req, res, next));

router.patch(
  '/:id',
  validateParams(todoIdParamSchema),
  validateBody(updateTodoSchema),
  (req, res, next) => ctrl.update(req, res, next),
);

router.delete('/:id', validateParams(todoIdParamSchema), (req, res, next) =>
  ctrl.remove(req, res, next),
);

export default router;
