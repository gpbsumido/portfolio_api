// ---------------------------------------------------------------------------
// Operator module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { OperatorController } from './controller.js';
import {
  alertIdParamSchema,
  planogramUpdateSchema,
  restockBodySchema,
  storeIdParamSchema,
} from './schemas.js';

const router = Router();
const ctrl = new OperatorController();

// GET /api/operator/stores — the fleet list
router.get('/stores', (req, res, next) => ctrl.listStores(req, res, next));

// GET /api/operator/sales-analytics — fleet-wide sales rollup, aggregated in SQL
router.get('/sales-analytics', (req, res, next) =>
  ctrl.salesAnalytics(req, res, next),
);

// GET /api/operator/fleet-summary — aggregated per-store health + alert trend
router.get('/fleet-summary', (req, res, next) =>
  ctrl.fleetSummary(req, res, next),
);

// GET /api/operator/stores/:storeId/planogram — the shelf layout
router.get(
  '/stores/:storeId/planogram',
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.getPlanogram(req, res, next),
);

// PATCH /api/operator/stores/:storeId/planogram — rearrange or re-sync a slot
router.patch(
  '/stores/:storeId/planogram',
  validateParams(storeIdParamSchema),
  validateBody(planogramUpdateSchema),
  (req, res, next) => ctrl.updatePlanogram(req, res, next),
);

// PATCH /api/operator/alerts/:alertId/dismiss — acknowledge an alert
router.patch(
  '/alerts/:alertId/dismiss',
  validateParams(alertIdParamSchema),
  (req, res, next) => ctrl.dismissAlert(req, res, next),
);

// GET /api/operator/stores/:storeId — one store
router.get(
  '/stores/:storeId',
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.getStore(req, res, next),
);

// GET /api/operator/stores/:storeId/inventory
router.get(
  '/stores/:storeId/inventory',
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listInventory(req, res, next),
);

// POST /api/operator/stores/:storeId/restock
router.post(
  '/stores/:storeId/restock',
  validateParams(storeIdParamSchema),
  validateBody(restockBodySchema),
  (req, res, next) => ctrl.restock(req, res, next),
);

// GET /api/operator/stores/:storeId/alerts
router.get(
  '/stores/:storeId/alerts',
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listAlerts(req, res, next),
);

// GET /api/operator/stores/:storeId/activity
router.get(
  '/stores/:storeId/activity',
  validateParams(storeIdParamSchema),
  (req, res, next) => ctrl.listActivity(req, res, next),
);

export default router;
