import { Router } from 'express';
import multer from 'multer';
import { GalleryController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new GalleryController();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', checkJwt, upload.single('file'), (req, res, next) =>
  ctrl.create(req, res, next),
);
router.get('/', (req, res, next) => ctrl.list(req, res, next));
router.delete('/:id', checkJwt, (req, res, next) => ctrl.remove(req, res, next));

export default router;
