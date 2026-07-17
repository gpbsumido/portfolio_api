import type { Request, Response, NextFunction } from 'express';
import { MedJournalRepository } from './repository.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('medical-journal');

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const repo = new MedJournalRepository();

export class MedJournalController {
  async saveEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    const entry = req.body;
    const userSub = (req as any).auth.payload.sub as string;

    try {
      if (entry.feedbackText) {
        entry.feedback = [{ text: entry.feedbackText, rotation: entry.rotation }];
      }
      const savedEntry = await repo.saveOrUpdate(entry, userSub);
      res.status(200).json({ success: true, entry: savedEntry });
    } catch (error) {
      log.error({ err: error }, 'failed to save entry');
      next(error);
    }
  }

  async deleteEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = param(req.params.id);
    const userSub = (req as any).auth.payload.sub as string;

    try {
      await repo.delete(id, userSub);
      res.status(200).json({ success: true });
    } catch (error) {
      log.error({ err: error }, 'failed to delete entry');
      next(error);
    }
  }

  async getEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = param(req.params.id);
    const userSub = (req as any).auth.payload.sub as string;

    try {
      const entry = await repo.findById(id, userSub);
      if (!entry) {
        throw new NotFoundError('Entry not found');
      }
      res.status(200).json({ success: true, entry });
    } catch (error) {
      next(error);
    }
  }

  async listEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { page = '1', limit = '10', searchTerm, rotation } = req.query as Record<string, string>;
    const userSub = (req as any).auth.payload.sub as string;

    try {
      const entries = await repo.findWithPagination(
        Number(page),
        Number(limit),
        userSub,
        searchTerm,
        rotation,
      );
      res.status(200).json({ success: true, entries });
    } catch (error) {
      log.error({ err: error }, 'failed to fetch entries');
      next(error);
    }
  }

  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).auth.sub as string;
      res.json({
        message: 'Authenticated successfully!',
        userId,
      });
    } catch (error: any) {
      next(error);
    }
  }
}
