import { Router } from 'express';
import { VitalsController } from './controller.js';
import { validateBody } from '../../middleware/validate.js';
import { ingestVitalSchema } from './schemas.js';

const router = Router();
const ctrl = new VitalsController();

// Open ingestion — no auth
router.post('/', validateBody(ingestVitalSchema), (req, res, next) => ctrl.ingest(req, res, next));

// Public reads — site-wide, non-personal aggregate metrics, nothing to gate.
// The paul-explore Web Vitals dashboard is public, so these must answer
// unauthenticated requests too.
router.get('/summary', (req, res, next) => ctrl.getSummary(req, res, next));
router.get('/by-page', (req, res, next) => ctrl.getByPage(req, res, next));
router.get('/by-version', (req, res, next) => ctrl.getByVersion(req, res, next));
router.get('/versions', (req, res, next) => ctrl.getVersions(req, res, next));

export default router;
