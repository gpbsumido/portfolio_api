import { Router } from 'express';
import { FeedbackController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new FeedbackController();

// All routes require authentication
router.use(checkJwt);

router.get('/', (req, res, next) => ctrl.list(req, res, next));
router.post('/', (req, res, next) => ctrl.create(req, res, next));
router.put('/:id', (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', (req, res, next) => ctrl.remove(req, res, next));

export default router;
