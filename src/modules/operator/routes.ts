// ---------------------------------------------------------------------------
// Operator module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { env } from '../../config/index.js';
import { createIpLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { OperatorController } from './controller.js';
import { requireServiceToken } from './service-token.js';
import {
  alertIdParamSchema,
  completeSessionSchema,
  planogramUpdateSchema,
  promotionBodySchema,
  promotionIdParamSchema,
  restockBodySchema,
  restockLineSchema,
  sessionIdParamSchema,
  sessionLineParamSchema,
  storeIdParamSchema,
} from './schemas.js';

const router = Router();
const ctrl = new OperatorController();

/**
 * Reads here are open on purpose: the operator dashboard is a public demo and
 * anyone should be able to click around it without an account.
 *
 * Writes are a different question. User auth via checkJwt would 401 every
 * restock coming from the demo and the frontend would fall back to its
 * in-memory seed, which is exactly the fiction this feature set removed. But
 * leaving writes wide open means anyone can point curl at the API and mutate
 * the data directly, going around the app entirely.
 *
 * So writes carry a shared secret that only paul-explore's BFF holds. Visitors
 * are unaffected because the BFF calls these server-side on their behalf; a
 * direct caller gets a 401. It authenticates the service, not the person, and
 * the tradeoffs of that are written up in the operator-dashboard notes.
 */
const requireService = requireServiceToken(env.OPERATOR_SERVICE_TOKEN);

/**
 * Rate limits are deliberately much higher than the feature-flags module's,
 * because this traffic does not arrive the way that module's does. Every
 * legitimate operator request reaches us server-side from the BFF, so it all
 * shares a handful of Vercel egress IPs rather than one bucket per visitor. A
 * single open dashboard polls roughly 8 times a minute, so a flags-sized
 * 120/min ceiling would start 429ing real users at about fifteen concurrent
 * tabs while doing nothing about distributed abuse.
 *
 * This is a runaway backstop, not per-user fairness. Doing fairness properly
 * needs the BFF to forward who the caller is, which is a bigger piece of work.
 */
const readLimiter = createIpLimiter({ windowMs: 60_000, max: 1_000 });
const writeLimiter = createIpLimiter({ windowMs: 60_000, max: 200 });

// GET /api/operator/stores — the fleet list
router.get('/stores', readLimiter, (req, res, next) => ctrl.listStores(req, res, next));

// GET /api/operator/sales-analytics — fleet-wide sales rollup, aggregated in SQL
router.get('/sales-analytics', readLimiter, (req, res, next) =>
  ctrl.salesAnalytics(req, res, next),
);

// GET /api/operator/fleet-summary — aggregated per-store health + alert trend
router.get('/fleet-summary', readLimiter, (req, res, next) =>
  ctrl.fleetSummary(req, res, next),
);

// ---------------------------------------------------------------------------
// Restock sessions. Registered before /stores/:storeId so the more specific
// path wins, same as the planogram and dismiss routes above.
// ---------------------------------------------------------------------------

// POST /api/operator/stores/:storeId/restock-sessions — open a session
router.post(
  '/stores/:storeId/restock-sessions',
  writeLimiter,
  requireService,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.openRestockSession(req, res, next),
);

// GET /api/operator/stores/:storeId/restock-sessions — session history
router.get(
  '/stores/:storeId/restock-sessions',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listRestockSessions(req, res, next),
);

// GET /api/operator/restock-sessions/:sessionId — a session and its lines
router.get(
  '/restock-sessions/:sessionId',
  readLimiter,
  validateParams(sessionIdParamSchema),
  (req, res, next) => ctrl.getRestockSession(req, res, next),
);

// PUT /api/operator/restock-sessions/:sessionId/lines/:itemId — record a slot
router.put(
  '/restock-sessions/:sessionId/lines/:itemId',
  writeLimiter,
  requireService,
  validateParams(sessionLineParamSchema),
  validateBody(restockLineSchema),
  (req, res, next) => ctrl.putRestockLine(req, res, next),
);

// POST /api/operator/restock-sessions/:sessionId/complete — apply the session
router.post(
  '/restock-sessions/:sessionId/complete',
  writeLimiter,
  requireService,
  validateParams(sessionIdParamSchema),
  validateBody(completeSessionSchema),
  (req, res, next) => ctrl.completeRestockSession(req, res, next),
);

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

// GET /api/operator/stores/:storeId/promotions — every promotion, with status
router.get(
  '/stores/:storeId/promotions',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listPromotions(req, res, next),
);

// POST /api/operator/stores/:storeId/promotions — schedule one
router.post(
  '/stores/:storeId/promotions',
  writeLimiter,
  requireService,
  validateParams(storeIdParamSchema),
  validateBody(promotionBodySchema),
  (req, res, next) => ctrl.createPromotion(req, res, next),
);

// PATCH /api/operator/promotions/:promotionId/end — end one now
router.patch(
  '/promotions/:promotionId/end',
  writeLimiter,
  requireService,
  validateParams(promotionIdParamSchema),
  (req, res, next) => ctrl.endPromotion(req, res, next),
);

// GET /api/operator/promotions/:promotionId/performance — window vs baseline
router.get(
  '/promotions/:promotionId/performance',
  readLimiter,
  validateParams(promotionIdParamSchema),
  (req, res, next) => ctrl.promotionPerformance(req, res, next),
);

// GET /api/operator/stores/:storeId/planogram — the shelf layout
router.get(
  '/stores/:storeId/planogram',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.getPlanogram(req, res, next),
);

// PATCH /api/operator/stores/:storeId/planogram — rearrange or re-sync a slot
router.patch(
  '/stores/:storeId/planogram',
  writeLimiter,
  requireService,
  validateParams(storeIdParamSchema),
  validateBody(planogramUpdateSchema),
  (req, res, next) => ctrl.updatePlanogram(req, res, next),
);

// PATCH /api/operator/alerts/:alertId/dismiss — acknowledge an alert
router.patch(
  '/alerts/:alertId/dismiss',
  writeLimiter,
  requireService,
  validateParams(alertIdParamSchema),
  (req, res, next) => ctrl.dismissAlert(req, res, next),
);

// GET /api/operator/stores/:storeId — one store
router.get(
  '/stores/:storeId',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.getStore(req, res, next),
);

// GET /api/operator/stores/:storeId/inventory
router.get(
  '/stores/:storeId/inventory',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listInventory(req, res, next),
);

// POST /api/operator/stores/:storeId/restock
router.post(
  '/stores/:storeId/restock',
  writeLimiter,
  requireService,
  validateParams(storeIdParamSchema),
  validateBody(restockBodySchema),
  (req, res, next) => ctrl.restock(req, res, next),
);

// GET /api/operator/stores/:storeId/alerts
router.get(
  '/stores/:storeId/alerts',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listAlerts(req, res, next),
);

// GET /api/operator/stores/:storeId/activity
router.get(
  '/stores/:storeId/activity',
  readLimiter,
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listActivity(req, res, next),
);

export default router;
