import { z } from 'zod';

// Wire contract for the adjustments endpoints. delta_pct is bounded so a typo
// can't wipe or 10x a player's projection; the multiplier applied downstream is
// (1 + deltaPct/100), so -100 zeroes a player and +100 doubles them.
const categorySchema = z.enum(['injury', 'ripple', 'camp', 'context']);
const confidenceSchema = z.enum(['high', 'med', 'low']);

export const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const patchStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const adjustmentInputSchema = z.object({
  player: z.string().min(1),
  team: z.string().nullish(),
  position: z.string().nullish(),
  category: categorySchema,
  note: z.string().min(1),
  sourceUrl: z.string().url().nullish(),
  deltaPct: z.number().min(-100).max(100),
  beneficiaryOf: z.string().nullish(),
  confidence: confidenceSchema,
});

export const postBatchSchema = z.object({
  batchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'batchDate must be YYYY-MM-DD'),
  items: z.array(adjustmentInputSchema).min(1).max(200),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
export type PatchStatusBody = z.infer<typeof patchStatusSchema>;
export type PostBatchBody = z.infer<typeof postBatchSchema>;
