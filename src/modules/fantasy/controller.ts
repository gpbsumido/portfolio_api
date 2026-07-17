import type { Request, Response, NextFunction } from 'express';
import { FantasyService, MEMORY_ERROR_MESSAGES } from './service.js';
import { AppError } from '../../shared/errors/AppError.js';

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const service = new FantasyService();

export class FantasyController {
  async getPoints(req: Request, res: Response, next: NextFunction): Promise<void> {
    const year = param(req.params.year);
    const round = param(req.params.round);

    try {
      const result = await service.getFantasyPoints(year, round);
      res.json(result);
    } catch (error: any) {
      if (error.message === MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT) {
        return next(new AppError('Request timeout', 503));
      }
      next(error);
    }
  }
}
