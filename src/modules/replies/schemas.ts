import { z } from 'zod';

/** Body for creating a reply. */
export const createReplySchema = z.object({
  content: z.string().trim().min(1, 'reply cannot be empty').max(500),
});

export type CreateReplyInput = z.infer<typeof createReplySchema>;
