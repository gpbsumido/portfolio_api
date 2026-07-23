// ---------------------------------------------------------------------------
// Reposts module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { RepostsController } from './controller.js';
import { checkJwt, optionalCheckJwt } from '../../config/auth.js';
import { upsertUser } from '../../middleware/upsertUser.js';

const router = Router();
const ctrl = new RepostsController();

// GET /api/reposts?ids=a,b,c — batch counts + reposted-by-me
router.get('/', optionalCheckJwt, (req, res, next) => ctrl.batch(req, res, next));

// POST /api/reposts/:postId — repost
router.post('/:postId', checkJwt, upsertUser, (req, res, next) =>
  ctrl.repost(req, res, next),
);

// DELETE /api/reposts/:postId — undo a repost
router.delete('/:postId', checkJwt, (req, res, next) =>
  ctrl.unrepost(req, res, next),
);

export default router;
