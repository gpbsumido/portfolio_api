import type { Request, Response, NextFunction } from 'express';
import { VitalsRepository, VALID_METRICS, VALID_RATINGS } from './repository.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('vitals');

const repo = new VitalsRepository();

export class VitalsController {
  async ingest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        metric,
        value,
        rating,
        page,
        nav_type,
        app_version = 'unknown',
      } = req.body;

      if (!metric || value === undefined || value === null || !rating || !page) {
        throw new ValidationError('metric, value, rating, and page are required');
      }

      if (!VALID_METRICS.has(metric)) {
        throw new ValidationError(`metric must be one of: ${[...VALID_METRICS].join(', ')}`);
      }

      if (!VALID_RATINGS.has(rating)) {
        throw new ValidationError(`rating must be one of: ${[...VALID_RATINGS].join(', ')}`);
      }

      if (typeof value !== 'number') {
        throw new ValidationError('value must be a number');
      }

      const row = await repo.insert({
        metric,
        value,
        rating,
        page,
        nav_type: nav_type ?? null,
        app_version,
      });
      res.status(201).json(row);
    } catch (err: any) {
      next(err);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { v, mode } = req.query as Record<string, string>;
    try {
      const summary = await repo.getSummary(v, mode);
      res.json({ summary });
    } catch (err: any) {
      next(err);
    }
  }

  async getByPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { v, mode } = req.query as Record<string, string>;
    try {
      const byPage = await repo.getByPage(v, mode);
      res.json({ byPage });
    } catch (err: any) {
      next(err);
    }
  }

  async getByVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { v, mode } = req.query as Record<string, string>;
    try {
      const byVersion = await repo.getByVersion(v, mode);
      res.json({ byVersion });
    } catch (err: any) {
      next(err);
    }
  }

  async getVersions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const versions = await repo.getVersions();
      res.json({ versions });
    } catch (err: any) {
      next(err);
    }
  }
}
