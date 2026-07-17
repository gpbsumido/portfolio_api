import { Router } from 'express';
import { ChatController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { chatSchema, summarizeSchema } from './schemas.js';

const router = Router();
const ctrl = new ChatController();

// All routes require authentication
router.use(checkJwt);

router.post('/', validateBody(chatSchema), (req, res, next) => ctrl.chat(req, res, next));
router.post('/summarize', validateBody(summarizeSchema), (req, res, next) => ctrl.summarize(req, res, next));

export default router;
