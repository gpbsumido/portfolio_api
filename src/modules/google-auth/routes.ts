import { Router } from 'express';
import { GoogleAuthController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new GoogleAuthController();

// Auth routes
router.get('/auth/status', checkJwt, (req, res, next) => ctrl.getStatus(req, res, next));
router.get('/auth/url', checkJwt, (req, res, next) => ctrl.getAuthUrl(req, res, next));
router.get('/auth/callback', (req, res, next) => ctrl.handleCallback(req, res, next));
router.delete('/auth/disconnect', checkJwt, (req, res, next) => ctrl.disconnect(req, res, next));

// Webhook
router.post('/webhook', (req, res, next) => ctrl.handleWebhook(req, res, next));

export default router;
