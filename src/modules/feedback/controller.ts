import type { Request, Response, NextFunction } from 'express';
import { FeedbackRepository } from './repository.js';

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const repo = new FeedbackRepository();

export class FeedbackController {
  async list(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const { page = '1', limit = '10', rotation, searchTerm } = req.query as Record<string, string>;
      const userSub = (req as any).auth.payload.sub as string;
      if (!userSub) {
        res.status(401).json({ error: 'Unauthorized: No user sub found' });
        return;
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
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  }

  async create(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const { text, rotation, journal_entry_id } = req.body;
      const userSub = (req as any).auth.payload.sub as string;
      if (!text || !rotation) {
        res.status(400).json({ error: 'Missing required fields: text, rotation' });
        return;
      }
      const feedback = await repo.add({ text, rotation, journal_entry_id, user_sub: userSub });
      res.status(201).json({ success: true, feedback });
    } catch (error) {
      console.error('Error adding feedback:', error);
      res.status(500).json({ error: 'Failed to add feedback' });
    }
  }

  async update(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const id = param(req.params.id);
      const { text, rotation, journal_entry_id } = req.body;
      const userSub = (req as any).auth.payload.sub as string;
      if (!text || !rotation) {
        res.status(400).json({ error: 'Missing required fields: text, rotation' });
        return;
      }
      const feedback = await repo.update(id, { text, rotation, journal_entry_id, user_sub: userSub });
      res.status(200).json({ success: true, feedback });
    } catch (error: any) {
      console.error('Error updating feedback:', error);
      if (error.message === 'Feedback not found or unauthorized') {
        res.status(404).json({ error: 'Feedback not found or unauthorized' });
      } else {
        res.status(500).json({ error: 'Failed to update feedback' });
      }
    }
  }

  async remove(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const id = param(req.params.id);
      await repo.delete(id);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting feedback:', error);
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  }
}
