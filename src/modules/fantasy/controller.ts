import type { Request, Response, NextFunction } from 'express';
import { FantasyService, MEMORY_ERROR_MESSAGES } from './service.js';

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
        res.status(503).json({
          error: 'Request timeout',
          details: 'The request took too long due to high server load.',
          suggestion: 'Please try again later',
        });
        return;
      }
      // If the error came from results.error in the python script
      if (!error.statusCode) {
        res.status(500).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
}
