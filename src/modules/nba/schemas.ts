import { z } from 'zod';

export const savePicksSchema = z.object({
  picks: z.record(z.string(), z.unknown()).refine(
    (val) => val !== null && typeof val === 'object' && !Array.isArray(val),
    { message: 'picks must be a plain object' },
  ),
  displayName: z.string().optional(),
});

export type SavePicksInput = z.infer<typeof savePicksSchema>;

export const saveResultsSchema = z.object({
  picks: z.record(z.string(), z.unknown()).refine(
    (val) => val !== null && typeof val === 'object' && !Array.isArray(val),
    { message: 'picks must be a plain object' },
  ),
});

export type SaveResultsInput = z.infer<typeof saveResultsSchema>;
