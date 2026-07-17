import { Router } from 'express';
import { F1Controller } from './controller.js';
import { checkJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new F1Controller();

// Queue status headers on all routes
router.use((req, res, next) => ctrl.queueHeadersMiddleware(req, res, next));

// Race schedule
router.get('/schedule/:year', (req, res, next) => ctrl.getSchedule(req, res, next));

// Session results
router.get('/results/:year/:round/:session', (req, res, next) => ctrl.getResults(req, res, next));

// Driver telemetry
router.get('/telemetry/:year/:round/:session/:driver/:lap', (req, res, next) =>
  ctrl.getTelemetry(req, res, next),
);

// Fastest laps
router.get('/fastest-laps/:year/:round/:session', (req, res, next) =>
  ctrl.getFastestLaps(req, res, next),
);

// Driver best lap
router.get('/best-lap/:year/:round/:session/:driver', (req, res, next) =>
  ctrl.getBestLap(req, res, next),
);

// Weather
router.get('/weather/:year/:round/:session', (req, res, next) =>
  ctrl.getWeather(req, res, next),
);

// Championship standings
router.get('/driver-points/:year', (req, res, next) => ctrl.getDriverPoints(req, res, next));
router.get('/constructor-points/:year', (req, res, next) =>
  ctrl.getConstructorPoints(req, res, next),
);
router.get('/driver-points/:year/:round', (req, res, next) =>
  ctrl.getDriverPoints(req, res, next),
);
router.get('/constructor-points/:year/:round', (req, res, next) =>
  ctrl.getConstructorPoints(req, res, next),
);

// Points per race
router.get('/driver-points-per-race/:year', (req, res, next) =>
  ctrl.getDriverPointsPerRace(req, res, next),
);
router.get('/constructor-points-per-race/:year', (req, res, next) =>
  ctrl.getConstructorPointsPerRace(req, res, next),
);
router.get('/driver-points-per-race/:year/:round', (req, res, next) =>
  ctrl.getDriverPointsPerRace(req, res, next),
);
router.get('/constructor-points-per-race/:year/:round', (req, res, next) =>
  ctrl.getConstructorPointsPerRace(req, res, next),
);

// Cache management (auth required)
router.delete('/cache', checkJwt, (req, res, next) => ctrl.clearCache(req, res, next));

// Queue status
router.get('/queue-status', (req, res) => ctrl.getQueueStatus(req, res));

export default router;
