// The row as Postgres returns it, and the camelCase shape the BFF consumes.
// The mapper lives in repository.ts.

import type { z } from 'zod';
import type { kindSchema } from './schemas.js';

export type ReviewKind = z.infer<typeof kindSchema>;

export type PracticeReviewRow = {
  kind: ReviewKind;
  item_id: string;
  step: number;
  due_at: Date;
  last_reviewed_at: Date;
  reviews: number;
};

export type PracticeReview = {
  kind: ReviewKind;
  itemId: string;
  step: number;
  dueAt: string;
  lastReviewedAt: string;
  reviews: number;
};
