import { Router } from 'express';
import multer from 'multer';
import { WallsController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createWallSchema, updateWallSchema } from './schemas.js';

const router = Router();
const ctrl = new WallsController();
// Photos arrive as multipart files keyed by their image id, so accept any field.
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', checkJwt, (req, res, next) => ctrl.list(req, res, next));
router.post('/', checkJwt, upload.any(), validateBody(createWallSchema), (req, res, next) =>
  ctrl.create(req, res, next),
);
router.get('/:id', checkJwt, (req, res, next) => ctrl.get(req, res, next));
router.put('/:id', checkJwt, upload.any(), validateBody(updateWallSchema), (req, res, next) =>
  ctrl.update(req, res, next),
);
router.delete('/:id', checkJwt, (req, res, next) => ctrl.remove(req, res, next));

export default router;
