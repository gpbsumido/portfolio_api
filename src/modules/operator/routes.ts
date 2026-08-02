// ---------------------------------------------------------------------------
// Operator module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { createIpLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { OperatorController } from './controller.js';
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
 * These routes are unauthenticated, which is deliberate for now: the operator
 * dashboard is a public demo and its whole point is that the writes are real.
 * Putting checkJwt on the writes would 401 every restock from the demo, and the
 * frontend would quietly fall back to its in-memory seed -- which is exactly the
 * fiction this feature set removed. Auth belongs here the moment there is a real
 * tenant to protect; until then rate limiting is what actually bounds the abuse,
 * and the nightly reseed job puts the demo data back regardless.
 *
 * Same numbers as the feature-flags module, which is the precedent in this repo.
 */
const readLimiter = createIpLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createIpLimiter({ windowMs: 60_000, max: 30 });

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
  validateParams(sessionLineParamSchema),
  validateBody(restockLineSchema),
  (req, res, next) => ctrl.putRestockLine(req, res, next),
);

// POST /api/operator/restock-sessions/:sessionId/complete — apply the session
router.post(
  '/restock-sessions/:sessionId/complete',
  writeLimiter,
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
  validateParams(storeIdParamSchema),
  validateBody(promotionBodySchema),
  (req, res, next) => ctrl.createPromotion(req, res, next),
);

// PATCH /api/operator/promotions/:promotionId/end — end one now
router.patch(
  '/promotions/:promotionId/end',
  writeLimiter,
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
  validateParams(storeIdParamSchema),
  validateBody(planogramUpdateSchema),
  (req, res, next) => ctrl.updatePlanogram(req, res, next),
);

// PATCH /api/operator/alerts/:alertId/dismiss — acknowledge an alert
router.patch(
  '/alerts/:alertId/dismiss',
  writeLimiter,
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
