import type { Request, Response, NextFunction } from 'express';
import { FeedbackRepository } from './repository.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('feedback');

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const repo = new FeedbackRepository();

export class FeedbackController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = '1', limit = '10', rotation, searchTerm } = req.query as Record<string, string>;
      const userSub = (req as any).auth.payload.sub as string;
      if (!userSub) {
        throw new UnauthorizedError('Unauthorized: No user sub found');
      }
      const { feedback, totalCount } = await repo.findWithPagination(
        Number(page),
        Number(limit),
        rotation,
        userSub,
        searchTerm,
      );
      res.status(200).json({ success: true, feedback, totalCount });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, rotation, journal_entry_id } = req.body;
      const userSub = (req as any).auth.payload.sub as string;
      if (!text || !rotation) {
        throw new ValidationError('Missing required fields: text, rotation');
      }
      const feedback = await repo.add({ text, rotation, journal_entry_id, user_sub: userSub });
      res.status(201).json({ success: true, feedback });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = param(req.params.id);
      const { text, rotation, journal_entry_id } = req.body;
      const userSub = (req as any).auth.payload.sub as string;
      if (!text || !rotation) {
        throw new ValidationError('Missing required fields: text, rotation');
      }
      const feedback = await repo.update(id, { text, rotation, journal_entry_id, user_sub: userSub });
      res.status(200).json({ success: true, feedback });
    } catch (error: any) {
      if (error.message === 'Feedback not found or unauthorized') {
        return next(new NotFoundError('Feedback not found or unauthorized'));
      }
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = param(req.params.id);
      await repo.delete(id);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
