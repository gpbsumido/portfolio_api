import { Router } from 'express';
import { FantasyController } from './controller.js';

const router = Router();
const ctrl = new FantasyController();

router.get('/points/:year/:round', (req, res, next) => ctrl.getPoints(req, res, next));

export default router;
