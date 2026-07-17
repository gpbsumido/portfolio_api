import { Router } from 'express';
import { MedJournalController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { saveEntrySchema } from './schemas.js';

const router = Router();
const ctrl = new MedJournalController();

// All routes require authentication
router.use(checkJwt);

router.post('/save-entry', validateBody(saveEntrySchema), (req, res, next) => ctrl.saveEntry(req, res, next));
router.delete('/delete-entry/:id', (req, res, next) => ctrl.deleteEntry(req, res, next));
router.get('/edit-entry/:id', (req, res, next) => ctrl.getEntry(req, res, next));
router.get('/entries', (req, res, next) => ctrl.listEntries(req, res, next));
router.get('/', (req, res, next) => ctrl.index(req, res, next));

export default router;
