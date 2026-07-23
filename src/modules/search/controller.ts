// ---------------------------------------------------------------------------
// Search module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

const MAX_QUERY = 100;

function first(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val ?? '');
}

export class SearchController {
  /** GET /api/search?q=... — search public accounts and posts */
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = first(req.query.q as string | string[] | undefined).slice(
        0,
        MAX_QUERY,
      );
      const results = await service.search(q);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }
}
