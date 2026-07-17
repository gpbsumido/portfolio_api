import { Router } from 'express';
import { YouTubeController } from './controller.js';

const router = Router();
const ctrl = new YouTubeController();

router.get('/recent', (req, res, next) => ctrl.getRecent(req, res, next));

export default router;
