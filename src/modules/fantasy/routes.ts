import cors from 'cors';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { createIpLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { AdjustmentsController } from './adjustments.controller.js';
import { idParamSchema, listQuerySchema, patchStatusSchema, postBatchSchema } from './adjustments.schemas.js';
import { ADJ_TOKEN_HEADER, adjWriteAuth } from './adjustments.write-auth.js';
import { FantasyController } from './controller.js';

const router = Router();
const ctrl = new FantasyController();
const adj = new AdjustmentsController();

const readLimiter = createIpLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createIpLimiter({ windowMs: 60_000, max: 60 });
const writeAuth = adjWriteAuth(env.DRAFT_ADJ_SERVICE_TOKEN);

// The Draft Lab extension calls these from its own moz-extension:// page, whose
// origin the app's allowlist can't enumerate (it's a per-install UUID). These
// requests are non-credentialed — reads are public and writes authenticate with
// a custom header token, not a cookie — so a permissive origin is safe here even
// though the global CORS policy is locked to paulsumido.com. Scoped to this
// resource only, and it also answers the preflight the custom header triggers.
const adjCors = cors({
  origin: '*',
  methods: ['GET', 'PATCH', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', ADJ_TOKEN_HEADER],
});
router.use('/adjustments', adjCors);

router.get('/points/:year/:round', (req, res, next) => ctrl.getPoints(req, res, next));

// Draft Lab valuation adjustments — reads public, writes carry the shared secret.
router.get('/adjustments', readLimiter, validateQuery(listQuerySchema), (req, res, next) => adj.list(req, res, next));
router.patch(
  '/adjustments/:id',
  writeLimiter,
  writeAuth,
  validateParams(idParamSchema),
  validateBody(patchStatusSchema),
  (req, res, next) => adj.patch(req, res, next),
);
router.post(
  '/adjustments',
  writeLimiter,
  writeAuth,
  validateBody(postBatchSchema),
  (req, res, next) => adj.postBatch(req, res, next),
);

export default router;
