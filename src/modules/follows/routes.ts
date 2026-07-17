// ---------------------------------------------------------------------------
// Follows module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { FollowsController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new FollowsController();

// All follows routes require auth
router.use(checkJwt);

// GET routes must come before parameterized routes
router.get('/requests', (req, res, next) => ctrl.getRequests(req, res, next));
router.get('/following', (req, res, next) => ctrl.getFollowing(req, res, next));
router.get('/followers', (req, res, next) => ctrl.getFollowers(req, res, next));

// POST /api/follows/:username — send follow request
router.post('/:username', (req, res, next) => ctrl.follow(req, res, next));

// PUT /api/follows/:id/accept
router.put('/:id/accept', (req, res, next) => ctrl.accept(req, res, next));

// PUT /api/follows/:id/reject
router.put('/:id/reject', (req, res, next) => ctrl.reject(req, res, next));

// DELETE /api/follows/:username — unfollow
router.delete('/:username', (req, res, next) => ctrl.unfollow(req, res, next));

export default router;
