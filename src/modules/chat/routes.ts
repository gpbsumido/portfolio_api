import { Router } from 'express';
import { ChatController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new ChatController();

// All routes require authentication
router.use(checkJwt);

router.post('/', (req, res, next) => ctrl.chat(req, res, next));
router.post('/summarize', (req, res, next) => ctrl.summarize(req, res, next));

export default router;
