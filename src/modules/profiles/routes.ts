// ---------------------------------------------------------------------------
// Profiles module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { ProfilesController } from './controller.js';
import { checkJwt, optionalCheckJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { setupProfileSchema, updateProfileSchema } from './schemas.js';

const router = Router();
const ctrl = new ProfilesController();

// POST /api/profiles/me/avatar
router.post('/me/avatar', checkJwt, (req, res, next) =>
  ctrl.uploadAvatar(req, res, next),
);

// GET /api/profiles/me
router.get('/me', checkJwt, (req, res, next) =>
  ctrl.getMe(req, res, next),
);

// PUT /api/profiles/me
router.put('/me', checkJwt, validateBody(updateProfileSchema), (req, res, next) =>
  ctrl.updateMe(req, res, next),
);

// POST /api/profiles/setup
router.post('/setup', checkJwt, validateBody(setupProfileSchema), (req, res, next) =>
  ctrl.setup(req, res, next),
);

// GET /api/profiles/discover
router.get('/discover', optionalCheckJwt, (req, res, next) =>
  ctrl.discover(req, res, next),
);

// GET /api/profiles/:username
router.get('/:username', optionalCheckJwt, (req, res, next) =>
  ctrl.getByUsername(req, res, next),
);

export default router;
