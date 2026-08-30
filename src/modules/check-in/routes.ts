import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { createKeyedLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { CheckInController } from './controller.js';
import { arrivalSchema, createSiteSchema, siteParamsSchema } from './schemas.js';

const router = Router();
const ctrl = new CheckInController();

/**
 * A coarse ceiling on top of the per-window attempt counter in the controller.
 *
 * The counter is the real guess-rate control; this is here so a flood of
 * requests can't tie up the database on its way to being rejected. Keyed by
 * Auth0 sub, falling back to IP, because every request here is signed in.
 */
const submitLimiter = createKeyedLimiter({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) =>
    (req.auth?.payload as { sub?: string } | undefined)?.sub ?? req.ip ?? 'unknown',
});

// Every route needs a signed-in caller: organizers own sites, volunteers are
// recorded by subject rather than by a name they type.
router.use(checkJwt);

// GET /api/check-in/sites — sites the caller owns
router.get('/sites', (req, res, next) => ctrl.listSites(req, res, next));

// POST /api/check-in/sites — create one
router.post('/sites', validateBody(createSiteSchema), (req, res, next) =>
  ctrl.createSite(req, res, next),
);

// POST /api/check-in/arrivals — a volunteer submitting the displayed code.
// Declared before the /sites/:id routes so the literal segment wins.
router.post('/arrivals', submitLimiter, validateBody(arrivalSchema), (req, res, next) =>
  ctrl.checkIn(req, res, next),
);

// GET /api/check-in/sites/:id/code — what the on-site display shows
router.get('/sites/:id/code', validateParams(siteParamsSchema), (req, res, next) =>
  ctrl.currentCode(req, res, next),
);

// GET /api/check-in/sites/:id/arrivals — today's roster
router.get('/sites/:id/arrivals', validateParams(siteParamsSchema), (req, res, next) =>
  ctrl.listArrivals(req, res, next),
);

export default router;
