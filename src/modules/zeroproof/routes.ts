// ---------------------------------------------------------------------------
// ZeroProof — Express router (all endpoints require a signed-in user)
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { ZeroproofController } from './controller.js';
import { openWalletSchema } from './schemas.js';

const router = Router();
const ctrl = new ZeroproofController();

// GET /api/zeroproof/wallets — the caller's wallets and balances
router.get('/wallets', checkJwt, (req, res, next) => ctrl.listWallets(req, res, next));

// POST /api/zeroproof/wallets — open a Season or Challenge wallet
router.post('/wallets', checkJwt, validateBody(openWalletSchema), (req, res, next) =>
  ctrl.openWallet(req, res, next),
);

export default router;
