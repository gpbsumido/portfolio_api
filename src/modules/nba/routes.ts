import { Router } from 'express';
import { NbaController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { savePicksSchema, saveResultsSchema } from './schemas.js';

const router = Router();
const ctrl = new NbaController();

// NBA stats (proxied from stats.nba.com)
router.get('/teams', (req, res, next) => ctrl.getTeams(req, res, next));
router.get('/players/:teamId', (req, res, next) => ctrl.getPlayers(req, res, next));
router.get('/stats/:playerId', (req, res, next) => ctrl.getStats(req, res, next));
router.get('/shots/:playerId', (req, res, next) => ctrl.getShots(req, res, next));

// Playoffs — picks
router.get('/playoffs/picks/:season', checkJwt, (req, res, next) =>
  ctrl.getPicks(req, res, next),
);
router.get('/playoffs/picks/:season/public', (req, res, next) =>
  ctrl.getPublicPicks(req, res, next),
);
router.put('/playoffs/picks/:season', checkJwt, validateBody(savePicksSchema), (req, res, next) =>
  ctrl.savePicks(req, res, next),
);

// Playoffs — leaderboard & admin
router.get('/playoffs/leaderboard/:season', (req, res, next) =>
  ctrl.getLeaderboard(req, res, next),
);
router.put('/playoffs/results/:season', validateBody(saveResultsSchema), (req, res, next) =>
  ctrl.saveResults(req, res, next),
);

export default router;
