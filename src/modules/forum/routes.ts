import { Router } from 'express';
import { ForumController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createForumPostSchema, createMarkerSchema } from './schemas.js';

const router = Router();
const ctrl = new ForumController();

// The /tables and /table/:tableName introspection endpoints used to live here.
// They read information_schema and handed every table and column name to any
// caller with an account -- a debugging convenience that shipped. Nothing in
// either repo consumed them, so they are gone rather than gated.

// Forum posts
router.get('/postforum', (req, res, next) => ctrl.getForumPosts(req, res, next));
router.post('/postforum', checkJwt, validateBody(createForumPostSchema), (req, res, next) => ctrl.createForumPost(req, res, next));

// Markers
router.post('/markers', validateBody(createMarkerSchema), (req, res, next) => ctrl.createMarker(req, res, next));
router.get('/markers', (req, res, next) => ctrl.getMarkers(req, res, next));
// DELETE /markers/:id is deliberately absent. The locations table has no owner
// column and POST /markers is unauthenticated, so checkJwt here was
// authentication with no authorization behind it -- any signed-up user could
// remove any pin. Nothing consumed the route. Moderation can come back as an
// explicit admin permission, or with an owner column, rather than as a gap.

export default router;
