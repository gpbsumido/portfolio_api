import type { Request, Response, NextFunction } from 'express';
import { F1Service, MEMORY_ERROR_MESSAGES, requestQueue } from './service.js';
import { AppError } from '../../shared/errors/AppError.js';

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const service = new F1Service();

async function handleQueuedRoute(
  res: Response,
  next: NextFunction,
  scriptName: string,
  args: string[],
): Promise<void> {
  try {
    const data = await service.runQueued(scriptName, args);
    res.json(data);
  } catch (error: any) {
    if (error.message === MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT) {
      return next(new AppError('Request timeout', 503));
    }
    next(error);
  }
}

export class F1Controller {
  queueHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
    res.set({
      'X-Queue-Position': String(requestQueue.pendingCount),
      'X-Active-Requests': String(requestQueue.activeCount),
    });
    next();
  }

  getSchedule(req: Request, res: Response, next: NextFunction): void {
    handleQueuedRoute(res, next, 'get_schedule.py', [param(req.params.year)]);
  }

  getResults(req: Request, res: Response, next: NextFunction): void {
    const { year, round, session } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [
      param(year), param(round), param(session), 'results',
    ]);
  }

  getTelemetry(req: Request, res: Response, next: NextFunction): void {
    const { year, round, session, driver, lap } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [
      param(year), param(round), param(session), 'telemetry', param(driver), param(lap),
    ]);
  }

  getFastestLaps(req: Request, res: Response, next: NextFunction): void {
    const { year, round, session } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [
      param(year), param(round), param(session), 'fastest_laps',
    ]);
  }

  getBestLap(req: Request, res: Response, next: NextFunction): void {
    const { year, round, session, driver } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [
      param(year), param(round), param(session), 'driver_best_lap', param(driver),
    ]);
  }

  getWeather(req: Request, res: Response, next: NextFunction): void {
    const { year, round, session } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [
      param(year), param(round), param(session), 'weather',
    ]);
  }

  getDriverPoints(req: Request, res: Response, next: NextFunction): void {
    const { year, round } = req.params;
    const args = round
      ? [param(year), param(round), 'driver']
      : [param(year), 'driver'];
    handleQueuedRoute(res, next, 'get_championship_points.py', args);
  }

  getConstructorPoints(req: Request, res: Response, next: NextFunction): void {
    const { year, round } = req.params;
    const args = round
      ? [param(year), param(round), 'constructor']
      : [param(year), 'constructor'];
    handleQueuedRoute(res, next, 'get_championship_points.py', args);
  }

  getDriverPointsPerRace(req: Request, res: Response, next: NextFunction): void {
    const { year, round } = req.params;
    const args = round
      ? [param(year), param(round)]
      : [param(year), 'driver', 'per_race'];
    handleQueuedRoute(res, next, 'get_championship_points.py', args);
  }

  getConstructorPointsPerRace(req: Request, res: Response, next: NextFunction): void {
    const { year, round } = req.params;
    const args = round
      ? [param(year), param(round), 'constructor']
      : [param(year), 'constructor', 'per_race'];
    handleQueuedRoute(res, next, 'get_championship_points.py', args);
  }

  async clearCache(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await service.clearCache();
      res.json({ message: 'Cache cleared successfully' });
    } catch (error: any) {
      next(error);
    }
  }

  getQueueStatus(_req: Request, res: Response): void {
    res.json(service.getQueueStatus());
  }
}
