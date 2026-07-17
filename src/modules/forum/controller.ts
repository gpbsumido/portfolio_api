import type { Request, Response, NextFunction } from 'express';
import { ForumRepository } from './repository.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('forum');

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const repo = new ForumRepository();

export class ForumController {
  async getTables(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tables = await repo.getTables();
      res.status(200).json(tables);
    } catch (error) {
      next(error);
    }
  }

  async getTableSchema(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tableName = param(req.params.tableName);
      const columns = await repo.getTableSchema(tableName);
      res.status(200).json(columns);
    } catch (error) {
      next(error);
    }
  }

  async getForumPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      if (page < 1 || limit < 1) {
        throw new ValidationError('page and limit must be positive integers');
      }

      const { data, totalCount } = await repo.getForumPosts(page, limit);
      res.status(200).json({
        data,
        meta: {
          total_count: totalCount,
          current_page: page,
          per_page: limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async createForumPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, text } = req.body;
      const username = (req as any).auth.payload.sub as string;

      if (!title || !text) {
        throw new ValidationError('Missing required fields: title, text');
      }

      const post = await repo.createForumPost(title, text, username);
      res.status(201).json(post);
    } catch (error) {
      next(error);
    }
  }

  async createMarker(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { latitude, longitude, text } = req.body;

      if (!latitude || !longitude || !text) {
        throw new ValidationError('Missing required fields: latitude, longitude, text');
      }

      const marker = await repo.createMarker(latitude, longitude, text);
      res.status(201).json(marker);
    } catch (error) {
      log.error({ err: error }, 'failed to save marker');
      next(error);
    }
  }

  async getMarkers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const markers = await repo.getMarkers();
      res.status(200).json(markers);
    } catch (error) {
      log.error({ err: error }, 'failed to fetch markers');
      next(error);
    }
  }

  async deleteMarker(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = param(req.params.id);
      const deleted = await repo.deleteMarker(id);

      if (!deleted) {
        throw new NotFoundError('Marker not found');
      }

      res.status(200).json({ message: 'Marker deleted successfully', deleted });
    } catch (error) {
      next(error);
    }
  }
}
