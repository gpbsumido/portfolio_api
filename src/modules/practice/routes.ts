// ---------------------------------------------------------------------------
// Practice module — Express router
//
// Interview-prep review progress. Every route is the caller's own data, so the
// whole router needs a signed-in user and their users row (the table's
// foreign key points at it).
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { upsertUser } from '../../middleware/upsertUser.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { PracticeController } from './controller.js';
import { importReviewsSchema, reviewParamsSchema, saveReviewSchema } from './schemas.js';

const router = Router();
const ctrl = new PracticeController();

router.use(checkJwt, upsertUser);

router.get('/reviews', (req, res, next) => ctrl.list(req, res, next));

// Declared before the :kind route so "import" is never read as a kind.
router.post('/reviews/import', validateBody(importReviewsSchema), (req, res, next) =>
  ctrl.import(req, res, next),
);

router.put(
  '/reviews/:kind/:itemId',
  validateParams(reviewParamsSchema),
  validateBody(saveReviewSchema),
  (req, res, next) => ctrl.save(req, res, next),
);

export default router;
