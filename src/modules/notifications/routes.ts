// ---------------------------------------------------------------------------
// Notifications module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { NotificationsController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { upsertUser } from '../../middleware/upsertUser.js';

const router = Router();
const ctrl = new NotificationsController();

// GET /api/notifications — activity feed + unread count
router.get('/', checkJwt, upsertUser, (req, res, next) =>
  ctrl.list(req, res, next),
);

// PUT /api/notifications/seen — mark all as read
router.put('/seen', checkJwt, upsertUser, (req, res, next) =>
  ctrl.markSeen(req, res, next),
);

export default router;
