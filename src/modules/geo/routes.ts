import { Router } from 'express';
import { GeoController } from './controller.js';

const router = Router();
const ctrl = new GeoController();

router.get('/', (req, res, next) => ctrl.lookup(req, res, next));

export default router;
