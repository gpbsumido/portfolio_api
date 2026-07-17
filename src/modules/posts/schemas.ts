import { z } from 'zod';

export const createPostSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z
      .string({ required_error: 'content is required' })
      .trim()
      .min(1, 'content must be at least 1 character')
      .max(500, 'content must be 500 characters or fewer'),
    caption: z
      .string()
      .trim()
      .max(2200, 'caption must be 2200 characters or fewer')
      .optional(),
  }),
  z.object({
    type: z.literal('photo'),
    caption: z
      .string()
      .trim()
      .max(2200, 'caption must be 2200 characters or fewer')
      .optional(),
  }),
]);

export type CreatePostInput = z.infer<typeof createPostSchema>;
