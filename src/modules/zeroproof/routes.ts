// ---------------------------------------------------------------------------
// ZeroProof — Express router (all endpoints require a signed-in user)
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { checkJwt, optionalCheckJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAdmin } from '../../shared/auth/adminEmail.js';
import { ZeroproofController } from './controller.js';
import {
  addEspnLeagueSchema,
  addLeagueEspnLeagueSchema,
  createLeagueSchema,
  joinLeagueSchema,
  openWalletSchema,
  placeBetSchema,
} from './schemas.js';

const router = Router();
const ctrl = new ZeroproofController();

// GET /api/zeroproof/events — upcoming events with latest lines (public: the
// slate renders for signed-out visitors, and it's served from the DB only).
router.get('/events', (req, res, next) => ctrl.listEvents(req, res, next));

// GET /api/zeroproof/leaderboard — ranked profiles (public)
router.get('/leaderboard', (req, res, next) => ctrl.leaderboard(req, res, next));

// GET /api/zeroproof/me — the caller's profile stats
router.get('/me', checkJwt, (req, res, next) => ctrl.me(req, res, next));

// GET /api/zeroproof/refer — attributed outbound link to a partner book
router.get('/refer', optionalCheckJwt, (req, res, next) => ctrl.refer(req, res, next));

// GET /api/zeroproof/house — company float, yield, referral clicks (admin only)
router.get('/house', checkJwt, requireAdmin, (req, res, next) => ctrl.house(req, res, next));

// GET /api/zeroproof/wallets — the caller's wallets and balances
router.get('/wallets', checkJwt, (req, res, next) => ctrl.listWallets(req, res, next));

// GET /api/zeroproof/bets — the caller's bet history, newest first
router.get('/bets', checkJwt, (req, res, next) => ctrl.myBets(req, res, next));

// POST /api/zeroproof/wallets — open a Season or Challenge wallet
router.post('/wallets', checkJwt, validateBody(openWalletSchema), (req, res, next) =>
  ctrl.openWallet(req, res, next),
);

// POST /api/zeroproof/bets — place a bet
router.post('/bets', checkJwt, validateBody(placeBetSchema), (req, res, next) =>
  ctrl.placeBet(req, res, next),
);

// GET /api/zeroproof/leagues — discover public leagues, or resolve one by ?code=
// (public: the discovery list renders for signed-out visitors too)
router.get('/leagues', optionalCheckJwt, (req, res, next) => ctrl.listLeagues(req, res, next));

// GET /api/zeroproof/leagues/mine — the caller's leagues (before :id so it isn't
// captured as a league id)
router.get('/leagues/mine', checkJwt, (req, res, next) => ctrl.myLeagues(req, res, next));

// GET /api/zeroproof/leagues/:id — a league's rules, board, and the caller's place
router.get('/leagues/:id', optionalCheckJwt, (req, res, next) => ctrl.leagueDetail(req, res, next));

// POST /api/zeroproof/leagues — create a league
router.post('/leagues', checkJwt, validateBody(createLeagueSchema), (req, res, next) =>
  ctrl.createLeague(req, res, next),
);

// POST /api/zeroproof/leagues/:id/join — join a league
router.post('/leagues/:id/join', checkJwt, validateBody(joinLeagueSchema), (req, res, next) =>
  ctrl.joinLeague(req, res, next),
);

// The ESPN leagues a commissioner adds to their league for members to bet
// (additive — the league still bets everything else). Commissioner-gated in the
// service by comparing the caller to the league's commissioner.
router.post(
  '/leagues/:id/espn-leagues',
  checkJwt,
  validateBody(addLeagueEspnLeagueSchema),
  (req, res, next) => ctrl.addLeagueEspnLeague(req, res, next),
);
router.delete('/leagues/:id/espn-leagues/:espnId', checkJwt, (req, res, next) =>
  ctrl.removeLeagueEspnLeague(req, res, next),
);

// The ESPN-league registry — which ESPN fantasy leagues the crons ingest. Admin
// only, so a league can be added/removed without an env edit and redeploy.
router.get('/espn-leagues', checkJwt, requireAdmin, (req, res, next) =>
  ctrl.listEspnLeagues(req, res, next),
);
router.post('/espn-leagues', checkJwt, requireAdmin, validateBody(addEspnLeagueSchema), (req, res, next) =>
  ctrl.addEspnLeague(req, res, next),
);
router.delete('/espn-leagues/:id', checkJwt, requireAdmin, (req, res, next) =>
  ctrl.removeEspnLeague(req, res, next),
);

export default router;
