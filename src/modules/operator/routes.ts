// ---------------------------------------------------------------------------
// Operator module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { OperatorController } from './controller.js';

const router = Router();
const ctrl = new OperatorController();

// GET /api/operator/stores — the fleet list
router.get('/stores', (req, res, next) => ctrl.listStores(req, res, next));

// GET /api/operator/sales-analytics — fleet-wide sales rollup, aggregated in SQL
router.get('/sales-analytics', (req, res, next) =>
  ctrl.salesAnalytics(req, res, next),
);

export default router;
