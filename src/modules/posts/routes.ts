// ---------------------------------------------------------------------------
// Posts module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { PostsController } from './controller.js';
import { checkJwt, optionalCheckJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createPostSchema } from './schemas.js';

const router = Router();
const ctrl = new PostsController();

// POST /api/posts — create a post (checkJwt + upsertUser applied at app level)
router.post('/', checkJwt, validateBody(createPostSchema), (req, res, next) =>
  ctrl.createPost(req, res, next),
);

// GET /api/posts/user/:username — posts by user
router.get('/user/:username', optionalCheckJwt, (req, res, next) =>
  ctrl.getPostsByUser(req, res, next),
);

// GET /api/posts/discover — public discover feed
router.get('/discover', optionalCheckJwt, (req, res, next) =>
  ctrl.discover(req, res, next),
);

// GET /api/posts/:id — single post
router.get('/:id', (req, res, next) => ctrl.getById(req, res, next));

// DELETE /api/posts/:id — delete own post
router.delete('/:id', checkJwt, (req, res, next) =>
  ctrl.deleteById(req, res, next),
);

export default router;
