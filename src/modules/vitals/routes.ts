import { Router } from 'express';
import { VitalsController } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new VitalsController();

// Open ingestion — no auth
router.post('/', (req, res, next) => ctrl.ingest(req, res, next));

// Auth required for read endpoints
router.get('/summary', checkJwt, (req, res, next) => ctrl.getSummary(req, res, next));
router.get('/by-page', checkJwt, (req, res, next) => ctrl.getByPage(req, res, next));
router.get('/by-version', checkJwt, (req, res, next) => ctrl.getByVersion(req, res, next));
router.get('/versions', checkJwt, (req, res, next) => ctrl.getVersions(req, res, next));

export default router;
