// ---------------------------------------------------------------------------
// Replies module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { RepliesController } from './controller.js';
import { checkJwt, optionalCheckJwt } from '../../config/auth.js';
import { upsertUser } from '../../middleware/upsertUser.js';
import { validateBody } from '../../middleware/validate.js';
import { createReplySchema } from './schemas.js';

const router = Router();
const ctrl = new RepliesController();

// GET /api/replies?ids=a,b,c — batch reply counts (define before /:postId)
router.get('/', optionalCheckJwt, (req, res, next) => ctrl.batch(req, res, next));

// GET /api/replies/:postId — a post's thread
router.get('/:postId', optionalCheckJwt, (req, res, next) =>
  ctrl.list(req, res, next),
);

// POST /api/replies/:postId — add a reply
router.post('/:postId', checkJwt, upsertUser, validateBody(createReplySchema), (req, res, next) =>
  ctrl.create(req, res, next),
);

export default router;
