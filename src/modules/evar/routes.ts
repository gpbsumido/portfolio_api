import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { requireAdmin } from '../../shared/auth/adminEmail.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { EvarController } from './controller.js';
import { attemptSchema, caseParamsSchema, participantSchema, referenceSchema } from './schemas.js';

const router = Router();
const ctrl = new EvarController();

// GET /api/evar/references — admin-set answers. Declared before checkJwt
// because the practice page scores signed-out visitors against them too.
router.get('/references', (req, res, next) => ctrl.listReferences(req, res, next));

// Everything else is signed in: the study is opt-in per person.
router.use(checkJwt);

// GET/PUT/DELETE /api/evar/participant — your own consent and profile
router.get('/participant', (req, res, next) => ctrl.getParticipant(req, res, next));
router.put('/participant', validateBody(participantSchema), (req, res, next) =>
  ctrl.putParticipant(req, res, next),
);
router.delete('/participant', (req, res, next) => ctrl.deleteParticipant(req, res, next));

// POST/GET /api/evar/attempts — record one, or list your own
router.post('/attempts', validateBody(attemptSchema), (req, res, next) => ctrl.recordAttempt(req, res, next));
router.get('/attempts', (req, res, next) => ctrl.listAttempts(req, res, next));

// GET /api/evar/admin/export — the pseudonymous dataset for the study
router.get('/admin/export', requireAdmin, (req, res, next) => ctrl.exportAll(req, res, next));

// PUT/DELETE /api/evar/admin/references/:caseId — set or clear a case's answers
router.put(
  '/admin/references/:caseId',
  requireAdmin,
  validateParams(caseParamsSchema),
  validateBody(referenceSchema),
  (req, res, next) => ctrl.putReference(req, res, next),
);
router.delete('/admin/references/:caseId', requireAdmin, validateParams(caseParamsSchema), (req, res, next) =>
  ctrl.deleteReference(req, res, next),
);

export default router;
