import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';
import type { ImportReviewsInput, ReviewParams, SaveReviewInput } from './schemas.js';

const subOf = (req: Request): string =>
  (req as { auth?: { payload?: { sub?: string } } }).auth?.payload?.sub as string;

export class PracticeController {
  /** GET /api/practice/reviews — the caller's reviews. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ reviews: await repo.listReviews(subOf(req)) });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/practice/reviews/:kind/:itemId — store one review. */
  async save(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { kind, itemId } = req.params as ReviewParams;
      const state = req.body as SaveReviewInput;
      res.json({ review: await repo.saveReview(subOf(req), { kind, itemId, ...state }) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/practice/reviews/import — merge a browser's local progress. */
  async import(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reviews } = req.body as ImportReviewsInput;
      res.json({ reviews: await repo.importReviews(subOf(req), reviews) });
    } catch (err) {
      next(err);
    }
  }
}
