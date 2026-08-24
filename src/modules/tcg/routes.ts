// ---------------------------------------------------------------------------
// Fantasy TCG economy — Express router (all endpoints require a signed-in user)
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { TcgController } from './controller.js';
import { openPackSchema } from './schemas.js';

const router = Router();
const ctrl = new TcgController();

// GET /api/tcg/wallet — coin balance
router.get('/wallet', checkJwt, (req, res, next) => ctrl.wallet(req, res, next));

// POST /api/tcg/wallet/claim — daily coin grant
router.post('/wallet/claim', checkJwt, (req, res, next) => ctrl.claim(req, res, next));

// POST /api/tcg/packs/open — spend coins to open a drawn pack
router.post('/packs/open', checkJwt, validateBody(openPackSchema), (req, res, next) =>
  ctrl.open(req, res, next),
);

// GET /api/tcg/collection — the caller's pulled cards
router.get('/collection', checkJwt, (req, res, next) => ctrl.collection(req, res, next));

export default router;
