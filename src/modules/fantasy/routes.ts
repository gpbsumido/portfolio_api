import { Router } from 'express';
import { env } from '../../config/env.js';
import { createHeaderKeyLimiter, createIpLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { AdjustmentsController } from './adjustments.controller.js';
import { idParamSchema, listQuerySchema, patchStatusSchema, postBatchSchema } from './adjustments.schemas.js';
import { adjWriteAuth } from './adjustments.write-auth.js';
import { FantasyController } from './controller.js';
import { CLIENT_KEY_HEADER, requireClientKey } from './results.client-key.js';
import { ResultsController } from './results.controller.js';
import { listResultsQuerySchema, resultInputSchema } from './results.schemas.js';

// CORS for the /adjustments routes (permissive, for the extension's
// moz-extension:// origin) is applied in app.ts BEFORE the global policy — it
// has to precede it or the global cors answers the write preflight itself. See
// the comment there.

const router = Router();
const ctrl = new FantasyController();
const adj = new AdjustmentsController();
const results = new ResultsController();

const readLimiter = createIpLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createIpLimiter({ windowMs: 60_000, max: 60 });
const writeAuth = adjWriteAuth(env.DRAFT_ADJ_SERVICE_TOKEN);

// Draft-results writes are open to any install, so throttle on BOTH the
// self-minted key and the source IP — a rotating key still hits the IP wall.
const resultsKeyLimiter = createHeaderKeyLimiter({ header: CLIENT_KEY_HEADER, windowMs: 60_000, max: 20 });
const resultsIpLimiter = createIpLimiter({ windowMs: 60_000, max: 40 });

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

// Draft Lab finished-draft records — any copy writes with a self-minted key,
// throttled per key and per IP; reads are public summaries.
router.get('/draft-results', readLimiter, validateQuery(listResultsQuerySchema), (req, res, next) => results.list(req, res, next));
router.post(
  '/draft-results',
  resultsIpLimiter,
  resultsKeyLimiter,
  requireClientKey(),
  validateBody(resultInputSchema),
  (req, res, next) => results.post(req, res, next),
);

export default router;
