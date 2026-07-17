import type { Request, Response, NextFunction } from 'express';
import { VitalsRepository, VALID_METRICS, VALID_RATINGS } from './repository.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('vitals');

const repo = new VitalsRepository();

export class VitalsController {
  async ingest(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const {
      metric,
      value,
      rating,
      page,
      nav_type,
      app_version = 'unknown',
    } = req.body;

    if (!metric || value === undefined || value === null || !rating || !page) {
      res.status(400).json({ error: 'metric, value, rating, and page are required' });
      return;
    }

    if (!VALID_METRICS.has(metric)) {
      res.status(400).json({
        error: `metric must be one of: ${[...VALID_METRICS].join(', ')}`,
      });
      return;
    }

    if (!VALID_RATINGS.has(rating)) {
      res.status(400).json({
        error: `rating must be one of: ${[...VALID_RATINGS].join(', ')}`,
      });
      return;
    }

    if (typeof value !== 'number') {
      res.status(400).json({ error: 'value must be a number' });
      return;
    }

    try {
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
      log.error({ err }, 'POST /vitals failed');
      res.status(500).json({ error: 'Failed to store vital' });
    }
  }

  async getSummary(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { v, mode } = req.query as Record<string, string>;
    try {
      const summary = await repo.getSummary(v, mode);
      res.json({ summary });
    } catch (err: any) {
      log.error({ err }, 'GET /vitals/summary failed');
      res.status(500).json({ error: 'Failed to fetch vitals summary' });
    }
  }

  async getByPage(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { v, mode } = req.query as Record<string, string>;
    try {
      const byPage = await repo.getByPage(v, mode);
      res.json({ byPage });
    } catch (err: any) {
      log.error({ err }, 'GET /vitals/by-page failed');
      res.status(500).json({ error: 'Failed to fetch vitals by page' });
    }
  }

  async getByVersion(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { v, mode } = req.query as Record<string, string>;
    try {
      const byVersion = await repo.getByVersion(v, mode);
      res.json({ byVersion });
    } catch (err: any) {
      log.error({ err }, 'GET /vitals/by-version failed');
      res.status(500).json({ error: 'Failed to fetch vitals by version' });
    }
  }

  async getVersions(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const versions = await repo.getVersions();
      res.json({ versions });
    } catch (err: any) {
      log.error({ err }, 'GET /vitals/versions failed');
      res.status(500).json({ error: 'Failed to fetch versions' });
    }
  }
}
