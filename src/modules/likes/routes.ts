// ---------------------------------------------------------------------------
// Likes module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { LikesController } from './controller.js';
import { checkJwt, optionalCheckJwt } from '../../config/auth.js';
import { upsertUser } from '../../middleware/upsertUser.js';

const router = Router();
const ctrl = new LikesController();

// GET /api/likes?ids=a,b,c — batch counts + liked-by-me (works for guests)
router.get('/', optionalCheckJwt, (req, res, next) => ctrl.batch(req, res, next));

// POST /api/likes/:postId — like a post
router.post('/:postId', checkJwt, upsertUser, (req, res, next) =>
  ctrl.like(req, res, next),
);

// DELETE /api/likes/:postId — remove your like
router.delete('/:postId', checkJwt, (req, res, next) =>
  ctrl.unlike(req, res, next),
);

export default router;
