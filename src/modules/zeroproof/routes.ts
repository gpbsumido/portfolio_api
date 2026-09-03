// ---------------------------------------------------------------------------
// ZeroProof — Express router (all endpoints require a signed-in user)
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { ZeroproofController } from './controller.js';
import { openWalletSchema, placeBetSchema } from './schemas.js';

const router = Router();
const ctrl = new ZeroproofController();

// GET /api/zeroproof/events — upcoming events with latest lines (public: the
// slate renders for signed-out visitors, and it's served from the DB only).
router.get('/events', (req, res, next) => ctrl.listEvents(req, res, next));

// GET /api/zeroproof/wallets — the caller's wallets and balances
router.get('/wallets', checkJwt, (req, res, next) => ctrl.listWallets(req, res, next));

// POST /api/zeroproof/wallets — open a Season or Challenge wallet
router.post('/wallets', checkJwt, validateBody(openWalletSchema), (req, res, next) =>
  ctrl.openWallet(req, res, next),
);

// POST /api/zeroproof/bets — place a bet
router.post('/bets', checkJwt, validateBody(placeBetSchema), (req, res, next) =>
  ctrl.placeBet(req, res, next),
);

export default router;
