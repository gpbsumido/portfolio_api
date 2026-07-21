// ---------------------------------------------------------------------------
// Referrals module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { createIpLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { ReferralsController } from './controller.js';
import { createReferralSchema, slugParamSchema } from './schemas.js';

const router = Router();
const ctrl = new ReferralsController();

// Public demo endpoints, so keep basic IP throttles on the writes.
const createLimiter = createIpLimiter({ windowMs: 60_000, max: 10 });
const clickLimiter = createIpLimiter({ windowMs: 60_000, max: 60 });

// POST /api/referrals — create a shareable link
router.post('/', createLimiter, validateBody(createReferralSchema), (req, res, next) =>
  ctrl.create(req, res, next),
);

// GET /api/referrals/:slug — resolve a link
router.get('/:slug', validateParams(slugParamSchema), (req, res, next) => ctrl.get(req, res, next));

// POST /api/referrals/:slug/clicks — record a click
router.post('/:slug/clicks', clickLimiter, validateParams(slugParamSchema), (req, res, next) =>
  ctrl.click(req, res, next),
);

// GET /api/referrals/:slug/stats — click count plus a recent sample
router.get('/:slug/stats', validateParams(slugParamSchema), (req, res, next) =>
  ctrl.stats(req, res, next),
);

export default router;
