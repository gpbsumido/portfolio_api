import { z } from 'zod';

/**
 * Body fields for saving a wall. The photos themselves arrive as multipart files
 * (handled by multer, keyed by image id), so only the text fields are validated
 * here. `state` is the arranger's serialized gallery as a JSON string; the
 * controller parses and shape-checks it.
 */
export const createWallSchema = z.object({
  name: z.string({ required_error: 'name is required' }).min(1, 'name must not be empty'),
  state: z.string({ required_error: 'state is required' }).min(1, 'state must not be empty'),
});

/** Update allows a rename, a new state, or both; either may be omitted. */
export const updateWallSchema = z.object({
  name: z.string().min(1, 'name must not be empty').optional(),
  state: z.string().min(1, 'state must not be empty').optional(),
});

export type CreateWallInput = z.infer<typeof createWallSchema>;
export type UpdateWallInput = z.infer<typeof updateWallSchema>;
