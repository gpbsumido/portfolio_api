import { z } from 'zod';

/**
 * Validates the body fields of the gallery create endpoint.
 * Note: the file itself is handled by multer (multipart), not by this schema.
 */
export const createGalleryItemSchema = z.object({
  text: z.string({ required_error: 'text is required' }).min(1, 'text must not be empty'),
  description: z.string({ required_error: 'description is required' }).min(1, 'description must not be empty'),
  date: z.string({ required_error: 'date is required' }).refine(
    (val) => !isNaN(new Date(val).getTime()),
    { message: 'Invalid date format' },
  ),
});

export type CreateGalleryItemInput = z.infer<typeof createGalleryItemSchema>;
