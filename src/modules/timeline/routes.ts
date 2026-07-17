// ---------------------------------------------------------------------------
// Timeline module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { TimelineController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new TimelineController();

// GET /api/timeline
router.get('/', checkJwt, (req, res, next) =>
  ctrl.getTimeline(req, res, next),
);

export default router;
