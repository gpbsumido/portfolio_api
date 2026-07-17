import { Router } from 'express';
import { ForumController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createForumPostSchema, createMarkerSchema } from './schemas.js';

const router = Router();
const ctrl = new ForumController();

// Tables
router.get('/tables', checkJwt, (req, res, next) => ctrl.getTables(req, res, next));
router.get('/table/:tableName', checkJwt, (req, res, next) =>
  ctrl.getTableSchema(req, res, next),
);

// Forum posts
router.get('/postforum', (req, res, next) => ctrl.getForumPosts(req, res, next));
router.post('/postforum', checkJwt, validateBody(createForumPostSchema), (req, res, next) => ctrl.createForumPost(req, res, next));

// Markers
router.post('/markers', validateBody(createMarkerSchema), (req, res, next) => ctrl.createMarker(req, res, next));
router.get('/markers', (req, res, next) => ctrl.getMarkers(req, res, next));
router.delete('/markers/:id', checkJwt, (req, res, next) => ctrl.deleteMarker(req, res, next));

export default router;
