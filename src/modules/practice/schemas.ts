import { z } from 'zod';

export const kindSchema = z.enum(['problem', 'drill']);
const itemIdSchema = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug');

/** Where one item sits on the ladder. Strict so a typo is a 400, not a no-op. */
export const saveReviewSchema = z
  .object({
    step: z.number().int().min(0).max(50),
    dueAt: z.string().datetime(),
    lastReviewedAt: z.string().datetime(),
    reviews: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const reviewParamsSchema = z.object({ kind: kindSchema, itemId: itemIdSchema });

/**
 * A browser's local progress, sent once after sign-in. The same item twice in
 * one batch is refused: Postgres won't update one row twice in a single
 * upsert, and there's no right answer for which copy was meant.
 */
export const importReviewsSchema = z
  .object({
    reviews: z
      .array(saveReviewSchema.extend({ kind: kindSchema, itemId: itemIdSchema }).strict())
      .min(1)
      .max(2000),
  })
  .strict()
  .refine(
    ({ reviews }) => new Set(reviews.map((r) => `${r.kind}:${r.itemId}`)).size === reviews.length,
    { message: 'Each item can appear once per import', path: ['reviews'] },
  );

export type ReviewParams = z.infer<typeof reviewParamsSchema>;
export type SaveReviewInput = z.infer<typeof saveReviewSchema>;
export type ImportReviewsInput = z.infer<typeof importReviewsSchema>;
