// ---------------------------------------------------------------------------
// Feature-flags module — Express router
//
// Reads (list + audit) are public so the console works signed-out. The PATCH
// write requires an authenticated Auth0 user, same as the NBA picks writes; a
// signed-out toggle gets a 401 and the console shows a "sign in to change" state.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { createIpLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { FeatureFlagsController } from './controller.js';
import { flagKeyParamSchema, updateFlagBodySchema } from './schemas.js';

const router = Router();
const ctrl = new FeatureFlagsController();

// Public reads, throttled per IP; writes are stricter since they mutate state.
const readLimiter = createIpLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createIpLimiter({ windowMs: 60_000, max: 30 });

// GET /api/feature-flags — every flag plus the environment list
router.get('/', readLimiter, (req, res, next) => ctrl.list(req, res, next));

// GET /api/feature-flags/audit — the change log
router.get('/audit', readLimiter, (req, res, next) => ctrl.audit(req, res, next));

// PATCH /api/feature-flags/:flagKey — toggle kill switch / rollout (auth required)
router.patch(
  '/:flagKey',
  writeLimiter,
  checkJwt,
  validateParams(flagKeyParamSchema),
  validateBody(updateFlagBodySchema),
  (req, res, next) => ctrl.patch(req, res, next),
);

export default router;
