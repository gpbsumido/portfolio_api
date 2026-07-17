import { Router } from 'express';
import { FeedbackController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createFeedbackSchema, updateFeedbackSchema } from './schemas.js';

const router = Router();
const ctrl = new FeedbackController();

// All routes require authentication
router.use(checkJwt);

router.get('/', (req, res, next) => ctrl.list(req, res, next));
router.post('/', validateBody(createFeedbackSchema), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id', validateBody(updateFeedbackSchema), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', (req, res, next) => ctrl.remove(req, res, next));

export default router;
